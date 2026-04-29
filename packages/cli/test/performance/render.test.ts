import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BIN, BUDGETS, PKG_ROOT, ensureBuilt } from './_helpers.js';

const PACKET_FIXTURE = resolve(
  PKG_ROOT,
  '..',
  'render',
  'test',
  'fixtures',
  'packet-fixture-01.json',
);

function seedPacket(repo: string, packetId: string): void {
  // See lint.test.ts seedPacket for why this is `.baton/.baton/packets/`.
  const dir = join(repo, '.baton', '.baton', 'packets', packetId);
  mkdirSync(dir, { recursive: true });
  const raw = JSON.parse(readFileSync(PACKET_FIXTURE, 'utf8')) as Record<string, unknown>;
  raw.id = packetId;
  writeFileSync(join(dir, 'packet.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(join(dir, 'warnings.json'), '[]\n');
  writeFileSync(join(dir, 'provenance.json'), '[]\n');
  writeFileSync(join(dir, 'packet.md'), `# ${packetId}\n`);
}

describe('performance: baton render', () => {
  let dir: string;

  beforeAll(() => {
    ensureBuilt();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-render-'));
    seedPacket(dir, 'demo');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    'render completes under the 100ms tech-spec budget (pure function)',
    () => {
      const start = Date.now();
      const r = spawnSync(
        process.execPath,
        [BIN, 'render', '--packet', 'demo', '--target', 'generic', '--stdout', '--repo', dir],
        { encoding: 'utf8' },
      );
      const elapsed = Date.now() - start;
      expect(r.status, `stderr: ${r.stderr}`).toBe(0);
      expect(elapsed).toBeLessThan(BUDGETS.render);
    },
  );
});
