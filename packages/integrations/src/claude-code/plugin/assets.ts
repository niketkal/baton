/**
 * Plugin assets, embedded as string constants so they bundle into the
 * shipped JS without depending on package-relative file lookup at
 * runtime. The shape is dictated by tech spec §8.1: a plugin manifest
 * + one shell script per hook event.
 *
 * Hook scripts read Claude Code's hook payload on stdin, extract the
 * `transcript_path`, ingest it as a transcript artifact attached to
 * the `current-task` packet, then run a fast-mode compile so failover
 * has real content to work with.
 *
 * Discipline:
 *   - `cd $BATON_REPO_ROOT` (or `cwd` from the payload) so they run
 *     inside a Baton-initialized repo
 *   - silently no-op if `baton` isn't on PATH (don't crash Claude Code)
 *   - silently no-op if `jq` isn't available (don't crash; fall back)
 *   - log to `~/.baton-hook.log` so a curious user can see what fired
 *
 * `--fast` mode is mandatory for hooks per tech spec §15 / invariant 2.
 */

export const PLUGIN_NAME = 'baton';
export const HOOK_FORMAT = 'v1' as const;

/**
 * Real Claude Code hook event names (verified against the official
 * docs). The previous values (`pre-compaction`, `session-end`,
 * `limit-warning`) were informal/legacy names that Claude Code never
 * fires, so the hooks were silently dead.
 */
export const PRE_COMPACT_EVENT = 'PreCompact';
export const STOP_EVENT = 'Stop';
export const SESSION_END_EVENT = 'SessionEnd';

export const PLUGIN_MANIFEST = `${JSON.stringify(
  {
    name: PLUGIN_NAME,
    description: 'Baton handoff hooks — compile a fast packet on session boundaries.',
    version: '0.2.0',
    hookFormat: HOOK_FORMAT,
    hooks: {
      [PRE_COMPACT_EVENT]: { script: 'hooks/pre-compact.sh' },
      [STOP_EVENT]: { script: 'hooks/stop.sh' },
      [SESSION_END_EVENT]: { script: 'hooks/session-end.sh' },
    },
  },
  null,
  2,
)}\n`;

/**
 * Shared body: read the JSON hook payload from stdin, extract
 * `transcript_path` and `cwd`, then ingest + compile. We keep this
 * inline (rather than sourcing a shared helper) because the plugin
 * directory ships only the manifest + script files; a separate helper
 * would need its own install plan entry.
 */
function buildHookScript(eventLabel: string): string {
  return `#!/usr/bin/env bash
# Baton ${eventLabel} hook — ingest the session transcript and refresh
# the current-task packet so the next failover has real content.
# Fast-mode only (no LLM call) per tech spec invariant 2.
set -uo pipefail

LOG="$HOME/.baton-hook.log"
echo "[\$(date -u +%FT%TZ)] ${eventLabel} hook fired" >> "$LOG" 2>&1

# Read the JSON payload Claude Code sends on stdin.
PAYLOAD="\$(cat)"

# Pick a JSON parser. jq is preferred; python3 is the fallback.
extract_field() {
  local field="\$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "\$PAYLOAD" | jq -r --arg f "\$field" '.[\$f] // empty' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "\$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('\$field',''))" 2>/dev/null
  else
    printf ''
  fi
}

TRANSCRIPT_PATH="\$(extract_field transcript_path)"
PAYLOAD_CWD="\$(extract_field cwd)"

# Settle on a working directory: explicit env > payload cwd > current PWD.
TARGET_DIR="\${BATON_REPO_ROOT:-\${PAYLOAD_CWD:-\$PWD}}"
cd "\$TARGET_DIR" 2>/dev/null || { echo "[baton-hook] cannot cd into \$TARGET_DIR" >> "\$LOG"; exit 0; }

# Silently no-op if baton isn't installed — never crash Claude Code.
command -v baton >/dev/null 2>&1 || exit 0

# Ingest the transcript if we got one. Compile runs either way so the
# packet keeps its repo metadata fresh even when the payload is missing
# the field (older Claude Code versions, malformed events, etc.).
if [ -n "\$TRANSCRIPT_PATH" ] && [ -f "\$TRANSCRIPT_PATH" ]; then
  baton ingest transcript "\$TRANSCRIPT_PATH" --packet current-task >> "\$LOG" 2>&1
else
  echo "[baton-hook] no transcript_path in payload; skipping ingest" >> "\$LOG"
fi

baton compile --mode fast --packet current-task --json >> "\$LOG" 2>&1
exit 0
`;
}

const PRE_COMPACT = buildHookScript('PreCompact');
const STOP = buildHookScript('Stop');
const SESSION_END = buildHookScript('SessionEnd');

/**
 * Files emitted into `<pluginDir>/baton/`. Order is deterministic so
 * the install plan / dry-run / roundtrip-test all see the same list.
 */
export const PLUGIN_FILES: readonly { path: string; content: string; executable: boolean }[] = [
  { path: 'plugin.json', content: PLUGIN_MANIFEST, executable: false },
  { path: 'hooks/pre-compact.sh', content: PRE_COMPACT, executable: true },
  { path: 'hooks/stop.sh', content: STOP, executable: true },
  { path: 'hooks/session-end.sh', content: SESSION_END, executable: true },
];

export const HOOK_EVENTS: readonly string[] = [PRE_COMPACT_EVENT, STOP_EVENT, SESSION_END_EVENT];
