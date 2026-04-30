import { spawnSync } from 'node:child_process';
import { existsSync as fsExistsSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';
import type { LintFsAccessor, LintGitRefResolver } from '@batonai/lint';

/**
 * RepoContext is the compiler's view of the repo at compile time. It is
 * passed into the assemble step (which serializes the persisted
 * `repo_context` slice into the packet) and exposes sandboxed accessors
 * (`fs`, `gitRefs`) that BTN012/BTN013 use during lint.
 *
 * Heavy `simple-git` access is lazy-loaded inside the function bodies
 * below to keep the cold-start path of `baton failover --fast` free of
 * git-spawn overhead (CLAUDE.md invariant 2). Built-in node modules
 * (`node:fs`, `node:path`, `node:child_process`) are imported normally;
 * they're already in the warm Node startup set.
 */
export interface RepoContext {
  attached: boolean;
  root?: string;
  vcs?: 'git' | 'none';
  branch?: string | null;
  baseBranch?: string | null;
  commit?: string | null;
  baseCommit?: string | null;
  dirty?: boolean;
  /** Sandboxed read-only fs accessor used by BTN012. */
  fs?: LintFsAccessor;
  /** Sandboxed git ref resolver used by BTN013. */
  gitRefs?: LintGitRefResolver;
}

export interface AttachRepoOptions {
  root: string;
  /** Override the default base-branch heuristic (otherwise main, then master). */
  baseBranch?: string;
}

/**
 * attachRepo({ root }): looks up the repo context for the given root.
 *
 * Returns `{ attached: false, vcs: 'none' }` if `root` is not inside a
 * git repository or if the `git` binary is not usable on this system.
 * Never throws — failure modes always degrade to an unattached context.
 */
export async function attachRepo(opts: AttachRepoOptions): Promise<RepoContext> {
  const { root } = opts;

  // Lazy-load simple-git to keep it off the cold path.
  let simpleGit: typeof import('simple-git').simpleGit;
  try {
    ({ simpleGit } = await import('simple-git'));
  } catch {
    return unattached();
  }

  let git: ReturnType<typeof simpleGit>;
  try {
    git = simpleGit(root);
  } catch {
    return unattached();
  }

  let isRepo = false;
  try {
    isRepo = await git.checkIsRepo();
  } catch {
    return unattached();
  }
  if (!isRepo) return unattached();

  let branch: string | null = null;
  let commit: string | null = null;
  let dirty = false;
  try {
    const raw = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    branch = raw.length > 0 ? raw : null;
    if (branch === 'HEAD') branch = null; // detached HEAD
  } catch {
    /* leave null */
  }
  try {
    const raw = (await git.revparse(['HEAD'])).trim();
    commit = raw.length > 0 ? raw : null;
  } catch {
    /* leave null */
  }
  try {
    const status = await git.raw(['status', '--porcelain']);
    dirty = status.trim().length > 0;
  } catch {
    /* leave false */
  }

  // Base branch resolution: explicit > main > master > null.
  const baseBranch = await resolveBaseBranch(git, opts.baseBranch);
  let baseCommit: string | null = null;
  if (baseBranch !== null) {
    try {
      const raw = (await git.revparse([baseBranch])).trim();
      baseCommit = raw.length > 0 ? raw : null;
    } catch {
      baseCommit = null;
    }
  }

  return {
    attached: true,
    root,
    vcs: 'git',
    branch,
    baseBranch,
    commit,
    baseCommit,
    dirty,
    fs: makeFsAccessor(root),
    gitRefs: makeGitRefResolver(root),
  };
}

function unattached(): RepoContext {
  return { attached: false, vcs: 'none' };
}

async function resolveBaseBranch(
  git: ReturnType<typeof import('simple-git').simpleGit>,
  override: string | undefined,
): Promise<string | null> {
  if (typeof override === 'string' && override.length > 0) return override;
  for (const candidate of ['main', 'master']) {
    try {
      await git.revparse(['--verify', candidate]);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Build a sandboxed fs accessor.
 *
 * Sandboxing contract: the accessor verifies the queried path resolves
 * to a location *inside* `root` after normalization. Both relative and
 * absolute path inputs are accepted — relative paths are resolved
 * against `root`, absolute paths are accepted only if their normalized
 * form starts with `root` (defends against `..` traversal regardless
 * of how the caller framed the path).
 *
 * BTN012 hands the accessor `join(repo_context.root, item.ref)` (an
 * absolute path) when `repo_context.root` is set, so accepting
 * absolute paths is required. BTN012 itself rejects unsafe `ref`
 * values (absolute, `..` traversal) before reaching us; this
 * accessor's check is defense in depth.
 */
function makeFsAccessor(root: string): LintFsAccessor {
  const normalizedRoot = normalize(root);
  const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
  return {
    existsSync(p: string): boolean {
      if (typeof p !== 'string' || p.length === 0) return false;
      const candidate = isAbsolute(p) ? normalize(p) : normalize(join(root, p));
      if (candidate !== normalizedRoot && !candidate.startsWith(rootWithSep)) {
        return false;
      }
      try {
        return fsExistsSync(candidate);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Build a git ref resolver that shells out to `git rev-parse --verify
 * <ref>`. The resolver is synchronous (BTN013 invokes it in a sync rule
 * `check`), so we use `spawnSync` rather than `simple-git` here.
 *
 * Trichotomy:
 *  - `'resolved'`    — the ref exists.
 *  - `'unresolved'`  — git ran but reported the ref does not exist.
 *  - `'unavailable'` — the git binary itself is unusable. BTN013
 *    silently skips findings for `'unavailable'`.
 */
function makeGitRefResolver(root: string): LintGitRefResolver {
  return {
    resolves(ref: string): 'resolved' | 'unresolved' | 'unavailable' {
      if (typeof ref !== 'string' || ref.length === 0) return 'unavailable';
      try {
        const res = spawnSync('git', ['rev-parse', '--verify', ref], {
          cwd: root,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        if (res.error) return 'unavailable';
        if (typeof res.status !== 'number') return 'unavailable';
        return res.status === 0 ? 'resolved' : 'unresolved';
      } catch {
        return 'unavailable';
      }
    },
  };
}
