import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatonPacket } from '@baton/schema';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const FIXTURE = req('./fixtures/packet-fixture-01.json') as unknown as BatonPacket;

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

describe('render — unknown target', () => {
  it('throws for an unregistered target', () => {
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
      render(FIXTURE, 'unknown-target' as any),
    ).toThrow(/unknown render target/i);
  });
});
