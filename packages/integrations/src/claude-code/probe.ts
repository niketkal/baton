import { constants, accessSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { lookup } from './compat.js';

/**
 * Resolve the Claude Code plugin directory.
 *
 * Strategy:
 *   1. If COMPAT_TABLE has a specific entry for `version`, use its
 *      `pluginDir` (after `~` expansion).
 *   2. Otherwise probe a list of known candidate dirs in order.
 *
 * Returns the first candidate whose parent exists and which is writable
 * (or whose parent is writable, in case the plugin dir itself doesn't
 * yet exist). Returns `null` if no candidate qualifies.
 *
 * NEVER reads or writes data — only stat + access checks.
 */

function homeRoot(): string {
  // Prefer HOME (USERPROFILE on Windows) so tests can override via env
  // without monkey-patching `os`. Fall back to `homedir()` otherwise.
  const env = process.env.HOME ?? process.env.USERPROFILE;
  return env && env.length > 0 ? env : homedir();
}

export function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return resolve(homeRoot(), p.slice(1).replace(/^[\\/]/, ''));
  }
  return resolve(p);
}

const CANDIDATE_DIRS: readonly string[] = ['~/.claude/plugins', '~/.config/claude/plugins'];

function isWritable(p: string): boolean {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isUsable(candidate: string): boolean {
  const expanded = expandHome(candidate);
  if (existsSync(expanded)) {
    try {
      const s = statSync(expanded);
      if (!s.isDirectory()) return false;
    } catch {
      return false;
    }
    return isWritable(expanded);
  }
  // Plugin dir doesn't exist yet — acceptable iff its parent exists +
  // is writable so we can create it during install.
  const parent = dirname(expanded);
  return existsSync(parent) && isWritable(parent);
}

export async function probePluginDir(version: string): Promise<string | null> {
  const compat = lookup(version);
  if (compat && compat.claudeCodeVersion !== '*') {
    // Specific entry — trust it; only verify usability.
    if (isUsable(compat.pluginDir)) return expandHome(compat.pluginDir);
  }

  for (const candidate of CANDIDATE_DIRS) {
    if (isUsable(candidate)) return expandHome(candidate);
  }

  // The wildcard compat row is checked last so a usable real candidate
  // (if any) wins; if none of the probes succeeded, fall through to
  // the wildcard's expanded path iff its parent exists.
  if (compat && compat.claudeCodeVersion === '*') {
    if (isUsable(compat.pluginDir)) return expandHome(compat.pluginDir);
  }
  return null;
}
