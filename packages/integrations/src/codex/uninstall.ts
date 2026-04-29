import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { findRecord, removeRecord } from '../state.js';

const ID = 'codex';

function sha256OfFile(p: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(p)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Remove the codex shim file iff its on-disk sha256 matches what we
 * recorded at install time. Mirrors the safety check in
 * `claude-code/uninstall.ts`: a user-edited shim is considered owned by
 * the user and left in place.
 */
export async function uninstall(opts?: { repoRoot?: string }): Promise<void> {
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const record = findRecord(repoRoot, ID);
  if (!record) return;

  for (const f of record.files) {
    if (!existsSync(f.path)) continue;
    const actual = sha256OfFile(f.path);
    if (actual !== f.sha256) continue;
    try {
      rmSync(f.path);
    } catch {
      // best effort
    }
  }

  removeRecord(repoRoot, ID);
}
