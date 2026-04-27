import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BatonPacket, type Warning, assertPacket } from '@baton/schema';
import { renderPacketMarkdown } from './markdown.js';
import {
  PACKET_JSON,
  PACKET_MD,
  PROVENANCE_JSON,
  type StorePaths,
  WARNINGS_JSON,
  packetDir,
} from './paths.js';

function atomicWrite(path: string, contents: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, path);
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writePacketFiles(paths: StorePaths, packet: BatonPacket): void {
  const dir = packetDir(paths, packet.id);
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, PACKET_JSON), stableStringify(packet));
  atomicWrite(join(dir, WARNINGS_JSON), stableStringify(packet.warnings));
  atomicWrite(join(dir, PROVENANCE_JSON), stableStringify(packet.provenance_links));
  atomicWrite(join(dir, PACKET_MD), renderPacketMarkdown(packet));
}

export function readPacketFile(paths: StorePaths, id: string): BatonPacket {
  const path = join(packetDir(paths, id), PACKET_JSON);
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  assertPacket(parsed);
  return parsed;
}

export function listPacketIdsOnDisk(paths: StorePaths): string[] {
  let entries: string[];
  try {
    entries = readdirSync(paths.packets);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const ids: string[] = [];
  for (const entry of entries) {
    const dir = join(paths.packets, entry);
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    try {
      statSync(join(dir, PACKET_JSON));
    } catch {
      continue;
    }
    ids.push(entry);
  }
  ids.sort();
  return ids;
}

export function rewriteWarningsFile(paths: StorePaths, id: string, warnings: Warning[]): void {
  atomicWrite(join(packetDir(paths, id), WARNINGS_JSON), stableStringify(warnings));
}
