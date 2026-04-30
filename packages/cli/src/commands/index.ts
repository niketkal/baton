// Explicit one-import-per-command registry per CLAUDE.md (no glob imports).
// Adding a command = create the file under this folder and add a line below.
//
// Cold-start discipline: each command module's top-level import surface is
// limited to types (`import type`) plus commander + pure utility modules.
// Heavy modules — `@batonai/compiler`, `@batonai/render`, `@batonai/lint`,
// `@batonai/store` (which transitively loads `better-sqlite3` native binding) —
// must only be reached via `await import()` inside command handler bodies.
// See test/performance/cold-start.test.ts for the regression check.
import type { Command } from 'commander';
import { registerCompile } from './compile.js';
import { registerConformance } from './conformance.js';
import { registerDispatch } from './dispatch.js';
import { registerFailover } from './failover.js';
import { registerHistory } from './history.js';
import { registerIngest } from './ingest.js';
import { registerInit } from './init.js';
import { registerInternal } from './internal.js';
import { registerLint } from './lint.js';
import { registerMigrate } from './migrate.js';
import { registerOutcome } from './outcome.js';
import { registerRender } from './render.js';
import { registerStatus } from './status.js';
import { registerUninstall } from './uninstall.js';

export function registerCommands(program: Command): void {
  registerInit(program);
  registerUninstall(program);
  registerIngest(program);
  registerCompile(program);
  registerRender(program);
  registerLint(program);
  registerFailover(program);
  registerMigrate(program);
  registerConformance(program);
  registerDispatch(program);
  registerOutcome(program);
  registerStatus(program);
  registerHistory(program);
  registerInternal(program);
}

export { runInit } from './init.js';
export { runUninstall } from './uninstall.js';
export { runIngest } from './ingest.js';
export { runCompile, collectArtifacts } from './compile.js';
export { runRender } from './render.js';
export { runLint } from './lint.js';
export { runFailover } from './failover.js';
export { runMigrate } from './migrate.js';
export { runConformanceCommand } from './conformance.js';
export { runDispatch } from './dispatch.js';
export { runOutcomeIngest, classifyOutcome } from './outcome.js';
export { runStatus } from './status.js';
export { runHistory } from './history.js';
