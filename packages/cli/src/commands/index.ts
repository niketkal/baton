// Explicit one-import-per-command registry per CLAUDE.md (no glob imports).
// Adding a command = create the file under this folder and add a line below.
//
// Cold-start discipline: each command module's top-level import surface is
// limited to types (`import type`) plus commander + pure utility modules.
// Heavy modules — `@baton/compiler`, `@baton/render`, `@baton/lint`,
// `@baton/store` (which transitively loads `better-sqlite3` native binding) —
// must only be reached via `await import()` inside command handler bodies.
// See test/performance/cold-start.test.ts for the regression check.
import type { Command } from 'commander';
import { registerCompile } from './compile.js';
import { registerConformance } from './conformance.js';
import { registerFailover } from './failover.js';
import { registerIngest } from './ingest.js';
import { registerInit } from './init.js';
import { registerLint } from './lint.js';
import { registerMigrate } from './migrate.js';
import { registerRender } from './render.js';
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
