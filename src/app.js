const express = require('express');
const path = require('node:path');
const pkg = require('../package.json');

const app = express();

const GITHUB_API = 'https://api.github.com';
const REPOSITORY = 'abhinavs1703/ci-cd-testing-deployment-pipeline';
const CACHE_TTL_MS = 60 * 1000;

let pipelineCache = {
  timestamp: 0,
  data: { runs: [], jobs: [], comparison: null, error: null },
};

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ci-cd-pipeline-status-dashboard',
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function normalizeRun(run) {
  return {
    id: run.id,
    number: run.run_number,
    name: run.name || 'CI/CD Pipeline',
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha,
    head_branch: run.head_branch,
    actor: run.actor?.login || null,
    created_at: run.created_at,
    updated_at: run.updated_at,
    run_started_at: run.run_started_at,
    html_url: run.html_url,
    commit_url: run.head_sha ? `https://github.com/${REPOSITORY}/commit/${run.head_sha}` : null,
    display_title: run.display_title || run.name || 'CI/CD Pipeline',
  };
}

function normalizeJob(job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    started_at: job.started_at,
    completed_at: job.completed_at,
    html_url: job.html_url,
    steps: (job.steps || []).map((step) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      number: step.number,
      started_at: step.started_at,
      completed_at: step.completed_at,
    })),
  };
}

async function fetchGitHubJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const rateLimit = response.status === 403 || response.status === 429;
    const suffix = rateLimit ? ' GitHub may have rate-limited the request.' : '';
    throw new Error(`GitHub API returned HTTP ${response.status}.${suffix}`);
  }

  return response.json();
}

async function loadPipelineData() {
  const now = Date.now();
  if (pipelineCache.timestamp > 0 && now - pipelineCache.timestamp < CACHE_TTL_MS) {
    return pipelineCache.data;
  }

  try {
    const runsData = await fetchGitHubJson(
      `${GITHUB_API}/repos/${REPOSITORY}/actions/runs?event=push&branch=main&per_page=12`
    );
    const runs = (runsData.workflow_runs || []).map(normalizeRun);
    let jobs = [];
    let comparison = null;
    let error = null;

    if (runs[0]) {
      try {
        const jobsData = await fetchGitHubJson(
          `${GITHUB_API}/repos/${REPOSITORY}/actions/runs/${runs[0].id}/jobs?per_page=50`
        );
        jobs = (jobsData.jobs || []).map(normalizeJob);
      } catch (jobsError) {
        error = jobsError.message;
      }
    }

    const deployedCommit = process.env.GIT_COMMIT;
    if (deployedCommit && deployedCommit !== 'dev' && deployedCommit !== 'dev-build' && runs[0]?.head_sha && deployedCommit !== runs[0].head_sha) {
      try {
        comparison = await fetchGitHubJson(
          `${GITHUB_API}/repos/${REPOSITORY}/compare/${deployedCommit}...${runs[0].head_sha}`
        );
      } catch (comparisonError) {
        error = error ? `${error} ${comparisonError.message}` : comparisonError.message;
      }
    }

    const data = { runs, jobs, comparison, error };
    pipelineCache = { timestamp: now, data };
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load GitHub Actions data.';
    const cached = pipelineCache.data;
    return {
      runs: cached.runs,
      jobs: cached.jobs,
      comparison: cached.comparison,
      error: message,
    };
  }
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/version', (_req, res) => {
  res.json({
    version: pkg.version,
    commit: process.env.GIT_COMMIT || 'dev',
  });
});

app.get('/api/pipeline', async (_req, res) => {
  const data = await loadPipelineData();
  res.status(200).json(data);
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
module.exports.resetPipelineCache = () => {
  pipelineCache = {
    timestamp: 0,
    data: { runs: [], jobs: [], comparison: null, error: null },
  };
};
