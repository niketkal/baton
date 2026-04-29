import { spawnSync } from 'node:child_process';
import type { DetectResult } from '../types.js';

/**
 * Cursor doesn't expose a stable CLI surface that we'd shell out to,
 * and its chat transcript isn't visible to sibling processes (tech
 * spec §8.3). For the v1 paste-only integration we therefore *always*
 * return `installed: true` — the user is the one who knows whether
 * Cursor is on their box; our role is only to record that they want
 * the paste flow.
 *
 * We still try `cursor --version` as a courtesy: if it succeeds we
 * surface the version string for `baton status`, but a failure does
 * NOT mark the integration unavailable.
 */

type SpawnFn = typeof spawnSync;

let spawnImpl: SpawnFn = spawnSync;

/** Test-only seam. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? spawnSync;
}

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

export async function detect(): Promise<DetectResult> {
  try {
    const r = spawnImpl('cursor', ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
    if (r.error || (typeof r.status === 'number' && r.status !== 0)) {
      return { installed: true, reason: 'paste-only mode (cursor --version not detected)' };
    }
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const m = SEMVER_RE.exec(out);
    if (m) return { installed: true, version: m[1] as string };
    return { installed: true };
  } catch {
    return { installed: true, reason: 'paste-only mode (cursor binary not on PATH)' };
  }
}
