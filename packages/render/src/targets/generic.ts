import { roughEstimate } from '@batonai/llm';
import type { BatonPacket } from '@batonai/schema';
import {
  resolveContextLimit,
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
import type { RenderOptions, RenderResult, Renderer } from '../types.js';

function buildMarkdown(
  packet: BatonPacket,
  options: RenderOptions | undefined,
): { markdown: string; truncated: boolean } {
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

  const { limit, truncated } = resolveContextLimit(
    packet.context_items,
    options,
    preamble,
    (item) => `| 1 | ${item.kind} | ${item.ref} | ${item.reason} |`,
    packet.render_hints?.context_budget,
  );
  const contextSection = sectionContextItems(packet.context_items, limit);
  const acSection = sectionAcceptanceCriteria(packet.acceptance_criteria);
  const oqSection = sectionOpenQuestions(packet.open_questions);
  const conSection = sectionConstraints(packet.constraints);
  const attSection = sectionAttempts(packet.attempts);
  const repoSection = sectionRepo(packet.repo_context);

  const includeProvenance =
    options?.includeProvenance ?? packet.render_hints?.include_provenance ?? false;
  const provSection = includeProvenance ? sectionProvenance(packet.provenance_links) : '';

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
    ? '\n\n> _Context list truncated to stay within token budget._'
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
