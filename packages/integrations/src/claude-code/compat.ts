/**
 * Versioned compatibility table for Claude Code per tech spec §8.1.
 *
 * Each entry pins a Claude Code version range to the plugin layout we
 * know works against it. When a new Claude Code release ships, add a
 * specific entry rather than reaching into the wildcard fallback. The
 * `'*'` row is intentionally last — keep it last when adding entries.
 */

export interface CompatEntry {
  /** Semver range. Today: '*' wildcard until we test against pinned versions. */
  claudeCodeVersion: string;
  /** Plugin install dir, may contain a leading '~'. */
  pluginDir: string;
  /** Hook payload format identifier. Bumpable independently of CC version. */
  hookFormat: 'v1';
  /** Manifest filename inside the plugin dir. */
  manifestFile: string;
}

export const COMPAT_TABLE: readonly CompatEntry[] = [
  {
    claudeCodeVersion: '*',
    pluginDir: '~/.claude/plugins',
    hookFormat: 'v1',
    manifestFile: 'plugin.json',
  },
  // Add specific entries when we test against pinned versions:
  // { claudeCodeVersion: '^2.0.0', pluginDir: '~/.claude/plugins', ... },
];

/**
 * Pick the first entry whose `claudeCodeVersion` matches the detected
 * version. Today this is just an exact-or-wildcard check — when we
 * adopt a real semver matcher, swap it in here.
 */
export function lookup(version: string): CompatEntry | undefined {
  for (const entry of COMPAT_TABLE) {
    if (entry.claudeCodeVersion === '*' || entry.claudeCodeVersion === version) {
      return entry;
    }
  }
  return undefined;
}
