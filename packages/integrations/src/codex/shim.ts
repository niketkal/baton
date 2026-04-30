import { createHash } from 'node:crypto';

/**
 * Content of the `baton-codex` shim that gets written to disk by `install()`.
 *
 * The shim is a tiny wrapper that delegates to a `baton` sub-command
 * (`baton internal codex-wrap`) which contains the real stdout-watching
 * logic. POSIX gets a bash script (`baton-codex`); Windows gets a batch
 * script (`baton-codex.cmd`) with the same forwarding behaviour.
 *
 * Why a shell shim and not a Node script? Two reasons:
 *   1. Spawning Node twice (once for the shim, once for the wrapper)
 *      adds 100ms+ to every codex invocation. A shell shim is ~5ms.
 *   2. The shim has to survive `baton uninstall` cleanly: a single text
 *      file is trivially sha256-fingerprintable.
 *
 * Per tech spec §8.2: NEVER modify PATH without explicit user consent.
 * Install puts the shim in `~/.local/bin/baton-codex` on POSIX or
 * `%LOCALAPPDATA%\baton\bin\baton-codex.cmd` on Windows (or
 * `$BATON_CODEX_INSTALL_DIR`); the user opts in by adding that dir to
 * PATH or invoking the shim by absolute path.
 */

/** Legacy POSIX filename. Retained for back-compat with existing tests. */
export const SHIM_FILENAME = 'baton-codex';

export const POSIX_SHIM_FILENAME = 'baton-codex';
export const WINDOWS_SHIM_FILENAME = 'baton-codex.cmd';

export const POSIX_SHIM = `#!/usr/bin/env bash
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

export const WINDOWS_SHIM = `@echo off
REM baton-codex.cmd - opt-in wrapper around the Codex CLI.
REM
REM Forwards to \`baton internal codex-wrap\` which spawns codex.exe,
REM watches stdout for limit markers, and triggers a non-blocking handoff.
REM
REM Installed by \`baton init --integration codex\` into
REM %BATON_CODEX_INSTALL_DIR% (default %LOCALAPPDATA%\\baton\\bin).
REM Never modifies PATH.

where baton >nul 2>nul
if errorlevel 1 (
  echo [baton-codex] error: 'baton' not found on PATH 1>&2
  exit /b 127
)

baton internal codex-wrap %*
exit /b %ERRORLEVEL%
`;

/**
 * Backwards-compatible alias for code/tests still importing the POSIX
 * content via the legacy name. New call sites should pick the
 * platform-appropriate constant directly.
 */
export const SHIM_CONTENT = POSIX_SHIM;

/** Pick the shim filename appropriate for the current platform. */
export function shimFilenameForPlatform(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? WINDOWS_SHIM_FILENAME : POSIX_SHIM_FILENAME;
}

/** Pick the shim content appropriate for the current platform. */
export function shimContentForPlatform(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? WINDOWS_SHIM : POSIX_SHIM;
}

/** sha256 over the POSIX shim content. Stable since content is constant. */
export function shimSha256(): string {
  return createHash('sha256').update(POSIX_SHIM, 'utf8').digest('hex');
}
