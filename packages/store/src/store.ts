import { mkdirSync, statSync } from 'node:fs';
import type { BatonPacket, Warning } from '@baton/schema';
import type { Database } from 'better-sqlite3';
import { IndexQueries, type PacketSummary, openDatabase, summarize } from './db.js';
import {
  listPacketIdsOnDisk,
  readPacketFile,
  rewriteWarningsFile,
  writePacketFiles,
} from './files.js';
import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations.js';
import { type StorePaths, assertValidPacketId, resolvePaths } from './paths.js';

export interface StoreOpenOptions {
  /**
   * If true and `state.db` does not exist (or is empty), rebuild the index by
   * walking the packet file tree. Defaults to true — files are canonical and
   * the index must always recover.
   */
  autoRebuild?: boolean;
}

export class PacketStore {
  readonly paths: StorePaths;
  readonly schemaVersion: number;
  private readonly db: Database;
  private readonly index: IndexQueries;
  private closed = false;

  private constructor(paths: StorePaths, db: Database, schemaVersion: number) {
    this.paths = paths;
    this.db = db;
    this.schemaVersion = schemaVersion;
    this.index = new IndexQueries(db);
  }

  static open(rootDir: string, options: StoreOpenOptions = {}): PacketStore {
    const paths = resolvePaths(rootDir);
    mkdirSync(paths.packets, { recursive: true });
    const dbExisted = fileExists(paths.db);
    const db = openDatabase(paths.db);
    const schemaVersion = runMigrations(db);
    const store = new PacketStore(paths, db, schemaVersion);
    const autoRebuild = options.autoRebuild ?? true;
    if (autoRebuild && (!dbExisted || store.index.list().length === 0)) {
      store.rebuildIndex();
    }
    return store;
  }

  create(packet: BatonPacket): void {
    this.assertOpen();
    assertValidPacketId(packet.id);
    if (this.index.get(packet.id) !== undefined) {
      throw new Error(`Packet already exists: ${packet.id}`);
    }
    writePacketFiles(this.paths, packet);
    this.index.upsert(summarize(packet));
  }

  read(id: string): BatonPacket {
    this.assertOpen();
    assertValidPacketId(id);
    return readPacketFile(this.paths, id);
  }

  list(): PacketSummary[] {
    this.assertOpen();
    return this.index.list();
  }

  has(id: string): boolean {
    this.assertOpen();
    return this.index.get(id) !== undefined;
  }

  /**
   * Replace a packet's stored representation. The full packet must be supplied;
   * sidecars are rewritten from it.
   */
  update(packet: BatonPacket): void {
    this.assertOpen();
    assertValidPacketId(packet.id);
    if (this.index.get(packet.id) === undefined) {
      throw new Error(`Packet does not exist: ${packet.id}`);
    }
    writePacketFiles(this.paths, packet);
    this.index.upsert(summarize(packet));
  }

  /**
   * Replace just the warnings collection on an existing packet. Updates
   * `packet.json`, `warnings.json`, and the SQLite index in lockstep.
   */
  updateWarnings(id: string, warnings: Warning[], updatedAt?: string): void {
    this.assertOpen();
    assertValidPacketId(id);
    const packet = readPacketFile(this.paths, id);
    const next: BatonPacket = {
      ...packet,
      warnings,
      updated_at: updatedAt ?? new Date().toISOString(),
    };
    writePacketFiles(this.paths, next);
    rewriteWarningsFile(this.paths, id, warnings);
    this.index.upsert(summarize(next));
  }

  /**
   * Drop the SQLite index and rebuild it by walking the packet file tree.
   * Files are canonical: this must always succeed for a healthy file tree.
   */
  rebuildIndex(): number {
    this.assertOpen();
    const ids = listPacketIdsOnDisk(this.paths);
    const summaries: PacketSummary[] = [];
    for (const id of ids) {
      const packet = readPacketFile(this.paths, id);
      summaries.push(summarize(packet));
    }
    const tx = this.db.transaction(() => {
      this.index.clear();
      this.index.upsertMany(summaries);
    });
    tx();
    return summaries.length;
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('PacketStore is closed');
  }
}

export { CURRENT_SCHEMA_VERSION };

function fileExists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
