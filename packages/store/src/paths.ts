import { join } from 'node:path';

export const BATON_DIR = '.baton';
export const PACKETS_DIR = 'packets';
export const STATE_DB_FILE = 'state.db';

export const PACKET_JSON = 'packet.json';
export const PACKET_MD = 'packet.md';
export const WARNINGS_JSON = 'warnings.json';
export const PROVENANCE_JSON = 'provenance.json';

export interface StorePaths {
  root: string;
  baton: string;
  packets: string;
  db: string;
}

export function resolvePaths(rootDir: string): StorePaths {
  const baton = join(rootDir, BATON_DIR);
  return {
    root: rootDir,
    baton,
    packets: join(baton, PACKETS_DIR),
    db: join(baton, STATE_DB_FILE),
  };
}

export function packetDir(paths: StorePaths, id: string): string {
  return join(paths.packets, id);
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;

export function assertValidPacketId(id: string): void {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Invalid packet id: ${JSON.stringify(id)} (must match ${ID_PATTERN.source})`);
  }
}

/**
 * Validate an untrusted packet id (e.g. from a CLI flag) before joining it
 * into a filesystem path. Narrows `id` to `string` via assertion signature
 * so callers can use the value as-is. Throws with a human-readable message
 * on any rejection. The accepted shape is:
 *
 *   ^[a-z0-9][a-z0-9._-]{1,127}$
 *
 * which is lowercase alphanumeric with optional `.`, `_`, `-` separators,
 * 2–128 chars, may not start with a separator. This rejects path-traversal
 * sequences (`../foo`), absolute paths (`/abs`), whitespace, control bytes,
 * and any uppercase or unicode characters.
 */
export function validatePacketId(id: unknown): asserts id is string {
  if (typeof id !== 'string') {
    throw new Error(`invalid packet id: expected string, got ${typeof id}`);
  }
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `invalid packet id: ${JSON.stringify(id)} must match /^[a-z0-9][a-z0-9._-]{1,127}$/ (lowercase alphanumeric, optional separators . _ -, 2-128 chars, cannot start with separator)`,
    );
  }
}
