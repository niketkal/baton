import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BIN, BUDGETS, PKG_ROOT, ensureBuilt } from './_helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRANSCRIPT_FIXTURE = resolve(
  PKG_ROOT,
  '..',
  'compiler',
  'test',
  'fixtures',
  'transcript-claude-code-01.md',
);

describe('performance: baton compile --fast', () => {
  let dir: string;

  beforeAll(() => {
    ensureBuilt();
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-compile-fast-'));
    // Seed one transcript artifact so compile has input.
    const artDir = join(dir, '.baton', 'artifacts', 'art-001');
    mkdirSync(artDir, { recursive: true });
    writeFileSync(
      join(artDir, 'metadata.json'),
      JSON.stringify({ id: 'art-001', kind: 'transcript', file: 'transcript.md' }),
    );
    writeFileSync(join(artDir, 'transcript.md'), readFileSync(TRANSCRIPT_FIXTURE, 'utf8'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it.skipIf(process.env.CI === 'true' && process.platform === 'win32')(
    'compile --fast completes under the 1s tech-spec budget (no LLM call)',
    () => {
      const start = Date.now();
      const r = spawnSync(
        process.execPath,
        [BIN, 'compile', '--mode', 'fast', '--packet', 'demo', '--repo', dir],
        { encoding: 'utf8' },
      );
      const elapsed = Date.now() - start;
      expect(r.status, `stderr: ${r.stderr}`).toBe(0);
      expect(elapsed).toBeLessThan(BUDGETS.compileFast);
    },
  );
});
