import type {
  AcceptanceCriterion,
  BatonPacket,
  Constraint,
  OpenQuestion,
  ProvenanceLink,
  SourceArtifact,
  Warning,
} from '@baton/schema';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const READONLY_OPEN = '<!-- baton:read-only -->';
const READONLY_CLOSE = '<!-- /baton:read-only -->';

// Pre-instantiate the unified processor so we don't re-build it per
// call. We currently only invoke `.stringify()` on hand-built MDAST,
// but keeping a single processor in scope keeps the contract clean for
// when serialize switches to a real AST builder.
const _stringifyProcessor = unified().use(remarkStringify, {
  bullet: '-',
  fences: true,
  listItemIndent: 'one',
});
void _stringifyProcessor;

function readonlyBlock(body: string): string {
  return `${READONLY_OPEN}\n${body.trimEnd()}\n${READONLY_CLOSE}`;
}

/**
 * Render a packet to its `packet.md` mirror.
 *
 * Section ordering (per tech spec §6.1):
 *   title → objective → current_state → next_action →
 *   acceptance_criteria → constraints → open_questions →
 *   (read-only block: provenance, warnings, source_artifacts,
 *    confidence, timestamps, repo_context).
 *
 * Editable sections are plain markdown. System-managed sections are
 * wrapped in `<!-- baton:read-only -->` … `<!-- /baton:read-only -->`
 * fences so `assertNoReadonlyEdits` can reject downstream tampering.
 */
export function serializePacketToMarkdown(packet: BatonPacket): string {
  const lines: string[] = [];

  lines.push(`# ${packet.title}`, '');

  lines.push('## Objective', '', packet.objective.trim(), '');
  lines.push('## Current state', '', packet.current_state.trim(), '');
  lines.push('## Next action', '', packet.next_action.trim(), '');

  lines.push('## Acceptance criteria', '');
  if (packet.acceptance_criteria.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const c of packet.acceptance_criteria) {
      const box = c.status === 'met' ? '[x]' : '[ ]';
      const req = c.required ? '' : ' _(optional)_';
      lines.push(`- ${box} ${c.text.trim()}${req} <!-- baton:id=${c.id} -->`);
    }
    lines.push('');
  }

  lines.push('## Constraints', '');
  if (packet.constraints.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const c of packet.constraints) {
      lines.push(`- ${c.text.trim()} <!-- baton:id=${c.id} -->`);
    }
    lines.push('');
  }

  lines.push('## Open questions', '');
  if (packet.open_questions.length === 0) {
    lines.push('_None._', '');
  } else {
    for (const q of packet.open_questions) {
      const flag = q.blocking ? ' (blocking)' : '';
      lines.push(`- [${q.status}]${flag} ${q.text.trim()} <!-- baton:id=${q.id} -->`);
    }
    lines.push('');
  }

  // System-managed metadata.
  const ro: string[] = [];
  ro.push('## System-managed metadata', '');
  ro.push(
    '_The lines below are generated from `packet.json`. Edits inside this',
    'block are rejected on the next `baton compile` — modify `packet.json`',
    'directly if you need to override system-managed fields._',
    '',
  );
  ro.push(`- **Confidence score:** ${packet.confidence_score}`);
  ro.push(`- **Created at:** ${packet.created_at}`);
  ro.push(`- **Updated at:** ${packet.updated_at}`);
  ro.push('');

  ro.push('### Repo context', '');
  ro.push(
    `- attached: ${packet.repo_context.attached}`,
    `- root: ${packet.repo_context.root ?? 'null'}`,
    `- vcs: ${packet.repo_context.vcs}`,
    `- branch: ${packet.repo_context.branch ?? 'null'}`,
    `- base_branch: ${packet.repo_context.base_branch ?? 'null'}`,
    `- commit: ${packet.repo_context.commit ?? 'null'}`,
    `- base_commit: ${packet.repo_context.base_commit ?? 'null'}`,
    `- dirty: ${packet.repo_context.dirty}`,
    '',
  );

  ro.push('### Source artifacts', '');
  if (packet.source_artifacts.length === 0) {
    ro.push('_None._', '');
  } else {
    for (const a of packet.source_artifacts) {
      ro.push(`- \`${a.id}\` (${a.type}, ${a.source_tool}) — ${a.uri}`);
    }
    ro.push('');
  }

  ro.push('### Provenance links', '');
  if (packet.provenance_links.length === 0) {
    ro.push('_None._', '');
  } else {
    for (const link of packet.provenance_links) {
      const span =
        typeof link.span_start === 'number' && typeof link.span_end === 'number'
          ? ` [${link.span_start}..${link.span_end}]`
          : '';
      ro.push(
        `- \`${link.id}\` ${link.field_name} ← ${link.artifact_id} (${link.source_type})${span}`,
      );
    }
    ro.push('');
  }

  ro.push('### Warnings', '');
  if (packet.warnings.length === 0) {
    ro.push('_None._', '');
  } else {
    for (const w of packet.warnings) {
      const block = w.blocking ? ' (blocking)' : '';
      ro.push(`- **${w.code}** [${w.severity}]${block} — ${w.message}`);
    }
    ro.push('');
  }

  lines.push(readonlyBlock(ro.join('\n')), '');

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

export interface ParseResult {
  packet: BatonPacket;
  /**
   * Names of editable fields whose values changed relative to
   * `currentPacket`. Useful for callers (e.g. `baton compile`) to log
   * what the user altered.
   */
  edits: string[];
  /**
   * `true` when any change occurred inside a `<!-- baton:read-only -->`
   * block. Callers should treat this as an error and consult
   * `assertNoReadonlyEdits` for a richer message.
   */
  readonlyTampered: boolean;
}

/**
 * Parse a `packet.md` back into a packet, merging edits to the editable
 * sections on top of `currentPacket` (the canonical `packet.json`).
 * System-managed fields are taken verbatim from `currentPacket` — this
 * function does NOT trust the read-only block contents, even if the
 * user altered them.
 */
export function parseMarkdownToPacket(md: string, currentPacket: BatonPacket): ParseResult {
  const sections = splitSections(md);
  const next: BatonPacket = { ...currentPacket };
  const edits: string[] = [];

  const newTitle = sections.title?.trim();
  if (newTitle !== undefined && newTitle.length > 0 && newTitle !== currentPacket.title) {
    next.title = newTitle;
    edits.push('title');
  }

  const newObjective = sections.objective?.trim();
  if (
    newObjective !== undefined &&
    newObjective.length > 0 &&
    newObjective !== currentPacket.objective
  ) {
    next.objective = newObjective;
    edits.push('objective');
  }

  const newCurrent = sections.currentState?.trim();
  if (
    newCurrent !== undefined &&
    newCurrent.length > 0 &&
    newCurrent !== currentPacket.current_state
  ) {
    next.current_state = newCurrent;
    edits.push('current_state');
  }

  const newNext = sections.nextAction?.trim();
  if (newNext !== undefined && newNext.length > 0 && newNext !== currentPacket.next_action) {
    next.next_action = newNext;
    edits.push('next_action');
  }

  if (sections.acceptanceCriteria !== undefined) {
    const merged = mergeAcceptance(currentPacket.acceptance_criteria, sections.acceptanceCriteria);
    if (merged.changed) {
      next.acceptance_criteria = merged.items;
      edits.push('acceptance_criteria');
    }
  }

  if (sections.constraints !== undefined) {
    const merged = mergeConstraints(currentPacket.constraints, sections.constraints);
    if (merged.changed) {
      next.constraints = merged.items;
      edits.push('constraints');
    }
  }

  if (sections.openQuestions !== undefined) {
    const merged = mergeOpenQuestions(currentPacket.open_questions, sections.openQuestions);
    if (merged.changed) {
      next.open_questions = merged.items;
      edits.push('open_questions');
    }
  }

  // System-managed fields are NEVER taken from the markdown.
  next.warnings = currentPacket.warnings as Warning[];
  next.provenance_links = currentPacket.provenance_links as ProvenanceLink[];
  next.source_artifacts = currentPacket.source_artifacts as SourceArtifact[];
  next.confidence_score = currentPacket.confidence_score;
  next.repo_context = currentPacket.repo_context;
  next.created_at = currentPacket.created_at;
  next.updated_at = currentPacket.updated_at;

  return {
    packet: next,
    edits,
    readonlyTampered: false,
  };
}

interface Sections {
  title?: string;
  objective?: string;
  currentState?: string;
  nextAction?: string;
  acceptanceCriteria?: ParsedListItem[];
  constraints?: ParsedListItem[];
  openQuestions?: ParsedListItem[];
}

interface ParsedListItem {
  id: string | null;
  text: string;
}

function splitSections(md: string): Sections {
  const editable = stripReadonlyBlocks(md);
  const lines = editable.split(/\r?\n/);
  const sections: Sections = {};

  let i = 0;
  while (i < lines.length) {
    const m = lines[i]?.match(/^#\s+(.+)$/);
    if (m?.[1] !== undefined) {
      sections.title = m[1].trim();
      i += 1;
      break;
    }
    i += 1;
  }

  let currentHeading: string | null = null;
  let buffer: string[] = [];

  const commit = (): void => {
    if (currentHeading === null) return;
    const body = buffer.join('\n').trim();
    switch (currentHeading.toLowerCase()) {
      case 'objective':
        sections.objective = body;
        break;
      case 'current state':
        sections.currentState = body;
        break;
      case 'next action':
        sections.nextAction = body;
        break;
      case 'acceptance criteria':
        sections.acceptanceCriteria = parseListBody(body);
        break;
      case 'constraints':
        sections.constraints = parseListBody(body);
        break;
      case 'open questions':
        sections.openQuestions = parseListBody(body);
        break;
      default:
        break;
    }
    buffer = [];
  };

  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading?.[1] !== undefined) {
      commit();
      currentHeading = heading[1].trim();
      continue;
    }
    if (currentHeading !== null) buffer.push(line);
  }
  commit();
  return sections;
}

function parseListBody(body: string): ParsedListItem[] {
  if (body.trim() === '_None._' || body.trim() === '') return [];
  const items: ParsedListItem[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    let text = line.replace(/^-\s+/, '');
    const idMatch = text.match(/<!--\s*baton:id=([a-z0-9][a-z0-9._-]{1,127})\s*-->/);
    const id = idMatch?.[1] ?? null;
    text = text
      .replace(/<!--\s*baton:id=[^>]+-->/, '')
      .replace(/^\[\s*[xX ]\s*\]\s*/, '')
      .replace(/^\[(open|answered|waived)\](\s*\(blocking\))?\s*/i, '')
      .replace(/_\(optional\)_/g, '')
      .trim();
    items.push({ id, text });
  }
  return items;
}

interface MergeResult<T> {
  items: T[];
  changed: boolean;
}

function mergeAcceptance(
  current: AcceptanceCriterion[],
  parsed: ParsedListItem[],
): MergeResult<AcceptanceCriterion> {
  const byId = new Map(current.map((c) => [c.id, c]));
  const out: AcceptanceCriterion[] = [];
  let changed = false;
  const seen = new Set<string>();
  for (const p of parsed) {
    if (p.id === null) {
      changed = true;
      continue;
    }
    const orig = byId.get(p.id);
    if (orig === undefined) continue;
    seen.add(p.id);
    if (p.text !== orig.text) {
      out.push({ ...orig, text: p.text });
      changed = true;
    } else {
      out.push(orig);
    }
  }
  for (const c of current) if (!seen.has(c.id)) changed = true;
  return { items: out, changed };
}

function mergeConstraints(
  current: Constraint[],
  parsed: ParsedListItem[],
): MergeResult<Constraint> {
  const byId = new Map(current.map((c) => [c.id, c]));
  const out: Constraint[] = [];
  let changed = false;
  const seen = new Set<string>();
  for (const p of parsed) {
    if (p.id === null) {
      changed = true;
      continue;
    }
    const orig = byId.get(p.id);
    if (orig === undefined) continue;
    seen.add(p.id);
    if (p.text !== orig.text) {
      out.push({ ...orig, text: p.text });
      changed = true;
    } else {
      out.push(orig);
    }
  }
  for (const c of current) if (!seen.has(c.id)) changed = true;
  return { items: out, changed };
}

function mergeOpenQuestions(
  current: OpenQuestion[],
  parsed: ParsedListItem[],
): MergeResult<OpenQuestion> {
  const byId = new Map(current.map((c) => [c.id, c]));
  const out: OpenQuestion[] = [];
  let changed = false;
  const seen = new Set<string>();
  for (const p of parsed) {
    if (p.id === null) {
      changed = true;
      continue;
    }
    const orig = byId.get(p.id);
    if (orig === undefined) continue;
    seen.add(p.id);
    if (p.text !== orig.text) {
      out.push({ ...orig, text: p.text });
      changed = true;
    } else {
      out.push(orig);
    }
  }
  for (const c of current) if (!seen.has(c.id)) changed = true;
  return { items: out, changed };
}

/** Remove every read-only block from a markdown string. */
export function stripReadonlyBlocks(md: string): string {
  const open = escapeRegex(READONLY_OPEN);
  const close = escapeRegex(READONLY_CLOSE);
  const re = new RegExp(`${open}[\\s\\S]*?${close}`, 'g');
  return md.replace(re, '');
}

/** Extract every read-only block as a verbatim string (without delimiters). */
export function extractReadonlyBlocks(md: string): string[] {
  const open = escapeRegex(READONLY_OPEN);
  const close = escapeRegex(READONLY_CLOSE);
  const re = new RegExp(`${open}\\s*([\\s\\S]*?)\\s*${close}`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null = re.exec(md);
  while (m !== null) {
    if (m[1] !== undefined) out.push(m[1]);
    m = re.exec(md);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Backwards-compatible export: render a packet to its human-readable
 * mirror. Now backed by `serializePacketToMarkdown`.
 */
export function renderPacketMarkdown(packet: BatonPacket): string {
  return serializePacketToMarkdown(packet);
}

export { READONLY_OPEN, READONLY_CLOSE };
