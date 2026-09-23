import request from 'supertest';
import { afterEach, describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { createDatabase } from './db.js';

describe('checks API', () => {
  let db;
  let app;
  afterEach(() => db?.close());

  test('reports health', async () => {
    db = createDatabase(); app = createApp(db);
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('creates and lists a check', async () => {
    db = createDatabase(); app = createApp(db);
    const created = await request(app).post('/api/checks').send({ name: 'API contract' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'API contract', status: 'pending' });
    const listed = await request(app).get('/api/checks');
    expect(listed.body).toHaveLength(1);
  });

  test('rejects an empty name', async () => {
    db = createDatabase(); app = createApp(db);
    const response = await request(app).post('/api/checks').send({ name: ' ' });
    expect(response.status).toBe(400);
  });
});
