import { spawnSync } from 'node:child_process';
import type { DetectResult } from '../types.js';

/**
 * Detect a local Codex CLI install by spawning `codex --version`.
 * Mirrors `claude-code/detect.ts`: never throws; absence -> `installed: false`.
 */

type SpawnFn = typeof spawnSync;

let spawnImpl: SpawnFn = spawnSync;

/** Test-only seam. Not exported from the package index. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? spawnSync;
}

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

export async function detect(): Promise<DetectResult> {
  let result: ReturnType<SpawnFn>;
  try {
    result = spawnImpl('codex', ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
  } catch (_err) {
    return { installed: false, reason: 'codex binary not found on PATH' };
  }

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { installed: false, reason: 'codex binary not found on PATH' };
    }
    return { installed: false, reason: `codex --version failed: ${result.error.message}` };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    return { installed: false, reason: `codex --version exited ${result.status}` };
  }

  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const match = SEMVER_RE.exec(out);
  if (!match) {
    // Codex may print its version in a non-semver form. Treat as installed
    // but mark version unknown — opt-in wrapper still works.
    return { installed: true };
  }
  return { installed: true, version: match[1] as string };
}
