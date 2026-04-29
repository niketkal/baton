import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachRepo } from '../src/repo.js';

function git(cwd: string, ...args: string[]): string {
  return execSync(`git ${args.join(' ')}`, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-repo-'));
  git(tmp, 'init', '-q', '-b', 'main');
  writeFileSync(join(tmp, 'README.md'), '# test\n');
  git(tmp, 'add', 'README.md');
  git(tmp, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'initial');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('attachRepo', () => {
  it('attaches to an initialised repo with branch + commit + clean status', async () => {
    const ctx = await attachRepo({ root: tmp });
    expect(ctx.attached).toBe(true);
    expect(ctx.vcs).toBe('git');
    expect(ctx.root).toBe(tmp);
    expect(ctx.branch).toBe('main');
    expect(ctx.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.dirty).toBe(false);
    expect(ctx.baseBranch).toBe('main');
    expect(ctx.baseCommit).toBe(ctx.commit);
  });

  it('reports dirty=true when the working tree has uncommitted changes', async () => {
    writeFileSync(join(tmp, 'dirty.txt'), 'changed\n');
    const ctx = await attachRepo({ root: tmp });
    expect(ctx.attached).toBe(true);
    expect(ctx.dirty).toBe(true);
  });

  it('returns attached=false / vcs=none for a non-repo directory', async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'baton-norepo-'));
    try {
      const ctx = await attachRepo({ root: nonRepo });
      expect(ctx.attached).toBe(false);
      expect(ctx.vcs).toBe('none');
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });

  it('honours an explicit baseBranch override', async () => {
    git(tmp, 'checkout', '-q', '-b', 'feature');
    const ctx = await attachRepo({ root: tmp, baseBranch: 'main' });
    expect(ctx.branch).toBe('feature');
    expect(ctx.baseBranch).toBe('main');
  });

  describe('repo.fs accessor', () => {
    it('resolves repo-relative paths against root', async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.fs?.existsSync('README.md')).toBe(true);
      expect(ctx.fs?.existsSync('does-not-exist.txt')).toBe(false);
    });

    it('accepts an absolute path that lies inside the repo root', async () => {
      const ctx = await attachRepo({ root: tmp });
      // BTN012 hands the accessor `join(repo.root, ref)` — an absolute
      // path — so this must succeed for files inside the sandbox.
      expect(ctx.fs?.existsSync(join(tmp, 'README.md'))).toBe(true);
    });

    it('rejects an absolute path outside the repo root', async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.fs?.existsSync('/etc/hosts')).toBe(false);
    });

    it('rejects `..` traversal that escapes the repo root', async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.fs?.existsSync('../README.md')).toBe(false);
      expect(ctx.fs?.existsSync('foo/../../README.md')).toBe(false);
    });
  });

  describe('repo.gitRefs resolver', () => {
    it("returns 'resolved' for an existing branch", async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.gitRefs?.resolves('main')).toBe('resolved');
    });

    it("returns 'unresolved' for a nonexistent ref", async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.gitRefs?.resolves('definitely-not-a-real-branch-xyz')).toBe('unresolved');
    });

    it("returns 'resolved' for a real commit sha", async () => {
      const ctx = await attachRepo({ root: tmp });
      expect(ctx.commit).toBeTruthy();
      expect(ctx.gitRefs?.resolves(ctx.commit ?? '')).toBe('resolved');
    });
  });
});
