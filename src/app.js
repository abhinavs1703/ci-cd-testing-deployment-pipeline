const express = require('express');
const pkg = require('../package.json');

const app = express();

app.get('/', (_req, res) => {
  res.json({ message: 'hello, world' });
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/version', (_req, res) => {
  res.json({
    version: pkg.version,
    commit: process.env.GIT_COMMIT || 'dev',
  });
});

module.exports = app;
