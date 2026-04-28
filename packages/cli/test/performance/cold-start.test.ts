import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..', '..');
const BIN = resolve(PKG_ROOT, 'dist', 'bin.js');

// Cold-start: real cold start (no warm-up — see Fix 6 commit). The
// tech-spec §9.2 / CLAUDE.md target stays < 200ms for `--version`; this
// test's budget is the regression guard, deliberately set with headroom
// so it doesn't flake under load (vitest runs parallel suites which
// contend on CPU). A standalone `time node dist/bin.js --version` on
// macOS clocks ~100ms; with vitest contention we see 200-300ms locally.
// The CI matrix includes Windows, which is consistently the slowest OS
// for native fs + node startup, so CI gets even more headroom.
const isCi = process.env.CI === 'true' || process.env.CI === '1';
const BUDGET_MS = isCi ? 600 : 400;

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
    // No warm-up: the prior version of this test discarded a first
    // invocation, which by definition makes the second one not a cold
    // start. A warm-up amortizes the very thing we want to measure
    // (module-graph load + native binding init). If this proves flaky
    // on a particular CI image, raise BUDGET_MS for that env rather
    // than reintroduce the warm-up.
    const start = Date.now();
    const r = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
    const elapsed = Date.now() - start;

    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('does NOT load better-sqlite3 for `baton --version`', async () => {
    // Regression for the Fix 2 lazy-load contract. If a future change
    // re-introduces a top-level `import '@baton/store'` (or anything
    // that pulls in the native binding), this test will flag it.
    //
    // Strategy: dynamic-import the built bin from a small probe script
    // that overrides process.argv to `['node', 'baton', '--version']`,
    // suppresses process.exit, then inspects `require.cache` (CJS native
    // bindings register there even when loaded from ESM via createRequire).
    const probe = `
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      process.argv = [process.argv[0], 'baton', '--version'];
      const realExit = process.exit;
      process.exit = () => {};
      const stdoutWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true;
      await import(${JSON.stringify(BIN)});
      // Give commander's parseAsync a tick to settle.
      await new Promise((r) => setTimeout(r, 50));
      const hits = Object.keys(require.cache).filter((p) => p.includes('better-sqlite3'));
      process.stdout.write = stdoutWrite;
      stdoutWrite(JSON.stringify(hits));
      realExit(0);
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const out = (r.stdout ?? '').trim();
    const arrayStart = out.lastIndexOf('[');
    const arrayEnd = out.lastIndexOf(']');
    expect(arrayStart).toBeGreaterThanOrEqual(0);
    expect(arrayEnd).toBeGreaterThan(arrayStart);
    const hits = JSON.parse(out.slice(arrayStart, arrayEnd + 1)) as string[];
    expect(hits).toEqual([]);
  });
});
