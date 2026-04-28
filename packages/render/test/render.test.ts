import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatonPacket } from '@baton/schema';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(): BatonPacket {
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
