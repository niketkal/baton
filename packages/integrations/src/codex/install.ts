import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { InstallFailedError } from '../errors.js';
import { upsertRecord } from '../state.js';
import type { InstallOpts, InstallPlan, InstallResult } from '../types.js';
import { shimContentForPlatform, shimFilenameForPlatform } from './shim.js';

const ID = 'codex';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * Resolve the directory the shim should be written to.
 *
 *   1. `opts.pluginDir` if provided (test seam + power users).
 *   2. `$BATON_CODEX_INSTALL_DIR` if set.
 *   3. POSIX: `~/.local/bin` — XDG-friendly default.
 *      Windows: `%LOCALAPPDATA%\baton\bin` (falls back to
 *      `~/.local/bin` if LOCALAPPDATA is somehow unset).
 *
 *  Per tech spec §8.2 we DO NOT touch PATH; the user opts in by adding
 *  this dir to PATH themselves or invoking the shim directly.
 */
function resolveInstallDir(opts: InstallOpts): string {
  if (opts.pluginDir) return opts.pluginDir;
  const fromEnv = process.env.BATON_CODEX_INSTALL_DIR;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData && localAppData.length > 0) {
      return join(localAppData, 'baton', 'bin');
    }
  }
  return join(homedir(), '.local', 'bin');
}

export async function buildPlan(
  opts: InstallOpts,
): Promise<{ plan: InstallPlan; installDir: string; shimPath: string; shimContent: string }> {
  const installDir = resolveInstallDir(opts);
  const filename = shimFilenameForPlatform();
  const shimContent = shimContentForPlatform();
  const shimPath = join(installDir, filename);
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
  return { plan, installDir, shimPath, shimContent };
}

export async function install(opts: InstallOpts): Promise<InstallResult> {
  const { plan, installDir, shimPath, shimContent } = await buildPlan(opts);

  try {
    mkdirSync(installDir, { recursive: true });
    writeFileSync(shimPath, shimContent, 'utf8');
    if (process.platform !== 'win32') {
      // Windows uses extension-based execution; chmod is a no-op there
      // and skipping it avoids spurious EPERM on volumes that don't
      // support POSIX permissions.
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
    files: [{ path: shimPath, sha256: sha256(shimContent) }],
    backupRefs: [],
  });

  return { plan, backups: [] };
}
