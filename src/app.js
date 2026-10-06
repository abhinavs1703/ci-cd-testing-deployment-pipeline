const express = require('express');
const path = require('node:path');
const pkg = require('../package.json');

const app = express();

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
  try {
    const response = await fetch(
      'https://api.github.com/repos/abhinavs1703/ci-cd-testing-deployment-pipeline/actions/runs?per_page=1',
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ci-cd-pipeline-dashboard' } }
    );

    if (!response.ok) {
      return res.status(200).json({ run: null, jobs: [] });
    }

    const data = await response.json();
    const run = data.workflow_runs?.[0] || null;

    if (!run) {
      return res.json({ run: null, jobs: [] });
    }

    const jobsResponse = await fetch(
      `https://api.github.com/repos/abhinavs1703/ci-cd-testing-deployment-pipeline/actions/runs/${run.id}/jobs?per_page=20`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ci-cd-pipeline-dashboard' } }
    );

    const jobsData = jobsResponse.ok ? await jobsResponse.json() : { jobs: [] };
    res.json({ run, jobs: jobsData.jobs || [] });
  } catch (_error) {
    res.status(200).json({ run: null, jobs: [] });
  }
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
