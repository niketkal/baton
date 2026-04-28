import { removeRecord } from '../state.js';

/**
 * Paste mode wrote no files; uninstall just removes the manifest
 * entry so `baton status` stops listing the integration.
 */
export async function uninstall(opts?: { repoRoot?: string }): Promise<void> {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  removeRecord(repoRoot, 'cursor');
}
