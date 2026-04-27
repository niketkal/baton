import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_index',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS packets (
          id                       TEXT PRIMARY KEY,
          title                    TEXT NOT NULL,
          status                   TEXT NOT NULL,
          validation_level         TEXT NOT NULL,
          task_type                TEXT NOT NULL,
          confidence_score         REAL NOT NULL,
          warning_count            INTEGER NOT NULL,
          blocking_warning_count   INTEGER NOT NULL,
          created_at               TEXT NOT NULL,
          updated_at               TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_packets_status ON packets(status);
        CREATE INDEX IF NOT EXISTS idx_packets_updated_at ON packets(updated_at);
      `);
    },
  },
];

export const CURRENT_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

export function runMigrations(db: Database): number {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const getVersionStmt = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`);
  const setVersionStmt = db.prepare(
    `INSERT INTO meta(key, value) VALUES('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const row = getVersionStmt.get() as { value: string } | undefined;
  let current = row ? Number.parseInt(row.value, 10) : 0;
  if (Number.isNaN(current)) current = 0;

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  if (pending.length === 0) return current;

  const tx = db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      setVersionStmt.run(String(m.version));
      current = m.version;
    }
  });
  tx();
  return current;
}
