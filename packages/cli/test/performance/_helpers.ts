import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PKG_ROOT = resolve(__dirname, '..', '..');
export const BIN = resolve(PKG_ROOT, 'dist', 'bin.js');
export const REPO_ROOT = resolve(PKG_ROOT, '..', '..');

export const isCi = process.env.CI === 'true' || process.env.CI === '1';

/**
 * Tech-spec §11 budgets. CI gets headroom because Windows / shared
 * runners spawn ~2-3x slower than a developer laptop. Adjusting these
 * requires a code-owner approval per CLAUDE.md.
 */
// Spawn-and-measure budgets (ms). Tech spec §11 numbers describe the
// in-process operation cost; each test here ALSO pays node spawn +
// module-graph load, which adds ~100-200ms on macOS, more on Windows.
// The first spawn in a vitest run is consistently slowest (cold disk
// cache + integration probes hitting `$HOME/.claude/plugins/baton`),
// so the local budget includes substantial slack while CI gets more.
// Per CLAUDE.md, lowering any of these to chase a regression below
// the *spec target* is great; raising one above the listed CI value
// requires a code-owner approval recorded in the PR.
export const BUDGETS = {
  // --version: spec target 200ms direct invocation (no integration
  // probe). Existing cold-start.test.ts already enforces this.
  coldStart: isCi ? 600 : 400,
  // init --dry-run: spec target 500ms. Includes spawn + claude-code
  // detect (which stats `~/.claude/plugins/baton`).
  initDryRun: isCi ? 3000 : 2500,
  // init happy path: spec target 1s. Includes scaffolding writes.
  init: isCi ? 3000 : 2000,
  // compile --fast: spec target 1s. No LLM. Includes spawn + native
  // sqlite binding load.
  compileFast: isCi ? 3000 : 1500,
  // compile --full: spec target 10s typical. Tested in-process with
  // a mock provider so no spawn cost is included.
  compileFull: isCi ? 15_000 : 10_000,
  // lint: spec target 200ms in-process; spawn overhead pushes the
  // observable budget higher.
  lint: isCi ? 1500 : 1000,
  // render: spec target 100ms (pure function); spawn overhead dominates.
  render: isCi ? 1500 : 1000,
  // failover: spec target & CLAUDE.md invariant 2: < 5s warm cache.
  failover: isCi ? 15_000 : 5_000,
};

export function ensureBuilt(): void {
  if (!existsSync(BIN)) {
    execSync('pnpm build', { cwd: PKG_ROOT, stdio: 'inherit' });
  }
}
