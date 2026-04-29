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
  // Files are canonical (CLAUDE.md invariant 1). Note: the CLI lint
  // command opens PacketStore at `<repo>/.baton`, and resolvePaths()
  // appends another `.baton`, so packets live at `<repo>/.baton/.baton/
  // packets/<id>/`. This matches the layout `compile` actually writes
  // to today (see compile e2e). If that double-`.baton` ever gets
  // fixed, this seed path needs to change in lockstep.
  const dir = join(repo, '.baton', '.baton', 'packets', packetId);
  mkdirSync(dir, { recursive: true });
  const raw = JSON.parse(readFileSync(PACKET_FIXTURE, 'utf8')) as Record<string, unknown>;
  raw.id = packetId;
  writeFileSync(join(dir, 'packet.json'), `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(join(dir, 'warnings.json'), '[]\n');
  writeFileSync(join(dir, 'provenance.json'), '[]\n');
  writeFileSync(join(dir, 'packet.md'), `# ${packetId}\n`);
}

describe('performance: baton lint', () => {
  let dir: string;

  beforeAll(() => {
    ensureBuilt();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-lint-'));
    seedPacket(dir, 'demo');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    'lint completes under the 200ms tech-spec budget over a typical packet',
    () => {
      const start = Date.now();
      const r = spawnSync(process.execPath, [BIN, 'lint', '--packet', 'demo', '--repo', dir], {
        encoding: 'utf8',
      });
      const elapsed = Date.now() - start;
      // lint exit code: 0 = passed, 2 = warnings/errors. The fixture
      // is well-formed but may emit warnings; either way we measure
      // completion time, not pass/fail. Accept 0 or 2.
      expect([0, 2]).toContain(r.status);
      expect(elapsed).toBeLessThan(BUDGETS.lint);
    },
  );
});
