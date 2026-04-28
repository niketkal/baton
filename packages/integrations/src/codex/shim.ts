import { createHash } from 'node:crypto';

/**
 * Content of the `baton-codex` shim that gets written to disk by `install()`.
 *
 * The shim is a tiny POSIX shell wrapper that delegates to a `baton`
 * sub-command (`baton internal codex-wrap`) which contains the real
 * stdout-watching logic.
 *
 * Why a shell shim and not a Node script? Two reasons:
 *   1. Spawning Node twice (once for the shim, once for the wrapper)
 *      adds 100ms+ to every codex invocation. A shell shim is ~5ms.
 *   2. The shim has to survive `baton uninstall` cleanly: a single text
 *      file is trivially sha256-fingerprintable.
 *
 * Per tech spec §8.2: NEVER modify PATH without explicit user consent.
 * Install puts the shim in `~/.local/bin/baton-codex` (or
 * `$BATON_CODEX_INSTALL_DIR`); the user opts in by adding that dir to
 * PATH or invoking `baton-codex` directly.
 */

export const SHIM_FILENAME = 'baton-codex';

export const SHIM_CONTENT = `#!/usr/bin/env bash
# baton-codex — opt-in wrapper around the Codex CLI.
#
# Spawns \`codex\` as a subprocess, watches stdout for known limit
# markers, and triggers \`baton compile --fast && baton render --target
# claude-code --copy\` on a hit. The handoff is non-blocking.
#
# Installed by \`baton init --integration codex\` into
# \${BATON_CODEX_INSTALL_DIR:-\$HOME/.local/bin}. Never modifies PATH.

set -e

if ! command -v baton >/dev/null 2>&1; then
  echo "[baton-codex] error: 'baton' not found on PATH" >&2
  exit 127
fi

exec baton internal codex-wrap "\$@"
`;

/** sha256 over `SHIM_CONTENT`. Stable across installs since content is constant. */
export function shimSha256(): string {
  return createHash('sha256').update(SHIM_CONTENT, 'utf8').digest('hex');
}
