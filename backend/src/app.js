import express from 'express';
import { createDatabase } from './db.js';

export function createApp(db = createDatabase()) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/checks', (_request, response) => {
    response.json(db.prepare('SELECT id, name, status, created_at AS createdAt FROM checks ORDER BY id DESC').all());
  });
  app.post('/api/checks', (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name || name.length > 120) return response.status(400).json({ error: 'name must be between 1 and 120 characters' });
    const result = db.prepare('INSERT INTO checks (name) VALUES (?)').run(name);
    return response.status(201).json(db.prepare('SELECT id, name, status, created_at AS createdAt FROM checks WHERE id = ?').get(result.lastInsertRowid));
  });
  return app;
}
