import type { RepoContext } from './repo.js';
import type { Packet } from './types.js';

/**
 * Result of comparing a packet's recorded git ref against the current
 * repo state. BTN014 consumes this directly via `LintContext.freshness`.
 *
 * Conservative semantics per docs/spec/lint-rules.md (BTN014):
 *  - HEAD moved AND a referenced file changed → `stale: true`.
 *  - HEAD moved but no referenced files changed → `stale: false` with
 *    a "HEAD moved..." reason (the CLI may surface this as a warning,
 *    but BTN014 itself does not fire).
 *  - Same commit, or repo unattached → `stale: false`.
 */
export interface FreshnessAssessment {
  stale: boolean;
  reason?: string;
  /** Referenced files (matching `context_items[].ref`) that changed. */
  changedFiles?: string[];
}

/** Context-item kinds whose `ref` is interpreted as a repo-relative path. */
const PATH_REF_KINDS = new Set(['file', 'test', 'diff', 'log']);

interface PacketWithRepoContext {
  context_items?: unknown;
  repo_context?: { commit?: unknown };
}

/**
 * assessFreshness(packet, repo): compares the packet's recorded
 * `repo_context.commit` against the live repo HEAD.
 *
 * Returns `{ stale: false }` when the repo isn't attached, when commits
 * match, when the diff cannot be computed, or when no referenced file
 * appears in the changed-file set. Only fires `stale: true` when both
 * (a) HEAD has moved and (b) a referenced file is in the diff.
 */
export async function assessFreshness(
  packet: Packet,
  repo: RepoContext,
): Promise<FreshnessAssessment> {
  if (!repo.attached || !repo.commit || !repo.root) {
    return { stale: false, reason: 'repo not attached' };
  }

  const recorded = (packet as PacketWithRepoContext).repo_context?.commit;
  if (typeof recorded !== 'string' || recorded.length === 0) {
    return { stale: false, reason: 'packet has no recorded commit' };
  }
  if (recorded === repo.commit) {
    return { stale: false };
  }

  // Lazy-load simple-git per the cold-load discipline.
  let simpleGit: typeof import('simple-git').simpleGit;
  try {
    ({ simpleGit } = await import('simple-git'));
  } catch {
    return { stale: false, reason: 'git unavailable' };
  }

  let changedRaw: string;
  try {
    changedRaw = await simpleGit(repo.root).diff(['--name-only', recorded, repo.commit]);
  } catch {
    // Conservative: if we can't tell, don't fire BTN014. The compile
    // pipeline still emits a warning surface for the missing diff.
    return { stale: false, reason: 'unable to diff packet commit against HEAD' };
  }
  const changed = new Set(
    changedRaw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
  if (changed.size === 0) {
    return { stale: false, reason: 'HEAD moved but no files changed' };
  }

  const items = (packet as PacketWithRepoContext).context_items;
  const referenced: string[] = [];
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (raw === null || typeof raw !== 'object') continue;
      const item = raw as { kind?: unknown; ref?: unknown };
      if (typeof item.kind !== 'string' || !PATH_REF_KINDS.has(item.kind)) continue;
      if (typeof item.ref !== 'string' || item.ref.length === 0) continue;
      referenced.push(item.ref);
    }
  }

  const changedFiles = referenced.filter((ref) => changed.has(ref));
  if (changedFiles.length === 0) {
    return { stale: false, reason: 'HEAD moved but referenced files unchanged' };
  }

  return {
    stale: true,
    reason: `${changedFiles.length} referenced file${changedFiles.length === 1 ? '' : 's'} changed since packet compiled`,
    changedFiles,
  };
}
