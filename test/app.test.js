const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function sampleRun() {
  return {
    id: 123,
    run_number: 42,
    name: 'CI/CD Pipeline',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'abcdef1234567890',
    head_branch: 'main',
    actor: { login: 'abhinavs1703' },
    created_at: '2026-10-07T10:00:00Z',
    updated_at: '2026-10-07T10:01:00Z',
    run_started_at: '2026-10-07T10:00:05Z',
    html_url: 'https://github.com/abhinavs1703/ci-cd-testing-deployment-pipeline/actions/runs/123',
    display_title: 'Update dashboard',
  };
}

test('GET / serves the operations dashboard', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.type, /html/);
  assert.match(res.text, /CI/CD Pipeline Status/);
  assert.match(res.text, /Run history/);
  assert.match(res.text, /Endpoint checks/);
  assert.doesNotMatch(res.text, /From commit to production, automatically/);
});

test('GET /healthz returns ok', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('GET /version returns version and commit', async () => {
  const res = await request(app).get('/version');
  assert.equal(res.status, 200);
  assert.ok(res.body.version);
  assert.ok(res.body.commit);
});

test('GET /api/pipeline returns runs, jobs, comparison and error shape', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalCommit = process.env.GIT_COMMIT;
  app.resetPipelineCache();
  process.env.GIT_COMMIT = 'running123456789';

  global.fetch = async (url) => {
    if (url.includes('/actions/runs?')) return response({ workflow_runs: [sampleRun()] });
    if (url.includes('/actions/runs/123/jobs')) {
      return response({
        jobs: [{
          id: 456,
          name: 'Test application',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-10-07T10:00:05Z',
          completed_at: '2026-10-07T10:00:25Z',
          html_url: 'https://github.com/example/job/456',
          steps: [{
            name: 'Run automated tests',
            status: 'completed',
            conclusion: 'success',
            number: 1,
            started_at: '2026-10-07T10:00:10Z',
            completed_at: '2026-10-07T10:00:20Z',
          }],
        }],
      });
    }
    if (url.includes('/compare/running123456789...abcdef1234567890')) {
      return response({ status: 'behind', ahead_by: 0, behind_by: 2 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const res = await request(app).get('/api/pipeline');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['comparison', 'error', 'jobs', 'runs']);
    assert.equal(res.body.error, null);
    assert.equal(res.body.runs.length, 1);
    assert.equal(res.body.runs[0].actor, 'abhinavs1703');
    assert.match(res.body.runs[0].commit_url, /\/commit\/abcdef/);
    assert.equal(res.body.jobs.length, 1);
    assert.equal(res.body.jobs[0].steps.length, 1);
    assert.equal(res.body.comparison.behind_by, 2);
  } finally {
    global.fetch = originalFetch;
    if (originalCommit === undefined) delete process.env.GIT_COMMIT;
    else process.env.GIT_COMMIT = originalCommit;
    app.resetPipelineCache();
  }
});

test('GET /api/pipeline returns cached data and an error when GitHub is unreachable', { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const originalCommit = process.env.GIT_COMMIT;
  app.resetPipelineCache();
  delete process.env.GIT_COMMIT;
  let now = 1000;
  Date.now = () => now;

  global.fetch = async (url) => {
    if (url.includes('/actions/runs?')) return response({ workflow_runs: [sampleRun()] });
    return response({ jobs: [] });
  };

  try {
    const first = await request(app).get('/api/pipeline');
    assert.equal(first.body.runs.length, 1);

    now += 61 * 1000;
    global.fetch = async () => {
      throw new Error('network unavailable');
    };

    const second = await request(app).get('/api/pipeline');
    assert.equal(second.status, 200);
    assert.equal(second.body.runs.length, 1);
    assert.match(second.body.error, /network unavailable/);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
    if (originalCommit === undefined) delete process.env.GIT_COMMIT;
    else process.env.GIT_COMMIT = originalCommit;
    app.resetPipelineCache();
  }
});
