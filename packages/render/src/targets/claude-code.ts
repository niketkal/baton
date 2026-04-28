import { roughEstimate } from '@baton/llm';
import type { BatonPacket, ContextItem } from '@baton/schema';
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
import type { RenderOptions, RenderResult, Renderer } from '../types.js';

function renderContextBlocks(items: ContextItem[], limit?: number): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const rows = limit !== undefined ? sorted.slice(0, limit) : sorted;
  if (rows.length === 0) return '';
  const blocks = rows.map(
    (ci) =>
      `<context priority="${ci.priority}">\n**${ci.ref}** (${ci.kind}) — ${ci.reason}\n</context>`,
  );
  return `## Context Files\n\n${blocks.join('\n\n')}`;
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
  // Sample the first priority-sorted item to estimate per-item cost in the XML block format.
  const sorted = [...packet.context_items].sort((a, b) => a.priority - b.priority);
  const representative = sorted[0];
  const perItem = representative
    ? roughEstimate(
        `<context priority="${representative.priority}">\n**${representative.ref}** (${representative.kind}) — ${representative.reason}\n</context>`,
      )
    : 20;
  const limit = Math.max(0, Math.floor(remaining / perItem));
  return { limit, truncated: limit < packet.context_items.length };
}

function buildMarkdown(
  packet: BatonPacket,
  options: RenderOptions | undefined,
): { markdown: string; truncated: boolean } {
  const preamble = [
    `# Baton Handoff — ${packet.title}`,
    '',
    `> **Next action:** ${packet.next_action}`,
    '',
    sectionObjective(packet.objective),
    '',
    sectionCurrentState(packet.current_state),
  ].join('\n');

  const { limit, truncated } = resolveContextLimit(packet, options, preamble);

  const acSection = sectionAcceptanceCriteria(packet.acceptance_criteria);
  const oqSection = sectionOpenQuestions(packet.open_questions);
  const conSection = sectionConstraints(packet.constraints);
  const ctxSection = renderContextBlocks(packet.context_items, limit);
  const attSection = sectionAttempts(packet.attempts);
  const repoSection = sectionRepo(packet.repo_context);

  const includeProvenance =
    options?.includeProvenance ?? packet.render_hints?.include_provenance ?? false;
  const provSection = includeProvenance ? sectionProvenance(packet.provenance_links) : '';

  const confidence = `${Math.round(packet.confidence_score * 100)}%`;
  const footer = `---\n_Rendered by Baton · Confidence: ${confidence} · Status: ${packet.status}_`;

  const truncatedNote = truncated
    ? '\n\n> _Context list truncated to stay within token budget._'
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
