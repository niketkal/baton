import { mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Warning } from '@baton/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BATON_DIR,
  CURRENT_SCHEMA_VERSION,
  PACKETS_DIR,
  PACKET_JSON,
  PACKET_MD,
  PROVENANCE_JSON,
  PacketStore,
  STATE_DB_FILE,
  WARNINGS_JSON,
} from '../src/index.js';
import { makePacket } from './fixtures/packets.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'baton-store-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function packetPath(id: string, file: string): string {
  return join(root, BATON_DIR, PACKETS_DIR, id, file);
}

describe('PacketStore.open', () => {
  it('creates the .baton directory layout and runs migrations', () => {
    const store = PacketStore.open(root);
    try {
      expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(statSync(join(root, BATON_DIR, PACKETS_DIR)).isDirectory()).toBe(true);
      expect(statSync(join(root, BATON_DIR, STATE_DB_FILE)).isFile()).toBe(true);
    } finally {
      store.close();
    }
  });

  it('is idempotent across re-opens', () => {
    PacketStore.open(root).close();
    const store = PacketStore.open(root);
    try {
      expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      store.close();
    }
  });
});

describe('PacketStore CRUD', () => {
  it('writes the four canonical files on create()', () => {
    const store = PacketStore.open(root);
    try {
      store.create(makePacket({ id: 'pkt-001', title: 'First' }));
      for (const file of [PACKET_JSON, PACKET_MD, WARNINGS_JSON, PROVENANCE_JSON]) {
        expect(statSync(packetPath('pkt-001', file)).isFile()).toBe(true);
      }
      const onDisk = JSON.parse(readFileSync(packetPath('pkt-001', PACKET_JSON), 'utf8'));
      expect(onDisk.title).toBe('First');
    } finally {
      store.close();
    }
  });

  it('round-trips a packet via read()', () => {
    const store = PacketStore.open(root);
    try {
      const packet = makePacket({
        id: 'pkt-002',
        title: 'Round trip',
        warnings: [
          {
            code: 'BTN001',
            severity: 'warning',
            message: 'noisy',
            blocking: false,
            source: 'lint',
          },
        ],
      });
      store.create(packet);
      const fetched = store.read('pkt-002');
      expect(fetched).toEqual(packet);
    } finally {
      store.close();
    }
  });

  it('lists packets via the SQLite index, newest updated first', () => {
    const store = PacketStore.open(root);
    try {
      store.create(makePacket({ id: 'pkt-a', updated_at: '2026-04-25T00:00:00Z' }));
      store.create(makePacket({ id: 'pkt-b', updated_at: '2026-04-27T00:00:00Z' }));
      store.create(makePacket({ id: 'pkt-c', updated_at: '2026-04-26T00:00:00Z' }));
      const ids = store.list().map((s) => s.id);
      expect(ids).toEqual(['pkt-b', 'pkt-c', 'pkt-a']);
    } finally {
      store.close();
    }
  });

  it('refuses duplicate creates and unknown updates', () => {
    const store = PacketStore.open(root);
    try {
      store.create(makePacket({ id: 'pkt-dup' }));
      expect(() => store.create(makePacket({ id: 'pkt-dup' }))).toThrow(/already exists/);
      expect(() => store.update(makePacket({ id: 'pkt-missing' }))).toThrow(/does not exist/);
    } finally {
      store.close();
    }
  });

  it('rejects ids that do not match the canonical pattern', () => {
    const store = PacketStore.open(root);
    try {
      expect(() => store.read('Bad ID with spaces')).toThrow(/Invalid packet id/);
    } finally {
      store.close();
    }
  });

  it('updateWarnings rewrites packet.json, warnings.json, and the index summary', () => {
    const store = PacketStore.open(root);
    try {
      store.create(makePacket({ id: 'pkt-warn', warnings: [] }));
      const warnings: Warning[] = [
        { code: 'BTN042', severity: 'error', message: 'broken', blocking: true, source: 'lint' },
        { code: 'BTN013', severity: 'info', message: 'fyi', blocking: false, source: 'schema' },
      ];
      store.updateWarnings('pkt-warn', warnings, '2026-04-28T00:00:00Z');

      const packet = store.read('pkt-warn');
      expect(packet.warnings).toEqual(warnings);
      expect(packet.updated_at).toBe('2026-04-28T00:00:00Z');

      const sidecar = JSON.parse(readFileSync(packetPath('pkt-warn', WARNINGS_JSON), 'utf8'));
      expect(sidecar).toEqual(warnings);

      const summary = store.list().find((s) => s.id === 'pkt-warn');
      expect(summary?.warning_count).toBe(2);
      expect(summary?.blocking_warning_count).toBe(1);
    } finally {
      store.close();
    }
  });
});

describe('Index rebuild (files-canonical invariant)', () => {
  it('rebuilds an identical index after state.db is deleted', () => {
    const first = PacketStore.open(root);
    try {
      first.create(makePacket({ id: 'pkt-1', title: 'One' }));
      first.create(
        makePacket({
          id: 'pkt-2',
          title: 'Two',
          updated_at: '2026-04-28T12:00:00Z',
          warnings: [
            { code: 'BTN001', severity: 'error', message: 'x', blocking: true, source: 'lint' },
          ],
        }),
      );
      first.create(makePacket({ id: 'pkt-3', title: 'Three', updated_at: '2026-04-26T12:00:00Z' }));
    } finally {
      first.close();
    }

    const beforeList = (() => {
      const s = PacketStore.open(root);
      try {
        return s.list();
      } finally {
        s.close();
      }
    })();

    unlinkSync(join(root, BATON_DIR, STATE_DB_FILE));

    const rebuilt = PacketStore.open(root);
    try {
      const afterList = rebuilt.list();
      expect(afterList).toEqual(beforeList);

      // Packet contents are still readable and identical.
      for (const summary of afterList) {
        const packet = rebuilt.read(summary.id);
        expect(packet.id).toBe(summary.id);
        expect(packet.warnings.length).toBe(summary.warning_count);
      }
    } finally {
      rebuilt.close();
    }
  });

  it('rebuildIndex() returns the count of indexed packets', () => {
    const store = PacketStore.open(root);
    try {
      store.create(makePacket({ id: 'pkt-x' }));
      store.create(makePacket({ id: 'pkt-y' }));
      expect(store.rebuildIndex()).toBe(2);
    } finally {
      store.close();
    }
  });
});

describe('Migration runner', () => {
  it('reports the current schema version', () => {
    const store = PacketStore.open(root);
    try {
      expect(store.schemaVersion).toBeGreaterThanOrEqual(1);
      expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      store.close();
    }
  });
});
