import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..', '..');
const BIN = resolve(PKG_ROOT, 'dist', 'bin.js');

// Cold-start budget per tech spec §9.2: < 200ms for `--version`.
// Loosen on CI a bit (file system + npm cache are colder).
const isCi = process.env.CI === 'true' || process.env.CI === '1';
const BUDGET_MS = isCi ? 600 : 200;

describe('cold-start performance', () => {
  beforeAll(() => {
    if (!existsSync(BIN)) {
      // Build first so dist/bin.js exists. The repo build is the
      // source of truth; this is a defensive belt-and-braces step
      // for local invocation.
      execSync('pnpm build', { cwd: PKG_ROOT, stdio: 'inherit' });
    }
  });

  it('runs --version under the cold-start budget', () => {
    if (!existsSync(BIN)) {
      throw new Error(`expected built bin at ${BIN}; run pnpm --filter @baton/cli build`);
    }
    // Warm-up run to amortize file system caching.
    spawnSync(process.execPath, [BIN, '--version']);

    const start = Date.now();
    const r = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
    const elapsed = Date.now() - start;

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
