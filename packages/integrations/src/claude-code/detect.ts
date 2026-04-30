import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { probeKnownPaths } from '../shared/probe.js';
import type { DetectResult } from '../types.js';

/**
 * Detect a local Claude Code install.
 *
 * Two-stage strategy:
 *   1. `spawnSync('claude', ['--version'])` — covers PATH installs.
 *   2. On ENOENT (or status 127), probe known install paths: Homebrew
 *      prefixes, common user-local dirs, and the macOS desktop-app
 *      location (in case Anthropic ships one). `BATON_CLAUDE_BIN`
 *      overrides the probe list — when set, only that path is tried.
 *
 * Aliases set in shell rc files don't propagate to child processes, so
 * PATH-only detection misses installs that rely on a user alias. The
 * probe fallback is what makes those installs visible.
 *
 * NEVER throws. Anything goes wrong → `{ installed: false, reason }`.
 *
 * Used by tests via `__setSpawnForTests` so we don't shell out in CI.
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
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    join(home, '.claude', 'bin', 'claude'),
    join(home, '.local', 'bin', 'claude'),
    '/Applications/Claude.app/Contents/Resources/claude',
  ];
}

export async function detect(): Promise<DetectResult> {
  let result: ReturnType<SpawnFn> | undefined;
  let spawnThrew = false;
  try {
    result = spawnImpl('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
  } catch (_err) {
    spawnThrew = true;
  }

  if (!spawnThrew && result) {
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        return {
          installed: false,
          reason: `claude --version failed: ${result.error.message}`,
        };
      }
      // ENOENT — fall through to probe.
    } else if (typeof result.status === 'number' && result.status !== 0) {
      if (result.status !== 127) {
        return { installed: false, reason: `claude --version exited ${result.status}` };
      }
      // Status 127 — fall through to probe.
    } else {
      const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const match = SEMVER_RE.exec(out);
      if (!match) {
        return { installed: false, reason: 'could not parse claude --version output' };
      }
      return { installed: true, version: match[1] as string, path: 'claude' };
    }
  }

  // PATH lookup missed. Probe known install paths.
  const envOverride = process.env.BATON_CLAUDE_BIN;
  if (envOverride && envOverride.length > 0) {
    const hit = probeKnownPaths([envOverride], spawnImpl);
    if (hit?.version) {
      return { installed: true, version: hit.version, path: hit.path };
    }
    return {
      installed: false,
      reason: `BATON_CLAUDE_BIN set to ${envOverride} but that path did not respond to --version`,
    };
  }

  const hit = probeKnownPaths(knownCandidates(), spawnImpl);
  if (hit?.version) {
    return { installed: true, version: hit.version, path: hit.path };
  }

  return { installed: false, reason: 'claude binary not found on PATH' };
}
