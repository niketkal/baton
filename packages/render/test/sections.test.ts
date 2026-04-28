import { describe, expect, it } from 'vitest';
import {
  sectionAcceptanceCriteria,
  sectionAttempts,
  sectionConstraints,
  sectionContextItems,
  sectionCurrentState,
  sectionNextAction,
  sectionObjective,
  sectionOpenQuestions,
  sectionProvenance,
  sectionRepo,
} from '../src/templates/sections.js';

describe('sectionObjective', () => {
  it('renders heading + text', () => {
    expect(sectionObjective('Fix the bug')).toBe('## Objective\n\nFix the bug');
  });
});

describe('sectionCurrentState', () => {
  it('renders heading + text', () => {
    expect(sectionCurrentState('In progress')).toBe('## Current State\n\nIn progress');
  });
});

describe('sectionNextAction', () => {
  it('renders heading + text', () => {
    expect(sectionNextAction('Deploy fix')).toBe('## Next Action\n\nDeploy fix');
  });
});

describe('sectionAcceptanceCriteria', () => {
  it('returns empty string for empty array', () => {
    expect(sectionAcceptanceCriteria([])).toBe('');
  });

  it('marks met criteria with [x]', () => {
    const result = sectionAcceptanceCriteria([
      {
        id: 'ac-1',
        text: 'Tests pass',
        status: 'met',
        required: true,
        source: 'user',
        provenance_refs: [],
      },
    ]);
    expect(result).toContain('[x] Tests pass');
  });

  it('marks unmet criteria with [ ]', () => {
    const result = sectionAcceptanceCriteria([
      {
        id: 'ac-1',
        text: 'Tests pass',
        status: 'unmet',
        required: true,
        source: 'user',
        provenance_refs: [],
      },
    ]);
    expect(result).toContain('[ ] Tests pass');
  });

  it('appends _(optional)_ for non-required criteria', () => {
    const result = sectionAcceptanceCriteria([
      {
        id: 'ac-1',
        text: 'Nice to have',
        status: 'unmet',
        required: false,
        source: 'user',
        provenance_refs: [],
      },
    ]);
    expect(result).toContain('_(optional)_');
  });
});

describe('sectionOpenQuestions', () => {
  it('returns empty string for empty array', () => {
    expect(sectionOpenQuestions([])).toBe('');
  });

  it('returns empty string when all questions are answered', () => {
    const result = sectionOpenQuestions([
      { id: 'oq-1', text: 'Done?', blocking: false, status: 'answered' },
    ]);
    expect(result).toBe('');
  });

  it('includes open questions', () => {
    const result = sectionOpenQuestions([
      { id: 'oq-1', text: 'Which branch?', blocking: false, status: 'open' },
    ]);
    expect(result).toContain('Which branch?');
  });

  it('appends blocking flag for blocking questions', () => {
    const result = sectionOpenQuestions([
      { id: 'oq-1', text: 'Blocker?', blocking: true, status: 'open' },
    ]);
    expect(result).toContain('**blocking**');
  });
});

describe('sectionConstraints', () => {
  it('returns empty string for empty array', () => {
    expect(sectionConstraints([])).toBe('');
  });

  it('renders severity and text', () => {
    const result = sectionConstraints([
      {
        id: 'c-1',
        type: 'policy',
        text: 'No breaking changes',
        severity: 'error',
        source: 'user',
        provenance_refs: ['x'],
      },
    ]);
    expect(result).toContain('**[error]**');
    expect(result).toContain('No breaking changes');
  });
});

describe('sectionContextItems', () => {
  it('returns empty string for empty array', () => {
    expect(sectionContextItems([])).toBe('');
  });

  it('returns empty string when limit is 0', () => {
    const items = [
      {
        kind: 'file' as const,
        ref: 'src/a.ts',
        reason: 'Key file',
        priority: 1,
        freshness_score: 1,
        provenance_refs: [],
      },
    ];
    expect(sectionContextItems(items, 0)).toBe('');
  });

  it('sorts by priority ascending', () => {
    const items = [
      {
        kind: 'file' as const,
        ref: 'b.ts',
        reason: 'B',
        priority: 2,
        freshness_score: 1,
        provenance_refs: [],
      },
      {
        kind: 'file' as const,
        ref: 'a.ts',
        reason: 'A',
        priority: 1,
        freshness_score: 1,
        provenance_refs: [],
      },
    ];
    const result = sectionContextItems(items);
    expect(result.indexOf('a.ts')).toBeLessThan(result.indexOf('b.ts'));
  });

  it('respects limit', () => {
    const items = [
      {
        kind: 'file' as const,
        ref: 'a.ts',
        reason: 'A',
        priority: 1,
        freshness_score: 1,
        provenance_refs: [],
      },
      {
        kind: 'file' as const,
        ref: 'b.ts',
        reason: 'B',
        priority: 2,
        freshness_score: 1,
        provenance_refs: [],
      },
    ];
    const result = sectionContextItems(items, 1);
    expect(result).toContain('a.ts');
    expect(result).not.toContain('b.ts');
  });

  it('escapes pipe characters in ref and reason', () => {
    const items = [
      {
        kind: 'file' as const,
        ref: 'a|b.ts',
        reason: 'has|pipe',
        priority: 1,
        freshness_score: 1,
        provenance_refs: [],
      },
    ];
    const result = sectionContextItems(items);
    expect(result).toContain('\\|');
  });
});

describe('sectionAttempts', () => {
  it('returns empty string for empty array', () => {
    expect(sectionAttempts([])).toBe('');
  });

  it('renders attempt with tool and result', () => {
    const result = sectionAttempts([
      {
        id: 'a-1',
        tool: 'claude-code',
        summary: 'Tried X',
        result: 'partial',
        failure_reason: null,
        artifact_refs: [],
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(result).toContain('claude-code');
    expect(result).toContain('partial');
    expect(result).toContain('Tried X');
  });

  it('includes failure reason when present', () => {
    const result = sectionAttempts([
      {
        id: 'a-1',
        tool: 'claude-code',
        summary: 'Tried X',
        result: 'failed',
        failure_reason: 'timeout',
        artifact_refs: [],
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(result).toContain('timeout');
  });
});

describe('sectionRepo', () => {
  it('returns empty string when not attached', () => {
    const result = sectionRepo({
      attached: false,
      root: null,
      vcs: 'none',
      branch: null,
      base_branch: null,
      commit: null,
      base_commit: null,
      dirty: false,
    });
    expect(result).toBe('');
  });

  it('renders branch, base, commit, and state when attached', () => {
    const result = sectionRepo({
      attached: true,
      root: '/repo',
      vcs: 'git',
      branch: 'main',
      base_branch: 'main',
      commit: 'abc12345def',
      base_commit: 'def',
      dirty: false,
    });
    expect(result).toContain('`main`');
    expect(result).toContain('`abc12345`');
    expect(result).toContain('Clean');
  });

  it('shows Dirty when repo is dirty', () => {
    const result = sectionRepo({
      attached: true,
      root: '/repo',
      vcs: 'git',
      branch: 'feat',
      base_branch: 'main',
      commit: 'abc1234',
      base_commit: null,
      dirty: true,
    });
    expect(result).toContain('Dirty');
  });
});

describe('sectionProvenance', () => {
  it('returns empty string for empty array', () => {
    expect(sectionProvenance([])).toBe('');
  });

  it('renders field_name, source_type, ref, excerpt', () => {
    const result = sectionProvenance([
      {
        id: 'p-1',
        field_name: 'objective',
        artifact_id: 'a-1',
        source_type: 'transcript',
        ref: 'transcript.md',
        span_start: null,
        span_end: null,
        excerpt: 'some text',
      },
    ]);
    expect(result).toContain('objective');
    expect(result).toContain('transcript');
    expect(result).toContain('some text');
  });
});
