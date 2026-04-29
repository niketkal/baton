import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { probeKnownPaths } from '../shared/probe.js';
import type { DetectResult } from '../types.js';

/**
 * Detect a local Codex CLI install.
 *
 * Two-stage strategy:
 *   1. `spawnSync('codex', ['--version'])` — covers PATH installs.
 *   2. If PATH lookup returns ENOENT (or status 127), probe a list of
 *      known install locations: macOS desktop app, Homebrew prefixes,
 *      common user-local dirs. `BATON_CODEX_BIN` overrides the probe
 *      list — when set, only that path is tried.
 *
 * Aliases (e.g. zsh `alias codex=...`) don't propagate to child
 * processes, so PATH-only detection produces false negatives on
 * machines where users ship the desktop app + an alias. The probe
 * fallback is what makes those installs visible.
 *
 * NEVER throws; absence -> `installed: false`.
 */

type SpawnFn = typeof spawnSync;

let spawnImpl: SpawnFn = spawnSync;

/** Test-only seam. Not exported from the package index. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? spawnSync;
}

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

function knownCandidates(): string[] {
  const home = homedir();
  return [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    join(home, '.codex', 'bin', 'codex'),
    join(home, '.local', 'bin', 'codex'),
  ];
}

export async function detect(): Promise<DetectResult> {
  let result: ReturnType<SpawnFn> | undefined;
  let spawnThrew = false;
  try {
    result = spawnImpl('codex', ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
  } catch (_err) {
    spawnThrew = true;
  }

  // PATH lookup succeeded enough to inspect the result.
  if (!spawnThrew && result) {
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        return {
          installed: false,
          reason: `codex --version failed: ${result.error.message}`,
        };
      }
      // ENOENT — fall through to probe.
    } else if (typeof result.status === 'number' && result.status !== 0) {
      // Status 127 = "command not found" from a shell wrapper; treat as
      // a probe-eligible miss. Other non-zero statuses are real failures.
      if (result.status !== 127) {
        return { installed: false, reason: `codex --version exited ${result.status}` };
      }
    } else {
      const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const match = SEMVER_RE.exec(out);
      if (!match) {
        // Codex may print its version in a non-semver form. Treat as
        // installed but mark version unknown — opt-in wrapper still works.
        return { installed: true, path: 'codex' };
      }
      return { installed: true, version: match[1] as string, path: 'codex' };
    }
  }

  // PATH lookup missed. Probe known install paths.
  const envOverride = process.env.BATON_CODEX_BIN;
  if (envOverride && envOverride.length > 0) {
    const hit = probeKnownPaths([envOverride], spawnImpl);
    if (hit) {
      return hit.version
        ? { installed: true, version: hit.version, path: hit.path }
        : { installed: true, path: hit.path };
    }
    return {
      installed: false,
      reason: `BATON_CODEX_BIN set to ${envOverride} but that path did not respond to --version`,
    };
  }

  const hit = probeKnownPaths(knownCandidates(), spawnImpl);
  if (hit) {
    return hit.version
      ? { installed: true, version: hit.version, path: hit.path }
      : { installed: true, path: hit.path };
  }

  return { installed: false, reason: 'codex binary not found on PATH' };
}
