import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assessFreshness } from '../src/freshness.js';
import { type RepoContext, attachRepo } from '../src/repo.js';
import type { Packet } from '../src/types.js';

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

/**
 * Build a minimal Packet stub. assessFreshness only inspects
 * `repo_context.commit` and `context_items`, so we cast to keep the
 * test focused.
 */
function packet(commit: string, refs: Array<{ kind: string; ref: string }>): Packet {
  return {
    repo_context: { commit },
    context_items: refs.map((r) => ({ kind: r.kind, ref: r.ref })),
  } as unknown as Packet;
}

let tmp: string;
let firstCommit: string;
let secondCommit: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-fresh-'));
  git(tmp, 'init', '-q', '-b', 'main');
  writeFileSync(join(tmp, 'tracked.ts'), 'const a = 1;\n');
  writeFileSync(join(tmp, 'unrelated.txt'), 'untouched\n');
  git(tmp, 'add', '.');
  git(tmp, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  firstCommit = git(tmp, 'rev-parse', 'HEAD');
  writeFileSync(join(tmp, 'tracked.ts'), 'const a = 2;\n');
  git(tmp, 'add', '.');
  git(tmp, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'second');
  secondCommit = git(tmp, 'rev-parse', 'HEAD');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('assessFreshness', () => {
  it('returns stale=false when repo is unattached', async () => {
    const repo: RepoContext = { attached: false, vcs: 'none' };
    const result = await assessFreshness(packet(firstCommit, []), repo);
    expect(result.stale).toBe(false);
    expect(result.reason).toMatch(/not attached/);
  });

  it('returns stale=false when packet commit equals repo HEAD', async () => {
    const repo = await attachRepo({ root: tmp });
    expect(repo.commit).toBe(secondCommit);
    const result = await assessFreshness(
      packet(secondCommit, [{ kind: 'file', ref: 'tracked.ts' }]),
      repo,
    );
    expect(result.stale).toBe(false);
  });

  it('returns stale=false when HEAD moved but no referenced file changed', async () => {
    const repo = await attachRepo({ root: tmp });
    const result = await assessFreshness(
      packet(firstCommit, [{ kind: 'file', ref: 'unrelated.txt' }]),
      repo,
    );
    expect(result.stale).toBe(false);
    expect(result.reason).toMatch(/referenced files unchanged/);
  });

  it('returns stale=true when HEAD moved and a referenced file changed', async () => {
    const repo = await attachRepo({ root: tmp });
    const result = await assessFreshness(
      packet(firstCommit, [
        { kind: 'file', ref: 'tracked.ts' },
        { kind: 'file', ref: 'unrelated.txt' },
      ]),
      repo,
    );
    expect(result.stale).toBe(true);
    expect(result.changedFiles).toEqual(['tracked.ts']);
    expect(result.reason).toMatch(/1 referenced file changed/);
  });
});
