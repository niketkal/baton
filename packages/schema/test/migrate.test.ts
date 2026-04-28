import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, NoMigrationPathError, migrate } from '../src/migrate.js';

const fixturePath = fileURLToPath(new URL('./fixtures/minimal-valid-packet.json', import.meta.url));
const validPacket = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;

describe('migrate', () => {
  it('returns the input unchanged with zero warnings on a v1→v1 no-op', () => {
    const result = migrate(validPacket, 'baton.packet/v1', 'baton.packet/v1');
    expect(result.warnings).toEqual([]);
    // The 000-noop migration returns the same object reference; equality
    // here also guards against accidental cloning that would break
    // perf-sensitive callers.
    expect(result.migrated).toBe(validPacket);
  });

  it('throws NoMigrationPathError when no chain exists', () => {
    let caught: unknown;
    try {
      migrate(validPacket, 'baton.packet/v1', 'baton.packet/v999');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NoMigrationPathError);
    if (caught instanceof NoMigrationPathError) {
      expect(caught.from).toBe('baton.packet/v1');
      expect(caught.to).toBe('baton.packet/v999');
    }
  });
});

describe('MIGRATIONS', () => {
  it('contains exactly the explicitly registered migrations', () => {
    // This test guards the explicit-import discipline (no glob).
    // When a migration is added, update both the registry AND this count.
    expect(MIGRATIONS).toHaveLength(1);
    const noop = MIGRATIONS[0];
    expect(noop?.from).toBe('baton.packet/v1');
    expect(noop?.to).toBe('baton.packet/v1');
  });

  it('is frozen so consumers cannot mutate it', () => {
    expect(Object.isFrozen(MIGRATIONS)).toBe(true);
  });
});
