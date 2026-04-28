import type { Migration } from './types.js';

/**
 * No-op v1→v1 migration. Exists to exercise the migration runner rails so
 * the v1→v2 migration has a working path to land into when v2 is real.
 *
 * When v2 lands:
 *   1. Add `001-v1-to-v2.ts` with a real `up()`.
 *   2. Register it in `./index.ts` (explicit import, no glob).
 *   3. Delete this file (the rails will then be exercised by the real
 *      migration end-to-end test).
 */
export const migration: Migration = {
  from: 'baton.packet/v1',
  to: 'baton.packet/v1',
  up: (packet) => packet,
};
