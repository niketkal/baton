import { upsertRecord } from '../state.js';
import type { InstallOpts, InstallPlan, InstallResult } from '../types.js';

const ID = 'cursor';

/**
 * Cursor v1 install is a no-op on disk: the integration is just a
 * recorded preference that the user wants paste-flow handoffs. The
 * actual paste workflow is `baton render --target cursor --copy`
 * followed by the user pasting into Cursor's chat panel.
 *
 * Tech spec §8.3: native integration is deferred until Cursor exposes
 * a hook surface or Baton ships a forked transcript reader.
 */
export async function buildPlan(_opts: InstallOpts): Promise<InstallPlan> {
  return {
    integrationId: ID,
    mode: 'paste',
    filesCreated: [],
    filesModified: [],
    externalConfigChanges: [],
    hookEvents: [],
    fallbackUsed: false,
    warnings: [
      'cursor uses paste-only flow in v1: no files installed; render with --target cursor --copy and paste into Cursor.',
    ],
  };
}

export async function install(opts: InstallOpts): Promise<InstallResult> {
  const plan = await buildPlan(opts);
  const repoRoot = opts.repoRoot ?? process.cwd();
  upsertRecord(repoRoot, {
    id: ID,
    mode: 'paste',
    installedAt: new Date().toISOString(),
    pluginDir: '',
    files: [],
    backupRefs: [],
  });
  return { plan, backups: [] };
}
