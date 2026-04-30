import { roughEstimate } from '@batonai/llm';
import type { BatonPacket, ContextItem } from '@batonai/schema';
import { resolveContextLimit } from '../templates/sections.js';
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
    // Mirror sectionRepo's behavior: when `attached: true` but every repo
    // identifier is missing, omit the Repo: line entirely rather than emit
    // `branch=unknown base=unknown commit=unknown`.
    const hasAny = r.branch != null || r.base_branch != null || r.commit != null;
    if (hasAny) {
      const branch = r.branch ?? 'unknown';
      const base = r.base_branch ?? 'unknown';
      const commit = r.commit ? r.commit.slice(0, 8) : 'unknown';
      const dirty = r.dirty ? 'dirty' : 'clean';
      lines.push(`Repo: branch=${branch} base=${base} commit=${commit} (${dirty})`);
    }
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

function buildMarkdown(
  packet: BatonPacket,
  options: RenderOptions | undefined,
): { markdown: string; truncated: boolean } {
  const head = `TASK: ${packet.title}`;
  const contextSection = renderContextSection(packet);
  const preamble = [head, '', contextSection].join('\n');
  const { limit, truncated } = resolveContextLimit(
    packet.context_items,
    options,
    preamble,
    (item) => `  - ${item.ref} (${item.kind}, p${item.priority}) — ${item.reason}`,
    packet.render_hints?.context_budget,
  );

  const filesSection = renderFiles(packet.context_items, limit);
  const acSection = renderAcceptance(packet);
  const conSection = renderConstraints(packet);
  const oqSection = renderOpenQuestions(packet);
  const nextSection = `NEXT ACTION: ${packet.next_action}`;

  const truncatedNote = truncated ? '\n\n(Context list truncated to fit token budget.)' : '';

  const parts = [
    head,
    filesSection,
    contextSection,
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
