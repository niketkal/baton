import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/index.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'schema',
  'test',
  'fixtures',
  'minimal-valid-packet.json',
);

describe('migrate command', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-migrate-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('returns 0 and leaves a v1 packet unchanged with a no-op chain', async () => {
    const packetId = 'demo-packet-001';
    const packetDir = join(dir, '.baton', 'packets', packetId);
    mkdirSync(packetDir, { recursive: true });
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    const packetFile = join(packetDir, 'packet.json');
    writeFileSync(packetFile, fixture, 'utf8');
    const before = readFileSync(packetFile, 'utf8');

    const code = await main(['node', 'baton', 'migrate', '--packet', packetId, '--repo', dir]);
    expect(code).toBe(0);

    const after = readFileSync(packetFile, 'utf8');
    expect(after).toBe(before);

    // The no-op chain produces no on-disk change, so no history snapshot
    // is written (we only snapshot when bytes change).
    const histDir = join(dir, '.baton', 'history', 'packets', packetId);
    expect(existsSync(histDir)).toBe(false);
  });

  it('writes a history snapshot when the migrated bytes differ', async () => {
    // Force a change by passing a packet whose serialization differs from
    // what stableStringify (2-space JSON + trailing newline) produces.
    // The no-op `up()` returns the same object, but our re-serialization
    // matches input byte-for-byte too, so we need a packet that the JSON
    // round-trip would re-format. Use a compact (no-whitespace) input.
    const packetId = 'demo-packet-001';
    const packetDir = join(dir, '.baton', 'packets', packetId);
    mkdirSync(packetDir, { recursive: true });
    const fixtureObj = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as object;
    writeFileSync(join(packetDir, 'packet.json'), JSON.stringify(fixtureObj), 'utf8');

    const code = await main(['node', 'baton', 'migrate', '--packet', packetId, '--repo', dir]);
    expect(code).toBe(0);

    const histDir = join(dir, '.baton', 'history', 'packets', packetId);
    expect(existsSync(histDir)).toBe(true);
    const snaps = readdirSync(histDir);
    expect(snaps).toContain('v1.json');
  });

  it('returns 1 when the packet is missing', async () => {
    const code = await main([
      'node',
      'baton',
      'migrate',
      '--packet',
      'does-not-exist',
      '--repo',
      dir,
    ]);
    expect(code).toBe(1);
  });

  it('returns 1 when no migration path exists to the requested target', async () => {
    const packetId = 'demo-packet-001';
    const packetDir = join(dir, '.baton', 'packets', packetId);
    mkdirSync(packetDir, { recursive: true });
    writeFileSync(join(packetDir, 'packet.json'), readFileSync(FIXTURE_PATH, 'utf8'), 'utf8');

    const code = await main([
      'node',
      'baton',
      'migrate',
      '--packet',
      packetId,
      '--to',
      'baton.packet/v999',
      '--repo',
      dir,
    ]);
    expect(code).toBe(1);
  });
});
