// Explicit one-import-per-command registry per CLAUDE.md (no glob imports).
// Adding a command = create the file under this folder and add a line below.
import type { Command } from 'commander';
import { registerCompile } from './compile.js';
import { registerFailover } from './failover.js';
import { registerIngest } from './ingest.js';
import { registerInit } from './init.js';
import { registerLint } from './lint.js';
import { registerRender } from './render.js';

export function registerCommands(program: Command): void {
  registerInit(program);
  registerIngest(program);
  registerCompile(program);
  registerRender(program);
  registerLint(program);
  registerFailover(program);
}

export { runInit } from './init.js';
export { runIngest } from './ingest.js';
export { runCompile, collectArtifacts } from './compile.js';
export { runRender } from './render.js';
export { runLint } from './lint.js';
export { runFailover } from './failover.js';
