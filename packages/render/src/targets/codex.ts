import { roughEstimate } from '@baton/llm';
import type { BatonPacket, ContextItem } from '@baton/schema';
import type { RenderOptions, RenderResult, Renderer } from '../types.js';

function renderFiles(items: ContextItem[], limit?: number): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.priority - b.priority);
  const rows = limit !== undefined ? sorted.slice(0, limit) : sorted;
  if (rows.length === 0) return '';
  const lines = rows.map((ci) => `  - ${ci.ref} (${ci.kind}, p${ci.priority}) — ${ci.reason}`);
  return `FILES:\n${lines.join('\n')}`;
}

function renderContextSection(packet: BatonPacket): string {
  const lines: string[] = [];
  lines.push(`Objective: ${packet.objective}`);
  lines.push(`Current state: ${packet.current_state}`);
  if (packet.repo_context.attached) {
    const r = packet.repo_context;
    const branch = r.branch ?? 'unknown';
    const base = r.base_branch ?? 'unknown';
    const commit = r.commit ? r.commit.slice(0, 8) : 'unknown';
    const dirty = r.dirty ? 'dirty' : 'clean';
    lines.push(`Repo: branch=${branch} base=${base} commit=${commit} (${dirty})`);
  }
  return `CONTEXT:\n${lines.join('\n')}`;
}

function renderAcceptance(packet: BatonPacket): string {
  if (packet.acceptance_criteria.length === 0) return '';
  const lines = packet.acceptance_criteria.map((ac, i) => {
    const status = ac.status === 'met' ? '[done]' : '[todo]';
    const opt = ac.required ? '' : ' (optional)';
    return `  ${i + 1}. ${status} ${ac.text}${opt}`;
  });
  return `ACCEPTANCE CRITERIA:\n${lines.join('\n')}`;
}

function renderConstraints(packet: BatonPacket): string {
  if (packet.constraints.length === 0) return '';
  const lines = packet.constraints.map((c) => `  - [${c.severity}] ${c.text}`);
  return `CONSTRAINTS:\n${lines.join('\n')}`;
}

function renderOpenQuestions(packet: BatonPacket): string {
  const open = packet.open_questions.filter((q) => q.status === 'open');
  if (open.length === 0) return '';
  const lines = open.map((q) => {
    const flag = q.blocking ? ' (BLOCKING)' : '';
    return `  - ${q.text}${flag}`;
  });
  return `OPEN QUESTIONS:\n${lines.join('\n')}`;
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
    ? roughEstimate(
        `  - ${representative.ref} (${representative.kind}, p${representative.priority}) — ${representative.reason}`,
      )
    : 20;
  const limit = Math.max(0, Math.floor(remaining / perItem));
  return { limit, truncated: limit < packet.context_items.length };
}

function buildMarkdown(
  packet: BatonPacket,
  options: RenderOptions | undefined,
): { markdown: string; truncated: boolean } {
  const head = `TASK: ${packet.title}`;
  const preamble = [head, '', renderContextSection(packet)].join('\n');
  const { limit, truncated } = resolveContextLimit(packet, options, preamble);

  const filesSection = renderFiles(packet.context_items, limit);
  const ctxSection = renderContextSection(packet);
  const acSection = renderAcceptance(packet);
  const conSection = renderConstraints(packet);
  const oqSection = renderOpenQuestions(packet);
  const nextSection = `NEXT ACTION: ${packet.next_action}`;

  const truncatedNote = truncated ? '\n\n(Context list truncated to fit token budget.)' : '';

  const parts = [
    head,
    filesSection,
    ctxSection,
    acSection,
    conSection,
    oqSection,
    nextSection,
  ].filter(Boolean);

  return { markdown: parts.join('\n\n') + truncatedNote, truncated };
}

export const codexRenderer: Renderer = {
  target: 'codex',
  render(packet: BatonPacket, options?: RenderOptions): RenderResult {
    const { markdown, truncated } = buildMarkdown(packet, options);
    return {
      markdown,
      target: 'codex',
      tokenEstimate: roughEstimate(markdown),
      warnings: [],
      truncated,
    };
  },
};
