import { roughEstimate } from '@baton/llm';
import type { BatonPacket, ContextItem } from '@baton/schema';
import type { RenderOptions, RenderResult, Renderer } from '../types.js';

function renderFiles(items: ContextItem[], limit?: number): string {
  if (items.length === 0) return '## Files\n\n_(none referenced)_';
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const rows = limit !== undefined ? sorted.slice(0, limit) : sorted;
  if (rows.length === 0) return '## Files\n\n_(omitted to fit token budget)_';
  const lines = rows.map((ci) => `- \`${ci.ref}\` — ${ci.reason}`);
  return `## Files\n\n${lines.join('\n')}`;
}

function renderConstraints(packet: BatonPacket): string {
  if (packet.constraints.length === 0) return '';
  const lines = packet.constraints.map((c) => `- (${c.severity}) ${c.text}`);
  return `## Constraints\n\n${lines.join('\n')}`;
}

function resolveContextLimit(
  packet: BatonPacket,
  options: RenderOptions | undefined,
  preamble: string,
): { limit: number | undefined; truncated: boolean } {
  const budget = options?.contextBudget ?? packet.render_hints?.context_budget ?? undefined;
  if (budget === undefined) return { limit: undefined, truncated: false };
  const preambleTokens = roughEstimate(preamble);
  const remaining = budget - preambleTokens;
  if (remaining <= 0) return { limit: 0, truncated: packet.context_items.length > 0 };
  const sorted = [...packet.context_items].sort((a, b) => a.priority - b.priority);
  const representative = sorted[0];
  const perItem = representative
    ? roughEstimate(`- \`${representative.ref}\` — ${representative.reason}`)
    : 20;
  const limit = Math.max(0, Math.floor(remaining / perItem));
  return { limit, truncated: limit < packet.context_items.length };
}

function buildMarkdown(
  packet: BatonPacket,
  options: RenderOptions | undefined,
): { markdown: string; truncated: boolean } {
  const goalSection = `## Goal\n\n${packet.objective}`;
  const nextSection = `## Do this next\n\n${packet.next_action}`;
  // Preamble used for budget calc: everything that is NOT the files section.
  const preamble = [goalSection, nextSection, renderConstraints(packet)]
    .filter(Boolean)
    .join('\n\n');

  const { limit, truncated } = resolveContextLimit(packet, options, preamble);
  const filesSection = renderFiles(packet.context_items, limit);
  const conSection = renderConstraints(packet);

  const truncatedNote = truncated ? '\n\n> _Files list truncated to fit token budget._' : '';

  const parts = [filesSection, goalSection, nextSection, conSection].filter(Boolean);

  return { markdown: parts.join('\n\n') + truncatedNote, truncated };
}

export const cursorRenderer: Renderer = {
  target: 'cursor',
  render(packet: BatonPacket, options?: RenderOptions): RenderResult {
    const { markdown, truncated } = buildMarkdown(packet, options);
    return {
      markdown,
      target: 'cursor',
      tokenEstimate: roughEstimate(markdown),
      warnings: [],
      truncated,
    };
  },
};
