/**
 * Shared binary-probe helper for integration `detect()` functions.
 *
 * When `spawnSync(<bareName>)` returns ENOENT (or status 127), the binary
 * is not on the host PATH but may still be installed at a known location
 * (macOS desktop apps, Homebrew prefixes, user-local install dirs). This
 * helper walks a caller-supplied list of candidate absolute paths and
 * returns the first one that exists on disk and responds successfully
 * to `<path> --version`.
 *
 * Test seam: callers pass in a `spawnImpl` so the probe can be mocked
 * the same way `detect.ts` already mocks the PATH-lookup spawn.
 */

import type { spawnSync as nodeSpawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

type SpawnFn = typeof nodeSpawnSync;

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

export interface ProbeMatch {
  path: string;
  version?: string;
}

/**
 * Walk `candidates` and return the first one that
 *   1. exists on disk (`fs.existsSync`), and
 *   2. responds successfully to `<path> --version` via `spawnImpl`.
 *
 * Returns `null` if no candidate qualifies.
 *
 * Falsy / empty / undefined entries in `candidates` are skipped — this
 * makes it ergonomic to splice in `process.env.BATON_*_BIN` without a
 * separate filter step.
 */
export function probeKnownPaths(
  candidates: ReadonlyArray<string | undefined>,
  spawnImpl: SpawnFn,
): ProbeMatch | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!existsSync(candidate)) continue;
    let result: ReturnType<SpawnFn>;
    try {
      result = spawnImpl(candidate, ['--version'], {
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      });
    } catch {
      continue;
    }
    if (result.error) continue;
    if (typeof result.status === 'number' && result.status !== 0) continue;
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const match = SEMVER_RE.exec(out);
    return match ? { path: candidate, version: match[1] as string } : { path: candidate };
  }
  return null;
}
