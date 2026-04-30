import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatonPacket } from '@batonai/schema';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const FIXTURE = req('./fixtures/packet-fixture-01.json') as unknown as BatonPacket;
const MINIMAL = req('./fixtures/packet-fixture-minimal.json') as unknown as BatonPacket;

describe('render — generic target', () => {
  it('returns a non-empty markdown string', () => {
    const result = render(FIXTURE, 'generic');
    expect(typeof result.markdown).toBe('string');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "generic"', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.target).toBe('generic');
  });

  it('populates tokenEstimate with a positive number', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('returns truncated: false when no contextBudget is set', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.truncated).toBe(false);
  });

  it('includes the packet title in the output', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain(FIXTURE.title);
  });

  it('includes the objective', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain(FIXTURE.objective);
  });

  it('includes current_state', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain(FIXTURE.current_state);
  });

  it('includes next_action', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain(FIXTURE.next_action);
  });

  it('includes acceptance criteria text', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain(FIXTURE.acceptance_criteria[0]?.text ?? '');
  });

  it('includes context item refs', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain('test/auth-flow.spec.ts');
  });

  it('includes open questions text', () => {
    const result = render(FIXTURE, 'generic');
    expect(result.markdown).toContain('Should the fix land on');
  });

  it('includes provenance table when includeProvenance is true', () => {
    const result = render(FIXTURE, 'generic', { includeProvenance: true });
    expect(result.markdown).toContain('## Provenance');
  });

  it('truncates context items when contextBudget is tiny', () => {
    const result = render(FIXTURE, 'generic', { contextBudget: 1 });
    expect(result.truncated).toBe(true);
  });

  it('matches the stored snapshot', async () => {
    const result = render(FIXTURE, 'generic');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'generic-fixture-01.md.snap'),
    );
  });
});

describe('render — claude-code target', () => {
  it('returns a non-empty markdown string', () => {
    const result = render(FIXTURE, 'claude-code');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "claude-code"', () => {
    const result = render(FIXTURE, 'claude-code');
    expect(result.target).toBe('claude-code');
  });

  it('includes the next_action prominently near the top', () => {
    const result = render(FIXTURE, 'claude-code');
    const nextActionPos = result.markdown.indexOf(FIXTURE.next_action);
    const halfwayMark = result.markdown.length / 2;
    expect(nextActionPos).toBeLessThan(halfwayMark);
  });

  it('includes context item refs', () => {
    const result = render(FIXTURE, 'claude-code');
    expect(result.markdown).toContain('test/auth-flow.spec.ts');
  });

  it('wraps context items in <context priority="..."> tags', () => {
    const result = render(FIXTURE, 'claude-code');
    expect(result.markdown).toContain('<context priority=');
  });

  it('includes open questions text', () => {
    const result = render(FIXTURE, 'claude-code');
    expect(result.markdown).toContain('Should the fix land on');
  });

  it('includes provenance table when includeProvenance is true', () => {
    const result = render(FIXTURE, 'claude-code', { includeProvenance: true });
    expect(result.markdown).toContain('## Provenance');
  });

  it('produces output distinct from generic', () => {
    const generic = render(FIXTURE, 'generic');
    const cc = render(FIXTURE, 'claude-code');
    expect(cc.markdown).not.toBe(generic.markdown);
  });

  it('matches the stored snapshot', async () => {
    const result = render(FIXTURE, 'claude-code');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'claude-code-fixture-01.md.snap'),
    );
  });
});

describe('render — codex target', () => {
  it('returns a non-empty markdown string', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "codex"', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.target).toBe('codex');
  });

  it('populates tokenEstimate with a positive number', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('leads with TASK: line', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown.startsWith('TASK:')).toBe(true);
  });

  it('includes FILES: section', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown).toContain('FILES:');
    expect(result.markdown).toContain('test/auth-flow.spec.ts');
  });

  it('includes NEXT ACTION: line with the next action text', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown).toContain('NEXT ACTION:');
    expect(result.markdown).toContain(FIXTURE.next_action);
  });

  it('uses no XML tags', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown).not.toContain('<context');
  });

  it('uses no markdown headers', () => {
    const result = render(FIXTURE, 'codex');
    expect(result.markdown).not.toMatch(/^#/m);
  });

  it('matches the stored snapshot', async () => {
    const result = render(FIXTURE, 'codex');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'codex-fixture-01.md.snap'),
    );
  });
});

describe('render — cursor target', () => {
  it('returns a non-empty markdown string', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.markdown.length).toBeGreaterThan(0);
  });

  it('sets target to "cursor"', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.target).toBe('cursor');
  });

  it('populates tokenEstimate with a positive number', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it('leads with ## Files section', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.markdown.startsWith('## Files')).toBe(true);
  });

  it('includes ## Goal section with the objective', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.markdown).toContain('## Goal');
    expect(result.markdown).toContain(FIXTURE.objective);
  });

  it('includes ## Do this next section with the next action', () => {
    const result = render(FIXTURE, 'cursor');
    expect(result.markdown).toContain('## Do this next');
    expect(result.markdown).toContain(FIXTURE.next_action);
  });

  it('matches the stored snapshot', async () => {
    const result = render(FIXTURE, 'cursor');
    await expect(result.markdown).toMatchFileSnapshot(
      join(__dirname, 'snapshots', 'cursor-fixture-01.md.snap'),
    );
  });
});

describe('render — minimal fixture (empty optional arrays)', () => {
  it('minimal fixture is schema-valid', async () => {
    const { validatePacket } = await import('@batonai/schema');
    const result = validatePacket(MINIMAL);
    expect(result.valid).toBe(true);
  });

  for (const target of ['generic', 'claude-code', 'codex', 'cursor'] as const) {
    it(`${target}: renders without crashing and includes objective`, () => {
      const result = render(MINIMAL, target);
      expect(result.markdown.length).toBeGreaterThan(0);
      expect(result.markdown).toContain(MINIMAL.objective);
    });

    it(`${target}: suppresses empty-array sections`, () => {
      const result = render(MINIMAL, target);
      // Empty arrays must NOT produce empty headed sections.
      expect(result.markdown).not.toMatch(/##\s*Acceptance Criteria/i);
      expect(result.markdown).not.toMatch(/ACCEPTANCE CRITERIA:/);
      expect(result.markdown).not.toMatch(/##\s*Constraints/i);
      expect(result.markdown).not.toMatch(/CONSTRAINTS:/);
      expect(result.markdown).not.toMatch(/##\s*Open Questions/i);
      expect(result.markdown).not.toMatch(/OPEN QUESTIONS:/);
      // Detached repo: no Repo: line / ## Repo section
      expect(result.markdown).not.toMatch(/^##\s*Repo$/m);
      expect(result.markdown).not.toMatch(/^Repo:/m);
    });

    it(`${target}: truncated is false with no context items`, () => {
      const result = render(MINIMAL, target, { contextBudget: 1 });
      expect(result.truncated).toBe(false);
    });
  }
});

describe('render — unknown target', () => {
  it('throws for an unregistered target', () => {
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
      render(FIXTURE, 'unknown-target' as any),
    ).toThrow(/unknown render target/i);
  });

  it('error message names the supported targets', () => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
      render(FIXTURE, 'unknown-target' as any);
      throw new Error('expected render to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('generic');
      expect(msg).toContain('claude-code');
      expect(msg).toContain('codex');
      expect(msg).toContain('cursor');
    }
  });
});
