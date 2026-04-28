/**
 * Plugin assets, embedded as string constants so they bundle into the
 * shipped JS without depending on package-relative file lookup at
 * runtime. The shape is dictated by tech spec §8.1: a plugin manifest
 * + one shell script per hook event.
 *
 * Hook scripts are intentionally minimal:
 *   - `cd $BATON_REPO_ROOT` so they run inside a Baton-initialized repo
 *   - silently no-op if `baton` isn't on PATH (don't crash Claude Code)
 *   - log to `~/.baton-hook.log` so a curious user can see what fired
 *
 * `--fast` mode is mandatory for hooks per tech spec §15 / invariant 2.
 */

export const PLUGIN_NAME = 'baton';
export const HOOK_FORMAT = 'v1' as const;

export const PLUGIN_MANIFEST = `${JSON.stringify(
  {
    name: PLUGIN_NAME,
    description: 'Baton handoff hooks — compile a fast packet on session boundaries.',
    version: '0.1.0',
    hookFormat: HOOK_FORMAT,
    hooks: {
      'pre-compaction': { script: 'hooks/pre-compaction.sh' },
      'session-end': { script: 'hooks/session-end.sh' },
      'limit-warning': { script: 'hooks/limit-warning.sh' },
    },
  },
  null,
  2,
)}\n`;

const PRE_COMPACTION = `#!/usr/bin/env bash
# Baton pre-compaction hook — refresh the current-task packet before
# Claude Code compacts the conversation. Fast-mode only (no LLM call).
cd "\${BATON_REPO_ROOT:-$PWD}" 2>/dev/null || exit 0
command -v baton >/dev/null 2>&1 || exit 0
baton compile --fast --packet current-task --json >> "$HOME/.baton-hook.log" 2>&1
exit 0
`;

const SESSION_END = `#!/usr/bin/env bash
# Baton session-end hook — record final packet state when the session
# closes so the next agent has up-to-date context.
cd "\${BATON_REPO_ROOT:-$PWD}" 2>/dev/null || exit 0
command -v baton >/dev/null 2>&1 || exit 0
baton compile --fast --packet current-task --json >> "$HOME/.baton-hook.log" 2>&1
exit 0
`;

const LIMIT_WARNING = `#!/usr/bin/env bash
# Baton limit-warning hook — Claude Code is approaching its context
# limit; prepare a renderable packet for the next tool.
cd "\${BATON_REPO_ROOT:-$PWD}" 2>/dev/null || exit 0
command -v baton >/dev/null 2>&1 || exit 0
baton compile --fast --packet current-task --json >> "$HOME/.baton-hook.log" 2>&1
baton render --target codex --copy >> "$HOME/.baton-hook.log" 2>&1
exit 0
`;

/**
 * Files emitted into `<pluginDir>/baton/`. Order is deterministic so
 * the install plan / dry-run / roundtrip-test all see the same list.
 */
export const PLUGIN_FILES: readonly { path: string; content: string; executable: boolean }[] = [
  { path: 'plugin.json', content: PLUGIN_MANIFEST, executable: false },
  { path: 'hooks/pre-compaction.sh', content: PRE_COMPACTION, executable: true },
  { path: 'hooks/session-end.sh', content: SESSION_END, executable: true },
  { path: 'hooks/limit-warning.sh', content: LIMIT_WARNING, executable: true },
];

export const HOOK_EVENTS: readonly string[] = ['pre-compaction', 'session-end', 'limit-warning'];
