const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('GET / serves the release dashboard', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.type, /html/);
  assert.match(res.text, /Release Control Center/);
});

test('GET /healthz returns ok', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('GET /version returns version & commit', async () => {
  const res = await request(app).get('/version');
  assert.equal(res.status, 200);
  assert.ok(res.body.version);
  assert.ok(res.body.commit);
});
