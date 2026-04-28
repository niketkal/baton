// TODO(Session 13): real implementation will use simple-git to detect the
// repo, branch, base branch, current commit, base commit, and dirty state.
// This placeholder returns an unattached context so the pipeline can build
// a schema-valid packet today without taking on the repo-awareness work.

export interface RepoContext {
  attached: boolean;
  root: string | null;
  branch: string | null;
  baseBranch: string | null;
  commit: string | null;
  baseCommit: string | null;
  isDirty: boolean;
}

export function attachRepo(_root: string): RepoContext {
  return {
    attached: false,
    root: null,
    branch: null,
    baseBranch: null,
    commit: null,
    baseCommit: null,
    isDirty: false,
  };
}
