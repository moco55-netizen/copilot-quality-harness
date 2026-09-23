import Database from 'better-sqlite3';

export function createDatabase(filename = ':memory:') {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'passed', 'failed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return db;
}
