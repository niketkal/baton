# @batonai/render — Session 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@batonai/render` with `generic` and `claude-code` renderers that convert a `BatonPacket` into target-specific markdown, snapshot-stable, with token estimation wired through `@batonai/llm`.

**Architecture:** Pure functions — `render(packet, target, options?)` dispatches to a target-specific renderer; each renderer calls shared section helpers from `templates/sections.ts`; `roughEstimate` from `@batonai/llm` gives a token count without async calls or provider knowledge.

**Tech Stack:** TypeScript 5.x strict ESM, vitest 2.1 `toMatchFileSnapshot`, `@batonai/schema` for `BatonPacket` type, `@batonai/llm` for `roughEstimate`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/render/package.json` | Add `@batonai/llm: workspace:*` dep |
| Create | `packages/render/src/types.ts` | `RenderTarget`, `RenderOptions`, `RenderResult`, `RenderWarning`, `Renderer` |
| Create | `packages/render/src/templates/sections.ts` | Pure section helpers — each takes packet fields and returns a markdown string |
| Create | `packages/render/src/targets/generic.ts` | Neutral markdown renderer — one function, no XML |
| Create | `packages/render/src/targets/claude-code.ts` | Richer renderer with priority-sorted context blocks |
| Create | `packages/render/src/targets/index.ts` | Explicit import of each renderer + `RENDERERS` map |
| Rewrite | `packages/render/src/index.ts` | `render(packet, target, options?)` export |
| Create | `packages/render/test/fixtures/packet-fixture-01.json` | Static `BatonPacket` fixture used by all render tests |
| Create | `packages/render/test/render.test.ts` | Tests for both renderers + snapshot assertions |
| Create | `packages/render/test/snapshots/generic-fixture-01.md.snap` | Auto-created on first run by `toMatchFileSnapshot` |
| Create | `packages/render/test/snapshots/claude-code-fixture-01.md.snap` | Auto-created on first run by `toMatchFileSnapshot` |

---

## Task 1: Add `@batonai/llm` dependency + update tsconfig

**Files:**
- Modify: `packages/render/package.json`
- Modify: `packages/render/tsconfig.json`

- [ ] **Step 1: Update package.json**

Replace `packages/render/package.json` with:

```json
{
  "name": "@batonai/render",
  "version": "0.0.0",
  "license": "Apache-2.0",
  "description": "Baton target-specific renderers (claude-code, codex, cursor, generic).",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@batonai/schema": "workspace:*",
    "@batonai/llm": "workspace:*"
  }
}
```

- [ ] **Step 2: Update tsconfig.json to include test files**

Replace `packages/render/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Install the new dep**

```bash
cd /path/to/repo && pnpm install
```

Expected: lockfile updated with `@batonai/llm` as a dep of `@batonai/render`.

- [ ] **Step 4: Commit**

```bash
git add packages/render/package.json packages/render/tsconfig.json
git commit -m "chore(render): add @batonai/llm dep + expand tsconfig to include tests"
```

---

## Task 2: Write `types.ts`

**Files:**
- Create: `packages/render/src/types.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { BatonPacket } from '@batonai/schema';

export type RenderTarget = 'generic' | 'claude-code' | 'codex' | 'cursor';

/**
 * Caller-supplied options that tune rendering without modifying the packet.
 * These are merged with (and take precedence over) `packet.render_hints`.
 */
export interface RenderOptions {
  /** Soft cap on the token budget. The renderer truncates context items
   *  when the running estimate exceeds this threshold. */
  contextBudget?: number;
  /** Whether to append a provenance table at the bottom. Default false. */
  includeProvenance?: boolean;
}

export interface RenderWarning {
  code: string;
  message: string;
}

export interface RenderResult {
  /** Full rendered markdown string. */
  markdown: string;
  target: RenderTarget;
  /** Rough token estimate via `roughEstimate` from `@batonai/llm`. */
  tokenEstimate: number;
  warnings: RenderWarning[];
  /** True when context items were dropped to stay under `contextBudget`. */
  truncated: boolean;
}

/**
 * Contract every target renderer implements.
 * Implementations must be pure: same packet + options → same markdown.
 */
export interface Renderer {
  readonly target: RenderTarget;
  render(packet: BatonPacket, options?: RenderOptions): RenderResult;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/render/src/types.ts
git commit -m "feat(render): types — RenderTarget, RenderHints, RenderResult, Renderer"
```

---

## Task 3: Write the test fixture packet

**Files:**
- Create: `packages/render/test/fixtures/packet-fixture-01.json`

The fixture must be a complete, schema-valid `BatonPacket` so render tests are self-contained.

- [ ] **Step 1: Create the fixture**

```json
{
  "schema_version": "baton.packet/v1",
  "id": "render-fixture-01",
  "title": "Fix flaky auth test",
  "status": "ready_for_export",
  "validation_level": "valid",
  "task_type": "debugging",
  "objective": "Identify and fix the race condition in auth-flow.spec.ts that causes it to fail on CI one run in three.",
  "current_state": "Reproduced failure on iteration 4 of 10. Root cause is unsynchronised lazy initialisation in fixtures/auth.ts:42.",
  "next_action": "Add a memoisation wrapper around the auth fixture loader and add a regression test using --repeat-each=10.",
  "open_questions": [
    {
      "id": "oq-1",
      "text": "Should the fix land on `main` or the release branch?",
      "blocking": false,
      "status": "open"
    }
  ],
  "confidence_score": 0.85,
  "repo_context": {
    "attached": true,
    "root": "/projects/myapp",
    "vcs": "git",
    "branch": "fix/flaky-auth",
    "base_branch": "main",
    "commit": "abc1234",
    "base_commit": "def5678",
    "dirty": false
  },
  "context_items": [
    {
      "kind": "file",
      "ref": "test/auth-flow.spec.ts",
      "reason": "Flaky test under investigation",
      "priority": 1,
      "freshness_score": 1.0,
      "exists": true,
      "provenance_refs": []
    },
    {
      "kind": "file",
      "ref": "fixtures/auth.ts",
      "reason": "Contains lazy initialisation with the race condition at line 42",
      "priority": 2,
      "freshness_score": 0.9,
      "exists": true,
      "provenance_refs": []
    }
  ],
  "constraints": [
    {
      "id": "con-1",
      "type": "policy",
      "text": "No changes to public auth API surface during the fix.",
      "severity": "error",
      "source": "user",
      "provenance_refs": ["src-1"]
    }
  ],
  "attempts": [
    {
      "id": "att-1",
      "tool": "claude-code",
      "summary": "Reproduced the failure using --repeat-each=10. Traced to unsynchronised lazy init in fixtures/auth.ts:42.",
      "result": "partial",
      "failure_reason": null,
      "artifact_refs": [],
      "created_at": "2026-04-26T10:05:00Z"
    }
  ],
  "acceptance_criteria": [
    {
      "id": "ac-1",
      "text": "auth-flow.spec.ts passes 10/10 with --repeat-each=10 on CI",
      "status": "unmet",
      "required": true,
      "source": "user",
      "provenance_refs": []
    }
  ],
  "warnings": [],
  "provenance_links": [
    {
      "id": "prov-1",
      "field_name": "current_state",
      "artifact_id": "src-1",
      "source_type": "transcript",
      "ref": "transcript-claude-code-01.md",
      "span_start": 100,
      "span_end": 200,
      "excerpt": "Reproduced on iteration 4 of 10."
    }
  ],
  "source_artifacts": [
    {
      "id": "src-1",
      "type": "transcript",
      "source_tool": "claude-code",
      "uri": "transcript-claude-code-01.md",
      "digest": "sha256:abc123def456",
      "created_at": "2026-04-26T10:00:00Z"
    }
  ],
  "created_at": "2026-04-26T10:00:00Z",
  "updated_at": "2026-04-26T10:05:00Z"
}
```

- [ ] **Step 2: Verify it's valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/render/test/fixtures/packet-fixture-01.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add packages/render/test/fixtures/packet-fixture-01.json
git commit -m "test(render): add static packet fixture for renderer tests"
```

---

## Task 4: Write failing tests

**Files:**
- Create: `packages/render/test/render.test.ts`

Write tests before implementation. They import `render` which doesn't exist yet — they should fail with a module error.

- [ ] **Step 1: Write the test file**

```typescript
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatonPacket } from '@batonai/schema';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(): BatonPacket {
  // createRequire lets us JSON.parse a file from an ESM module.
  const req = createRequire(import.meta.url);
  return req('./fixtures/packet-fixture-01.json') as BatonPacket;
}

describe('render — generic target', () => {
  it('returns a non-empty markdown string', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(typeof result.markdown).toBe('string');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "generic"', () => {
    const result = render(loadFixture(), 'generic');
    expect(result.target).toBe('generic');
  });

  it('populates tokenEstimate with a positive number', () => {
    const result = render(loadFixture(), 'generic');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('returns truncated: false when no contextBudget is set', () => {
    const result = render(loadFixture(), 'generic');
    expect(result.truncated).toBe(false);
  });

  it('includes the packet title in the output', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain(packet.title);
  });

  it('includes the objective', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain(packet.objective);
  });

  it('includes current_state', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain(packet.current_state);
  });

  it('includes next_action', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain(packet.next_action);
  });

  it('includes acceptance criteria text', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain(packet.acceptance_criteria[0]?.text ?? '');
  });

  it('includes context item refs', () => {
    const packet = loadFixture();
    const result = render(packet, 'generic');
    expect(result.markdown).toContain('test/auth-flow.spec.ts');
  });

  it('truncates context items when contextBudget is tiny', () => {
    const result = render(loadFixture(), 'generic', { contextBudget: 1 });
    expect(result.truncated).toBe(true);
  });

  it('matches the stored snapshot', async () => {
    const result = render(loadFixture(), 'generic');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'generic-fixture-01.md.snap'),
    );
  });
});

describe('render — claude-code target', () => {
  it('returns a non-empty markdown string', () => {
    const result = render(loadFixture(), 'claude-code');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "claude-code"', () => {
    const result = render(loadFixture(), 'claude-code');
    expect(result.target).toBe('claude-code');
  });

  it('includes the next_action prominently near the top', () => {
    const packet = loadFixture();
    const result = render(packet, 'claude-code');
    const nextActionPos = result.markdown.indexOf(packet.next_action);
    const halfwayMark = result.markdown.length / 2;
    expect(nextActionPos).toBeLessThan(halfwayMark);
  });

  it('includes context item refs', () => {
    const packet = loadFixture();
    const result = render(packet, 'claude-code');
    expect(result.markdown).toContain('test/auth-flow.spec.ts');
  });

  it('produces output distinct from generic', () => {
    const packet = loadFixture();
    const generic = render(packet, 'generic');
    const cc = render(packet, 'claude-code');
    expect(cc.markdown).not.toBe(generic.markdown);
  });

  it('matches the stored snapshot', async () => {
    const result = render(loadFixture(), 'claude-code');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'claude-code-fixture-01.md.snap'),
    );
  });
});

describe('render — unknown target', () => {
  it('throws for an unregistered target', () => {
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
      render(loadFixture(), 'unknown-target' as any),
    ).toThrow(/unknown render target/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @batonai/render test 2>&1 | head -30
```

Expected: error like `Cannot find module '../src/index.js'` or similar — confirms the tests are wired and waiting for implementation.

- [ ] **Step 3: Commit**

```bash
git add packages/render/test/render.test.ts
git commit -m "test(render): write failing render tests for generic + claude-code targets"
```

---

## Task 5: Implement `templates/sections.ts`

**Files:**
- Create: `packages/render/src/templates/sections.ts`

Pure helpers. Each function accepts packet fields (not the whole packet) and returns a trimmed markdown string. No I/O, no async.

- [ ] **Step 1: Write the file**

```typescript
import type {
  AcceptanceCriterion,
  Attempt,
  Constraint,
  ContextItem,
  OpenQuestion,
  ProvenanceLink,
  RepoContext,
} from '@batonai/schema';

export function sectionObjective(objective: string): string {
  return `## Objective\n\n${objective}`;
}

export function sectionCurrentState(currentState: string): string {
  return `## Current State\n\n${currentState}`;
}

export function sectionNextAction(nextAction: string): string {
  return `## Next Action\n\n${nextAction}`;
}

export function sectionAcceptanceCriteria(criteria: AcceptanceCriterion[]): string {
  if (criteria.length === 0) return '';
  const lines = criteria.map((ac) => {
    const check = ac.status === 'met' ? '[x]' : '[ ]';
    const req = ac.required ? '' : ' _(optional)_';
    return `- ${check} ${ac.text}${req}`;
  });
  return `## Acceptance Criteria\n\n${lines.join('\n')}`;
}

export function sectionOpenQuestions(questions: OpenQuestion[]): string {
  const open = questions.filter((q) => q.status === 'open');
  if (open.length === 0) return '';
  const lines = open.map((q) => {
    const flag = q.blocking ? ' ⚠️ **blocking**' : '';
    return `- ${q.text}${flag}`;
  });
  return `## Open Questions\n\n${lines.join('\n')}`;
}

export function sectionConstraints(constraints: Constraint[]): string {
  if (constraints.length === 0) return '';
  const lines = constraints.map((c) => `- **[${c.severity}]** ${c.text}`);
  return `## Constraints\n\n${lines.join('\n')}`;
}

/**
 * Renders context items as a priority-sorted table.
 * `limit` caps the number of rows; callers use this to enforce contextBudget.
 */
export function sectionContextItems(items: ContextItem[], limit?: number): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const rows = limit !== undefined ? sorted.slice(0, limit) : sorted;
  const tableRows = rows.map(
    (ci) => `| ${ci.priority} | ${ci.kind} | \`${ci.ref}\` | ${ci.reason} |`,
  );
  return [
    '## Context',
    '',
    '| Priority | Kind | Path | Reason |',
    '|---|---|---|---|',
    ...tableRows,
  ].join('\n');
}

export function sectionAttempts(attempts: Attempt[]): string {
  if (attempts.length === 0) return '';
  const items = attempts.map((a, i) => {
    const header = `### ${i + 1}. ${a.tool} — ${a.result}`;
    const body = a.failure_reason
      ? `${a.summary}\n\n_Failure reason:_ ${a.failure_reason}`
      : a.summary;
    return `${header}\n\n${body}`;
  });
  return `## Prior Attempts\n\n${items.join('\n\n')}`;
}

export function sectionRepo(repo: RepoContext): string {
  if (!repo.attached) return '';
  const branch = repo.branch ? `\`${repo.branch}\`` : 'unknown';
  const base = repo.base_branch ? `\`${repo.base_branch}\`` : 'unknown';
  const commit = repo.commit ? `\`${repo.commit.slice(0, 8)}\`` : 'unknown';
  const state = repo.dirty ? 'Dirty' : 'Clean';
  return `## Repo\n\nBranch: ${branch} · Base: ${base} · Commit: ${commit} · ${state}`;
}

export function sectionProvenance(links: ProvenanceLink[]): string {
  if (links.length === 0) return '';
  const rows = links.map(
    (l) =>
      `| \`${l.field_name}\` | ${l.source_type} | \`${l.ref}\` | ${l.excerpt ?? ''} |`,
  );
  return [
    '## Provenance',
    '',
    '| Field | Source type | Ref | Excerpt |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/render/src/templates/sections.ts
git commit -m "feat(render): section helpers for markdown rendering"
```

---

## Task 6: Implement `targets/generic.ts`

**Files:**
- Create: `packages/render/src/targets/generic.ts`

- [ ] **Step 1: Write the file**

```typescript
import { roughEstimate } from '@batonai/llm';
import type { BatonPacket } from '@batonai/schema';
import type { RenderOptions, RenderResult, Renderer } from '../types.js';
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
} from '../templates/sections.js';

function resolveContextLimit(
  packet: BatonPacket,
  options: RenderOptions | undefined,
  preamble: string,
): { limit: number | undefined; truncated: boolean } {
  const budget =
    options?.contextBudget ?? packet.render_hints?.context_budget ?? undefined;
  if (budget === undefined) return { limit: undefined, truncated: false };
  const preambleTokens = roughEstimate(preamble);
  const remaining = budget - preambleTokens;
  if (remaining <= 0) return { limit: 0, truncated: packet.context_items.length > 0 };
  // Rough per-item estimate using the first item as a proxy.
  const firstItem = packet.context_items[0];
  const perItemTokens = firstItem
    ? roughEstimate(`| 1 | ${firstItem.kind} | ${firstItem.ref} | ${firstItem.reason} |`)
    : 20;
  const limit = Math.max(0, Math.floor(remaining / perItemTokens));
  return {
    limit,
    truncated: limit < packet.context_items.length,
  };
}

function buildMarkdown(packet: BatonPacket, options: RenderOptions | undefined): {
  markdown: string;
  truncated: boolean;
} {
  const confidence = `${Math.round(packet.confidence_score * 100)}%`;
  const header = [
    `# ${packet.title}`,
    '',
    `**Status:** ${packet.status} · **Confidence:** ${confidence} · **Type:** ${packet.task_type}`,
  ].join('\n');

  const preamble = [
    header,
    '',
    sectionObjective(packet.objective),
    '',
    sectionCurrentState(packet.current_state),
    '',
    sectionNextAction(packet.next_action),
  ].join('\n');

  const { limit, truncated } = resolveContextLimit(packet, options, preamble);
  const contextSection = sectionContextItems(packet.context_items, limit);
  const acSection = sectionAcceptanceCriteria(packet.acceptance_criteria);
  const oqSection = sectionOpenQuestions(packet.open_questions);
  const conSection = sectionConstraints(packet.constraints);
  const attSection = sectionAttempts(packet.attempts);
  const repoSection = sectionRepo(packet.repo_context);

  const includeProvenance = options?.includeProvenance ?? false;
  const provSection = includeProvenance
    ? sectionProvenance(packet.provenance_links)
    : '';

  const parts = [
    preamble,
    acSection,
    oqSection,
    conSection,
    contextSection,
    attSection,
    repoSection,
    provSection,
  ].filter(Boolean);

  const truncatedNote = truncated
    ? `\n> _Context list truncated to stay within token budget._`
    : '';

  return { markdown: parts.join('\n\n') + truncatedNote, truncated };
}

export const genericRenderer: Renderer = {
  target: 'generic',
  render(packet: BatonPacket, options?: RenderOptions): RenderResult {
    const { markdown, truncated } = buildMarkdown(packet, options);
    return {
      markdown,
      target: 'generic',
      tokenEstimate: roughEstimate(markdown),
      warnings: [],
      truncated,
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/render/src/targets/generic.ts
git commit -m "feat(render): generic renderer"
```

---

## Task 7: Implement `targets/claude-code.ts`

**Files:**
- Create: `packages/render/src/targets/claude-code.ts`

Claude Code benefits from next_action near the top, priority-ordered context with XML block styling, and a clear footer.

- [ ] **Step 1: Write the file**

```typescript
import { roughEstimate } from '@batonai/llm';
import type { BatonPacket, ContextItem } from '@batonai/schema';
import type { RenderOptions, RenderResult, Renderer } from '../types.js';
import {
  sectionAcceptanceCriteria,
  sectionAttempts,
  sectionConstraints,
  sectionCurrentState,
  sectionObjective,
  sectionOpenQuestions,
  sectionProvenance,
  sectionRepo,
} from '../templates/sections.js';

function renderContextBlocks(items: ContextItem[], limit?: number): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const rows = limit !== undefined ? sorted.slice(0, limit) : sorted;
  const blocks = rows.map(
    (ci) =>
      `<context priority="${ci.priority}">\n**${ci.ref}** (${ci.kind}) — ${ci.reason}\n</context>`,
  );
  return `## Context Files\n\n${blocks.join('\n\n')}`;
}

function resolveContextLimit(
  packet: BatonPacket,
  options: RenderOptions | undefined,
  preambleLen: number,
): { limit: number | undefined; truncated: boolean } {
  const budget =
    options?.contextBudget ?? packet.render_hints?.context_budget ?? undefined;
  if (budget === undefined) return { limit: undefined, truncated: false };
  const remaining = budget - Math.ceil(preambleLen / 4);
  if (remaining <= 0) return { limit: 0, truncated: packet.context_items.length > 0 };
  const perItem = 20;
  const limit = Math.max(0, Math.floor(remaining / perItem));
  return { limit, truncated: limit < packet.context_items.length };
}

function buildMarkdown(packet: BatonPacket, options: RenderOptions | undefined): {
  markdown: string;
  truncated: boolean;
} {
  const preamble = [
    `# Baton Handoff — ${packet.title}`,
    '',
    `> **Next action:** ${packet.next_action}`,
    '',
    sectionObjective(packet.objective),
    '',
    sectionCurrentState(packet.current_state),
  ].join('\n');

  const { limit, truncated } = resolveContextLimit(packet, options, preamble.length);

  const acSection = sectionAcceptanceCriteria(packet.acceptance_criteria);
  const oqSection = sectionOpenQuestions(packet.open_questions);
  const conSection = sectionConstraints(packet.constraints);
  const ctxSection = renderContextBlocks(packet.context_items, limit);
  const attSection = sectionAttempts(packet.attempts);
  const repoSection = sectionRepo(packet.repo_context);

  const includeProvenance = options?.includeProvenance ?? false;
  const provSection = includeProvenance
    ? sectionProvenance(packet.provenance_links)
    : '';

  const confidence = `${Math.round(packet.confidence_score * 100)}%`;
  const footer = `---\n_Rendered by Baton · Confidence: ${confidence} · Status: ${packet.status}_`;

  const truncatedNote = truncated
    ? `\n> _Context list truncated to stay within token budget._`
    : '';

  const parts = [
    preamble,
    acSection,
    oqSection,
    conSection,
    ctxSection,
    attSection,
    repoSection,
    provSection,
    footer,
  ].filter(Boolean);

  return { markdown: parts.join('\n\n') + truncatedNote, truncated };
}

export const claudeCodeRenderer: Renderer = {
  target: 'claude-code',
  render(packet: BatonPacket, options?: RenderOptions): RenderResult {
    const { markdown, truncated } = buildMarkdown(packet, options);
    return {
      markdown,
      target: 'claude-code',
      tokenEstimate: roughEstimate(markdown),
      warnings: [],
      truncated,
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/render/src/targets/claude-code.ts
git commit -m "feat(render): claude-code renderer with context blocks + next-action prominence"
```

---

## Task 8: Wire the target registry and main index

**Files:**
- Create: `packages/render/src/targets/index.ts`
- Rewrite: `packages/render/src/index.ts`

- [ ] **Step 1: Create `targets/index.ts`**

One explicit import per renderer — no glob imports (mirrors the lint package's `rules/index.ts` convention).

```typescript
import { claudeCodeRenderer } from './claude-code.js';
import { genericRenderer } from './generic.js';
import type { RenderTarget, Renderer } from '../types.js';

export const RENDERERS: Record<RenderTarget, Renderer | undefined> = {
  generic: genericRenderer,
  'claude-code': claudeCodeRenderer,
  // codex and cursor land in Session 12
  codex: undefined,
  cursor: undefined,
};
```

- [ ] **Step 2: Rewrite `src/index.ts`**

```typescript
import type { BatonPacket } from '@batonai/schema';
import type { RenderOptions, RenderResult, RenderTarget } from './types.js';
import { RENDERERS } from './targets/index.js';

/**
 * Render `packet` for the given `target`. Pure function: same inputs →
 * same output. Throws for unregistered or not-yet-implemented targets.
 */
export function render(
  packet: BatonPacket,
  target: RenderTarget,
  options?: RenderOptions,
): RenderResult {
  const renderer = RENDERERS[target];
  if (renderer === undefined) {
    throw new Error(`Unknown render target: "${target}". Registered: ${Object.keys(RENDERERS).filter((k) => RENDERERS[k as RenderTarget] !== undefined).join(', ')}`);
  }
  return renderer.render(packet, options);
}

export type { RenderOptions, RenderResult, RenderTarget, RenderWarning, Renderer } from './types.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/render/src/targets/index.ts packages/render/src/index.ts
git commit -m "feat(render): wire target registry + render() entry point"
```

---

## Task 9: Run tests — fix failures and lock snapshots

**Files:**
- Auto-created: `packages/render/test/snapshots/generic-fixture-01.md.snap`
- Auto-created: `packages/render/test/snapshots/claude-code-fixture-01.md.snap`

- [ ] **Step 1: Run the full test suite for `@batonai/render`**

```bash
pnpm --filter @batonai/render test 2>&1
```

Expected on first run:
- All tests except the `toMatchFileSnapshot` ones pass immediately.
- The snapshot tests pass on first run (vitest creates the files), or one test may warn about new snapshots. Either way, the snapshot files are now written to disk.

If any non-snapshot test fails, fix the cause in the relevant source file before continuing.

- [ ] **Step 2: Verify the snapshot files were created**

```bash
ls packages/render/test/snapshots/
```

Expected: `claude-code-fixture-01.md.snap  generic-fixture-01.md.snap`

- [ ] **Step 3: Inspect the snapshots to confirm they look correct**

```bash
cat packages/render/test/snapshots/generic-fixture-01.md.snap
```

Verify the output contains:
- `# Fix flaky auth test` heading
- Objective text
- `## Current State` section
- `## Next Action` section
- `## Acceptance Criteria` with a `[ ]` checkbox
- `## Context` table with `test/auth-flow.spec.ts`
- `## Repo` section

```bash
cat packages/render/test/snapshots/claude-code-fixture-01.md.snap
```

Verify the output contains:
- `# Baton Handoff — Fix flaky auth test` heading
- `> **Next action:**` blockquote near top
- `<context priority="1">` block
- A `---` footer with confidence and status

- [ ] **Step 4: Run tests a second time to confirm snapshots are stable**

```bash
pnpm --filter @batonai/render test 2>&1
```

Expected: all tests pass, no snapshot updates.

- [ ] **Step 5: Delete the placeholder test (it's now replaced)**

Delete `packages/render/test/placeholder.test.ts`.

```bash
git rm packages/render/test/placeholder.test.ts
```

- [ ] **Step 6: Commit snapshots + cleanup**

```bash
git add packages/render/test/snapshots/
git commit -m "test(render): lock generic + claude-code snapshot files"
```

---

## Task 10: Build, typecheck, and final verification

- [ ] **Step 1: Build the package**

```bash
pnpm --filter @batonai/render build 2>&1
```

Expected: `dist/index.js` + `dist/index.d.ts` written with no errors.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @batonai/render typecheck 2>&1
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run full test suite one more time**

```bash
pnpm --filter @batonai/render test 2>&1
```

Expected: all tests pass.

- [ ] **Step 4: Run upstream packages to confirm no regressions**

```bash
pnpm --filter @batonai/compiler test 2>&1
pnpm --filter @batonai/lint test 2>&1
pnpm --filter @batonai/schema test 2>&1
```

All must remain green.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(render): generic + claude-code targets with snapshot tests"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement (build plan §7) | Covered by task |
|---|---|
| `types.ts` — `Renderer`, `RenderTarget`, `RenderResult`, `RenderOptions`, `RenderWarning` | Task 2 |
| `templates/sections.ts` — shared markdown section helpers | Task 5 |
| `targets/generic.ts` — neutral, shareable | Task 6 |
| `targets/claude-code.ts` — richer structured context | Task 7 |
| `targets/index.ts` — explicit imports | Task 8 |
| `src/index.ts` — `render(packet, target, options?)` | Task 8 |
| `test/snapshots/generic-fixture-01.md.snap` | Task 9 |
| `test/snapshots/claude-code-fixture-01.md.snap` | Task 9 |
| `test/render.test.ts` | Task 4 |
| Token estimate via `@batonai/llm/tokens` | Tasks 1, 6, 7 |
| Pure function: same packet → same output | Enforced by deterministic section helpers (no Date.now, no random) |

### Type Consistency Check

- `roughEstimate(text: string): number` — used in Task 6 + 7 ✓
- `genericRenderer: Renderer` with `target: 'generic'` — matches `RenderTarget` union ✓
- `claudeCodeRenderer: Renderer` with `target: 'claude-code'` — matches `RenderTarget` union ✓
- `RENDERERS` keyed by `RenderTarget` with `Renderer | undefined` values — allows `codex`/`cursor` slots to be `undefined` until Session 12 ✓
- `render()` throws for unknown/unimplemented targets — tested in Task 4 ✓
- `BatonPacket` imported from `@batonai/schema` throughout — consistent ✓

### Placeholder Scan

No TBD, TODO, "implement later", or vague steps found. All code blocks are complete.
