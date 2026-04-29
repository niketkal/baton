import { findRecord } from '../state.js';
import type { IntegrationMode, IntegrationStatus } from '../types.js';

export async function status(opts?: { repoRoot?: string }): Promise<IntegrationStatus | null> {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const record = findRecord(repoRoot, 'cursor');
  if (!record) return null;
  return {
    id: record.id,
    mode: record.mode as IntegrationMode,
    installedAt: record.installedAt,
    pluginDir: record.pluginDir,
    backupRefs: record.backupRefs,
  };
}
