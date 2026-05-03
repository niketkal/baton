/**
 * Reads and writes `.baton/integrations/installed.json` — the on-disk
 * record of which integrations are installed, where they put their
 * files, and the sha256 of every file we created. Used at uninstall
 * time as a safety check: we only ever delete files whose recorded
 * sha matches what's on disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface InstalledFile {
  path: string;
  sha256: string;
}

export interface InstalledRecord {
  id: string;
  mode: string;
  installedAt: string;
  pluginDir: string;
  files: InstalledFile[];
  backupRefs: string[];
  /**
   * For integrations that patch an external config (e.g., Claude Code's
   * user settings.json), the path of that file so uninstall can revert
   * just our entries without touching unrelated keys.
   */
  settingsPath?: string;
  /**
   * Absolute prefix that identifies this integration's hook commands
   * inside `settingsPath`. Used to filter our entries during uninstall.
   */
  scriptsDir?: string;
}

export interface InstalledManifest {
  version: 1;
  integrations: InstalledRecord[];
}

const EMPTY: InstalledManifest = { version: 1, integrations: [] };

export function manifestPath(repoRoot: string): string {
  return join(repoRoot, '.baton', 'integrations', 'installed.json');
}

export function readManifest(repoRoot: string): InstalledManifest {
  const p = manifestPath(repoRoot);
  if (!existsSync(p)) return { ...EMPTY, integrations: [] };
  try {
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as InstalledManifest;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.integrations)) {
      return { ...EMPTY, integrations: [] };
    }
    return parsed;
  } catch {
    return { ...EMPTY, integrations: [] };
  }
}

export function writeManifest(repoRoot: string, manifest: InstalledManifest): void {
  const p = manifestPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function upsertRecord(repoRoot: string, record: InstalledRecord): void {
  const m = readManifest(repoRoot);
  const idx = m.integrations.findIndex((r) => r.id === record.id);
  if (idx >= 0) m.integrations[idx] = record;
  else m.integrations.push(record);
  writeManifest(repoRoot, m);
}

export function removeRecord(repoRoot: string, id: string): InstalledRecord | undefined {
  const m = readManifest(repoRoot);
  const idx = m.integrations.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  const [removed] = m.integrations.splice(idx, 1);
  writeManifest(repoRoot, m);
  return removed;
}

export function findRecord(repoRoot: string, id: string): InstalledRecord | undefined {
  return readManifest(repoRoot).integrations.find((r) => r.id === id);
}
