import { createRequire } from 'node:module';
import type { BatonPacket } from '@baton/schema';
import type { Database, Statement } from 'better-sqlite3';

const require = createRequire(import.meta.url);
// better-sqlite3 ships as CJS with `export =`; require() is the cleanest path
// under ESM + verbatimModuleSyntax.
const BetterSqlite3 = require('better-sqlite3') as new (
  filename: string,
  opts?: { readonly?: boolean; fileMustExist?: boolean },
) => Database;

export interface PacketSummary {
  id: string;
  title: string;
  status: string;
  validation_level: string;
  task_type: string;
  confidence_score: number;
  warning_count: number;
  blocking_warning_count: number;
  created_at: string;
  updated_at: string;
}

export function openDatabase(path: string): Database {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function summarize(packet: BatonPacket): PacketSummary {
  let blocking = 0;
  for (const w of packet.warnings) if (w.blocking) blocking++;
  return {
    id: packet.id,
    title: packet.title,
    status: packet.status,
    validation_level: packet.validation_level,
    task_type: packet.task_type,
    confidence_score: packet.confidence_score,
    warning_count: packet.warnings.length,
    blocking_warning_count: blocking,
    created_at: packet.created_at,
    updated_at: packet.updated_at,
  };
}

export class IndexQueries {
  private readonly upsertStmt: Statement;
  private readonly deleteStmt: Statement;
  private readonly listStmt: Statement;
  private readonly getStmt: Statement;
  private readonly clearStmt: Statement;

  constructor(private readonly db: Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO packets (
        id, title, status, validation_level, task_type, confidence_score,
        warning_count, blocking_warning_count, created_at, updated_at
      ) VALUES (
        @id, @title, @status, @validation_level, @task_type, @confidence_score,
        @warning_count, @blocking_warning_count, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        validation_level = excluded.validation_level,
        task_type = excluded.task_type,
        confidence_score = excluded.confidence_score,
        warning_count = excluded.warning_count,
        blocking_warning_count = excluded.blocking_warning_count,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `);
    this.deleteStmt = db.prepare('DELETE FROM packets WHERE id = ?');
    this.listStmt = db.prepare('SELECT * FROM packets ORDER BY updated_at DESC, id ASC');
    this.getStmt = db.prepare('SELECT * FROM packets WHERE id = ?');
    this.clearStmt = db.prepare('DELETE FROM packets');
  }

  upsert(summary: PacketSummary): void {
    this.upsertStmt.run(summary);
  }

  upsertMany(summaries: readonly PacketSummary[]): void {
    const tx = this.db.transaction((rows: readonly PacketSummary[]) => {
      for (const row of rows) this.upsertStmt.run(row);
    });
    tx(summaries);
  }

  delete(id: string): void {
    this.deleteStmt.run(id);
  }

  list(): PacketSummary[] {
    return this.listStmt.all() as PacketSummary[];
  }

  get(id: string): PacketSummary | undefined {
    const row = this.getStmt.get(id);
    return (row as PacketSummary | undefined) ?? undefined;
  }

  clear(): void {
    this.clearStmt.run();
  }
}
