import type {
  AcceptanceCriterion,
  Attempt,
  Constraint,
  ContextItem,
  OpenQuestion,
  ProvenanceLink,
  RepoContext,
} from '@baton/schema';

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|');
}

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
  if (rows.length === 0) return '';
  const tableRows = rows.map(
    (ci) =>
      `| ${ci.priority} | ${ci.kind} | \`${escapeCell(ci.ref)}\` | ${escapeCell(ci.reason)} |`,
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
      `| \`${escapeCell(l.field_name)}\` | ${l.source_type} | \`${escapeCell(l.ref)}\` | ${escapeCell(l.excerpt ?? '')} |`,
  );
  return [
    '## Provenance',
    '',
    '| Field | Source type | Ref | Excerpt |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
