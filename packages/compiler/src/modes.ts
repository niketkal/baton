import type { ParsedTranscript } from './parsers/types.js';
import type { RepoContext } from './repo.js';
import type { Packet } from './types.js';

/**
 * Aggregated, normalized view of all parsed source artifacts. Only the
 * `transcript` slot is populated in Session 6; sibling slots arrive as
 * later artifact types are wired in.
 */
export interface NormalizedInput {
  transcript?: ParsedTranscript;
  // Future: log, diff, issue, note, image, testReport.
}

export interface ModeContext {
  packetId: string;
  repoCtx: RepoContext;
  now: string;
}

/**
 * In `--fast` mode the assemble step is purely deterministic. We reuse
 * narrative fields from `prior` when present (so a Session 11 LLM
 * extraction survives subsequent fast-mode rebuilds), and otherwise
 * derive cheap stand-ins from the transcript.
 */
export function runFastMode(
  input: NormalizedInput,
  prior: Packet | null,
  ctx: ModeContext,
): Packet {
  const transcript = input.transcript;
  const firstUser = transcript?.messages.find((m) => m.role === 'user');
  const firstAssistant = transcript?.messages.find((m) => m.role === 'assistant');
  const lastAssistant = [...(transcript?.messages ?? [])]
    .reverse()
    .find((m) => m.role === 'assistant');

  const objective =
    prior?.objective?.trim() ||
    firstUser?.text.trim() ||
    'Continue prior work captured in transcript.';

  const currentState =
    prior?.current_state?.trim() ||
    lastAssistant?.text.trim() ||
    firstAssistant?.text.trim() ||
    'No assistant activity captured yet.';

  const nextAction =
    prior?.next_action?.trim() ||
    'Resume from the most recent assistant turn captured in the transcript.';

  const title =
    prior?.title?.trim() || deriveTitle(firstUser?.text ?? firstAssistant?.text ?? ctx.packetId);

  const repoContext: Packet['repo_context'] = ctx.repoCtx.attached
    ? {
        attached: true,
        root: ctx.repoCtx.root ?? '',
        vcs: 'git',
        branch: ctx.repoCtx.branch,
        base_branch: ctx.repoCtx.baseBranch,
        commit: ctx.repoCtx.commit,
        base_commit: ctx.repoCtx.baseCommit,
        dirty: ctx.repoCtx.isDirty,
      }
    : {
        attached: false,
        root: null,
        vcs: 'none',
        branch: null,
        base_branch: null,
        commit: null,
        base_commit: null,
        dirty: false,
      };

  const createdAt = prior?.created_at ?? ctx.now;

  return {
    schema_version: 'baton.packet/v1',
    id: ctx.packetId,
    title,
    status: prior?.status ?? 'draft',
    validation_level: prior?.validation_level ?? 'draft',
    task_type: prior?.task_type ?? 'generic',
    objective,
    current_state: currentState,
    next_action: nextAction,
    open_questions: prior?.open_questions ?? [],
    confidence_score: prior?.confidence_score ?? 0.5,
    repo_context: repoContext,
    context_items: prior?.context_items ?? [],
    constraints: prior?.constraints ?? [],
    attempts: prior?.attempts ?? [],
    acceptance_criteria: prior?.acceptance_criteria ?? [],
    warnings: prior?.warnings ?? [],
    provenance_links: prior?.provenance_links ?? [],
    source_artifacts: prior?.source_artifacts ?? [],
    created_at: createdAt,
    updated_at: ctx.now,
  };
}

export function runFullMode(
  _input: NormalizedInput,
  _prior: Packet | null,
  _ctx: ModeContext,
): Packet {
  throw new Error('full mode not implemented until Session 11');
}

function deriveTitle(seed: string): string {
  const oneLine = seed.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return 'Untitled handoff';
  const truncated = oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
  return truncated.length >= 3 ? truncated : 'Untitled handoff';
}
