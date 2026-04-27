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
