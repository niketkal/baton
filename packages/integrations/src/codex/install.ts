import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { InstallFailedError } from '../errors.js';
import { upsertRecord } from '../state.js';
import type { InstallOpts, InstallPlan, InstallResult } from '../types.js';
import { SHIM_CONTENT, SHIM_FILENAME } from './shim.js';

const ID = 'codex';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Resolve the directory the shim should be written to.
 *
 *   1. `opts.pluginDir` if provided (test seam + power users).
 *   2. `$BATON_CODEX_INSTALL_DIR` if set.
 *   3. `~/.local/bin` — XDG-friendly default. Per tech spec §8.2 we
 *      DO NOT touch PATH; the user opts in by adding this dir to PATH
 *      themselves or invoking `baton-codex` directly.
 */
function resolveInstallDir(opts: InstallOpts): string {
  if (opts.pluginDir) return opts.pluginDir;
  const fromEnv = process.env.BATON_CODEX_INSTALL_DIR;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return join(homedir(), '.local', 'bin');
}

export async function buildPlan(
  opts: InstallOpts,
): Promise<{ plan: InstallPlan; installDir: string; shimPath: string }> {
  const installDir = resolveInstallDir(opts);
  const shimPath = join(installDir, SHIM_FILENAME);
  const warnings: string[] = [];
  if (existsSync(shimPath) && !opts.force) {
    warnings.push(
      `${shimPath} already exists; pass --force to overwrite (sha256 mismatch will be recorded).`,
    );
  }
  const plan: InstallPlan = {
    integrationId: ID,
    mode: 'wrapper-launcher',
    filesCreated: [shimPath],
    filesModified: [],
    externalConfigChanges: [],
    hookEvents: [],
    fallbackUsed: false,
    warnings,
  };
  return { plan, installDir, shimPath };
}

export async function install(opts: InstallOpts): Promise<InstallResult> {
  const { plan, installDir, shimPath } = await buildPlan(opts);

  try {
    mkdirSync(installDir, { recursive: true });
    writeFileSync(shimPath, SHIM_CONTENT, 'utf8');
    if (process.platform !== 'win32') {
      chmodSync(shimPath, 0o755);
    }
  } catch (err) {
    throw new InstallFailedError(ID, `failed to write codex shim: ${(err as Error).message}`, err);
  }

  const repoRoot = opts.repoRoot ?? process.cwd();
  upsertRecord(repoRoot, {
    id: ID,
    mode: 'wrapper-launcher',
    installedAt: new Date().toISOString(),
    pluginDir: installDir,
    files: [{ path: shimPath, sha256: sha256(SHIM_CONTENT) }],
    backupRefs: [],
  });

  return { plan, backups: [] };
}
