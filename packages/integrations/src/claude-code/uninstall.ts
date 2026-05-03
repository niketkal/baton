import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { findRecord, removeRecord } from '../state.js';
import { PLUGIN_NAME } from './plugin/assets.js';
import { removeHookRegistrations } from './settings.js';

const ID = 'claude-code';

function sha256OfFile(p: string): string | null {
  try {
    const content = readFileSync(p);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Recursively remove empty parent directories up the chain, stopping
 * once we hit a non-empty dir or `<pluginDir>/baton`'s parent (which
 * we never delete since it belongs to Claude Code, not us).
 */
function pruneEmptyDirs(start: string, stopAt: string): void {
  let cur = start;
  while (cur !== stopAt && cur.length > stopAt.length) {
    if (!existsSync(cur)) {
      cur = dirname(cur);
      continue;
    }
    try {
      const entries = readdirSync(cur);
      if (entries.length > 0) return;
      rmdirSync(cur);
    } catch {
      return;
    }
    cur = dirname(cur);
  }
}

export async function uninstall(opts?: { repoRoot?: string }): Promise<void> {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const record = findRecord(repoRoot, ID);
  if (!record) return; // nothing to do

  const baton = join(record.pluginDir, PLUGIN_NAME);

  // De-register baton hooks from Claude Code's settings.json before
  // removing the script files. Doing it in this order means a partial
  // failure leaves no orphan settings.json entries pointing at deleted
  // scripts. Older install records (pre-v1.0.3) didn't track these
  // fields; in that case we skip silently — the dormant plugin files
  // were never registered, so there's nothing to remove.
  if (record.settingsPath !== undefined && record.scriptsDir !== undefined) {
    try {
      removeHookRegistrations(record.settingsPath, record.scriptsDir);
    } catch {
      // best effort — never block file cleanup on settings.json edits
    }
  }

  for (const f of record.files) {
    if (!existsSync(f.path)) continue;
    // Safety: verify content matches what we wrote. If a user manually
    // edited a hook script, we leave it alone — they accepted ownership.
    const actual = sha256OfFile(f.path);
    if (actual !== f.sha256) continue;
    try {
      rmSync(f.path);
    } catch {
      // best effort
    }
    pruneEmptyDirs(dirname(f.path), baton);
  }

  // Drop the `<pluginDir>/baton/` dir if empty.
  if (existsSync(baton)) {
    try {
      const stat = statSync(baton);
      if (stat.isDirectory() && readdirSync(baton).length === 0) {
        rmdirSync(baton);
      }
    } catch {
      // best effort
    }
  }

  removeRecord(repoRoot, ID);
}
