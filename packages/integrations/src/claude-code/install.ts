import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  InstallFailedError,
  IntegrationNotAvailableError,
  PluginDirUnresolvedError,
} from '../errors.js';
import { upsertRecord } from '../state.js';
import type { InstallOpts, InstallPlan, InstallResult } from '../types.js';
import { detect } from './detect.js';
import {
  HOOK_EVENTS,
  PLUGIN_FILES,
  PLUGIN_NAME,
  PRE_COMPACT_EVENT,
  SESSION_END_EVENT,
  STOP_EVENT,
} from './plugin/assets.js';
import { expandHome, probePluginDir } from './probe.js';
import { applyHookRegistrations, defaultSettingsPath } from './settings.js';

const ID = 'claude-code';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function resolvePluginDir(opts: InstallOpts, version: string | undefined): Promise<string> {
  if (opts.pluginDir) return expandHome(opts.pluginDir);
  const probed = version ? await probePluginDir(version) : null;
  if (probed) return probed;
  throw new PluginDirUnresolvedError(
    ID,
    'could not locate Claude Code plugin directory; pass --plugin-dir <path> to override',
  );
}

/**
 * Compute the plan that `install()` would execute. Pure: no side
 * effects on disk. Used by `dryRun()` and shared by the install path
 * to keep the two in sync (one source of truth for the file list).
 */
export async function buildPlan(
  opts: InstallOpts,
): Promise<{ plan: InstallPlan; pluginDir: string }> {
  const det = await detect();
  if (!det.installed && !opts.pluginDir) {
    throw new IntegrationNotAvailableError(ID, det.reason ?? 'not detected');
  }
  const pluginDir = await resolvePluginDir(opts, det.version);
  const baseDir = join(pluginDir, PLUGIN_NAME);
  const filesCreated = PLUGIN_FILES.map((f) => join(baseDir, f.path));
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  const plan: InstallPlan = {
    integrationId: ID,
    mode: 'native-hook',
    filesCreated,
    filesModified: [settingsPath],
    externalConfigChanges: [
      `register PreCompact, Stop, SessionEnd hooks in ${settingsPath} (existing keys preserved)`,
    ],
    hookEvents: [...HOOK_EVENTS],
    fallbackUsed: false,
    warnings: det.installed
      ? []
      : [
          'claude-code not detected on PATH; installing files anyway because --plugin-dir was provided',
        ],
  };
  return { plan, pluginDir };
}

export async function install(opts: InstallOpts): Promise<InstallResult> {
  const { plan, pluginDir } = await buildPlan(opts);
  const baseDir = join(pluginDir, PLUGIN_NAME);
  const recordedFiles: { path: string; sha256: string }[] = [];

  try {
    mkdirSync(baseDir, { recursive: true });
    for (const file of PLUGIN_FILES) {
      const target = join(baseDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content, 'utf8');
      if (file.executable && process.platform !== 'win32') {
        chmodSync(target, 0o755);
      }
      recordedFiles.push({ path: target, sha256: sha256(file.content) });
    }
  } catch (err) {
    throw new InstallFailedError(
      ID,
      `failed to write plugin files: ${(err as Error).message}`,
      err,
    );
  }

  // Register the hook scripts in Claude Code's settings.json. Without
  // this, the script files written above are dormant — Claude Code only
  // loads hooks listed in settings.hooks. The scriptsDir prefix lets
  // uninstall identify our entries precisely without touching unrelated
  // tools' hooks.
  const scriptsDir = `${join(baseDir, 'hooks')}/`;
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  try {
    applyHookRegistrations(settingsPath, scriptsDir, [
      { event: PRE_COMPACT_EVENT, command: join(baseDir, 'hooks', 'pre-compact.sh') },
      { event: STOP_EVENT, command: join(baseDir, 'hooks', 'stop.sh') },
      { event: SESSION_END_EVENT, command: join(baseDir, 'hooks', 'session-end.sh') },
    ]);
  } catch (err) {
    throw new InstallFailedError(
      ID,
      `failed to register hooks in settings.json: ${(err as Error).message}`,
      err,
    );
  }

  const repoRoot = opts.repoRoot ?? process.cwd();
  upsertRecord(repoRoot, {
    id: ID,
    mode: 'native-hook',
    installedAt: new Date().toISOString(),
    pluginDir,
    files: recordedFiles,
    backupRefs: [],
    settingsPath,
    scriptsDir,
  });

  return { plan, backups: [] };
}
