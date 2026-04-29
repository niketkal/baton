import type { LLMCache, LLMProvider } from '@baton/llm';
import { SCHEMA_VERSION } from '@baton/schema';
import type { ParsedTranscript } from './parsers/types.js';
import type { RepoContext } from './repo.js';
import type { CompileWarning, Packet } from './types.js';

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
 * narrative fields from `prior` when present (so a prior `--full` LLM
 * extraction survives subsequent fast-mode rebuilds), and otherwise
 * derive cheap stand-ins from the transcript.
 */
export interface ModeResult {
  packet: Packet;
  warnings: CompileWarning[];
  /** Number of live (non-cached) extractor calls. Always 0 in fast mode. */
  callsLive?: number;
  /** Number of extractor calls served from the cache. Always 0 in fast mode. */
  callsCached?: number;
  /** Total input tokens across extractors. Always 0 in fast mode. */
  tokensIn?: number;
  /** Total output tokens across extractors. Always 0 in fast mode. */
  tokensOut?: number;
  /** Provider name recorded for cost reporting. Empty in fast mode. */
  provider?: string;
  /** Model name recorded for cost reporting. Empty in fast mode. */
  model?: string;
}

export function runFastMode(
  input: NormalizedInput,
  priorIn: Packet | null,
  ctx: ModeContext,
): ModeResult {
  const warnings: CompileWarning[] = [];
  let prior: Packet | null = priorIn;
  if (prior !== null && prior.schema_version !== SCHEMA_VERSION) {
    warnings.push({
      code: 'COMPILE_PRIOR_SCHEMA_MISMATCH',
      severity: 'warning',
      message: `Prior packet has schema_version='${prior.schema_version}', current is '${SCHEMA_VERSION}'. Discarding prior narrative; rebuilding from scratch.`,
      data: {
        prior_schema_version: prior.schema_version,
        current_schema_version: SCHEMA_VERSION,
      },
    });
    prior = null;
  }
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

  const packet: Packet = {
    schema_version: SCHEMA_VERSION,
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
  return { packet, warnings };
}

export interface FullModeDeps {
  llm: LLMProvider;
  cache: LLMCache | null;
  signal?: AbortSignal | undefined;
}

/**
 * `--full` mode: run the deterministic fast-mode assembly first, then
 * call the four LLM extractors and overwrite the narrative fields with
 * their output. If the LLM is not configured we keep the fast-mode
 * draft as-is and emit a `COMPILE_LLM_NOT_CONFIGURED` warning so the
 * surface contract (calling `--full` ran the LLM path) stays honest.
 *
 * Note: extractor imports live in `./extract/full-only.ts` so a
 * future audit can verify `runFastMode` never pulls them into its
 * import graph (CLAUDE.md invariant 2).
 */
export async function runFullMode(
  input: NormalizedInput,
  prior: Packet | null,
  ctx: ModeContext,
  deps: FullModeDeps,
): Promise<ModeResult> {
  const draft = runFastMode(input, prior, ctx);
  const warnings: CompileWarning[] = [...draft.warnings];

  if (!deps.llm.isConfigured()) {
    warnings.push({
      code: 'COMPILE_LLM_NOT_CONFIGURED',
      severity: 'warning',
      message:
        'compile --full was requested but no LLM provider is configured. Falling back to deterministic fast-mode narrative.',
      data: { provider: deps.llm.name },
    });
    return { ...draft, warnings, callsLive: 0, callsCached: 0, tokensIn: 0, tokensOut: 0 };
  }

  // Lazy-load the extractor module so `runFastMode`'s callers never
  // pull this branch's imports (incl. prompt files) into memory.
  const { runExtractors } = await import('./extract/full-only.js');
  const result = await runExtractors(
    input,
    deps.llm,
    deps.cache,
    { draft: draft.packet },
    deps.signal,
  );

  warnings.push(...result.warnings);

  // Merge: overwrite narrative fields when the extractor produced a
  // value; keep the fast-mode draft otherwise.
  const merged: Packet = { ...draft.packet };
  if (result.extracted.objective !== undefined) merged.objective = result.extracted.objective;
  if (result.extracted.next_action !== undefined) merged.next_action = result.extracted.next_action;
  if (result.extracted.attempts !== undefined) merged.attempts = result.extracted.attempts;
  if (result.extracted.acceptance_criteria !== undefined) {
    merged.acceptance_criteria = result.extracted.acceptance_criteria;
  }
  // Carry the model's confidence on the objective into the packet's
  // top-level `confidence_score`. Deliberately a single number; the
  // schema doesn't surface per-field confidence in v1.
  if (result.extracted.confidences.objective !== undefined) {
    merged.confidence_score = result.extracted.confidences.objective;
  }

  const out: ModeResult = {
    packet: merged,
    warnings,
    callsLive: result.callsLive,
    callsCached: result.callsCached,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    provider: result.provider,
    model: result.model,
  };
  return out;
}

function deriveTitle(seed: string): string {
  const oneLine = seed.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return 'Untitled handoff';
  const truncated = oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
  return truncated.length >= 3 ? truncated : 'Untitled handoff';
}
