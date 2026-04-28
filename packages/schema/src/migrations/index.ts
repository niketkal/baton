// Explicit one-import-per-migration registry per CLAUDE.md (no glob imports).
// Adding a migration = create the file under this folder and add a line below.
import { migration as noop } from './000-noop.js';
import type { Migration } from './types.js';

export const MIGRATIONS: readonly Migration[] = Object.freeze([noop]);

export type { Migration } from './types.js';
