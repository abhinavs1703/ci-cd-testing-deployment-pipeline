const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

test('GET / returns hello', async () => {
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'application/json');
  assert.deepEqual(res.body, { message: 'hello, world' });
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
