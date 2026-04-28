import { createHash } from 'node:crypto';
import type { ProvenanceLink, SourceArtifact } from '@baton/schema';
import type { NormalizedInput } from './modes.js';
import type { ParsedTranscript } from './parsers/types.js';
import type { Packet } from './types.js';

/**
 * Stable id for a transcript source artifact, derived from a digest of
 * its raw bytes so two compiles of the same file produce the same id.
 */
function transcriptArtifactId(transcript: ParsedTranscript): string {
  const raw = transcript.rawText ?? '';
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  return `transcript-${digest}`;
}

function transcriptArtifactDigest(transcript: ParsedTranscript): string {
  const raw = transcript.rawText ?? '';
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

/**
 * Stable id for a provenance link, scoped by field + artifact + span so
 * the same compile produces the same id deterministically.
 */
function linkId(
  field: string,
  artifactId: string,
  start: number | null,
  end: number | null,
): string {
  const spanPart = start !== null && end !== null ? `${start}-${end}` : 'whole';
  const raw = `${field}|${artifactId}|${spanPart}`;
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  // Provenance link ids must match `^[a-z0-9][a-z0-9._-]{1,127}$`.
  return `pl-${digest}`;
}

interface SpanCandidate {
  start: number;
  end: number;
}

/**
 * Find the byte span covering the message whose trimmed text matches
 * `value`. Returns `null` when no message matches — typically because
 * the field text was synthesized rather than copied verbatim.
 */
function findSpanForText(transcript: ParsedTranscript, value: string): SpanCandidate | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  for (const m of transcript.messages) {
    if (m.text.trim() !== trimmed) continue;
    if (typeof m.span_start === 'number' && typeof m.span_end === 'number') {
      return { start: m.span_start, end: m.span_end };
    }
  }
  return null;
}

interface AddLinkOpts {
  field: string;
  artifactId: string;
  ref: string;
  span: SpanCandidate | null;
}

function buildLink(opts: AddLinkOpts): ProvenanceLink {
  const link: ProvenanceLink = {
    id: linkId(opts.field, opts.artifactId, opts.span?.start ?? null, opts.span?.end ?? null),
    field_name: opts.field,
    artifact_id: opts.artifactId,
    source_type: 'transcript',
    ref: opts.ref,
    span_start: opts.span?.start ?? null,
    span_end: opts.span?.end ?? null,
  };
  return link;
}

/**
 * Walk `packet` and `normalized` together, attach `provenance_links`
 * (and the matching `source_artifacts` entry) for everything the
 * deterministic fast-mode pipeline can attribute today:
 *
 * - Each `context_items[i]` whose `provenance_refs` is empty gets a
 *   link tying it to the transcript artifact.
 * - Each narrative field (`objective`, `current_state`, `next_action`)
 *   that matches a transcript message verbatim gets a link with the
 *   message's byte span.
 *
 * Returns a NEW packet (immutable update). When there is no transcript
 * input the packet is returned as-is — provenance for other artifact
 * types arrives in later sessions.
 */
export function attachProvenanceLinks(packet: Packet, normalized: NormalizedInput): Packet {
  const transcript = normalized.transcript;
  if (transcript === undefined) return packet;

  const artifactId = transcriptArtifactId(transcript);
  const ref = `transcript:${artifactId}`;

  // Preserve any prior links the assemble step copied through (e.g. from a
  // prior packet) — but drop any whose artifact_id matches the current
  // transcript so we don't duplicate them.
  const carried = (packet.provenance_links ?? []).filter((l) => l.artifact_id !== artifactId);
  const links: ProvenanceLink[] = [...carried];

  const seenLinkIds = new Set(links.map((l) => l.id));
  const pushLink = (link: ProvenanceLink): void => {
    if (seenLinkIds.has(link.id)) return;
    seenLinkIds.add(link.id);
    links.push(link);
  };

  // Narrative fields: only attach a span when the field text matches a
  // transcript message verbatim. Fast-mode `runFastMode` derives some
  // fields exactly from `firstUser`, `firstAssistant`, `lastAssistant`,
  // so the verbatim match is actually common.
  for (const field of ['objective', 'current_state', 'next_action'] as const) {
    const value = packet[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    const span = findSpanForText(transcript, value);
    pushLink(buildLink({ field, artifactId, ref, span }));
  }

  // Context items: each one's `ref` becomes its own link with no span
  // (the deterministic pass doesn't know which transcript region
  // motivated it). Session 11's LLM pass will refine spans.
  (packet.context_items ?? []).forEach((item, idx) => {
    pushLink(
      buildLink({
        field: `context_items[${idx}]`,
        artifactId,
        ref: item.ref,
        span: null,
      }),
    );
  });

  // Source artifacts: ensure the transcript appears exactly once. Keep
  // any already-present entries (from prior compiles or other passes).
  const existingArtifacts = packet.source_artifacts ?? [];
  const haveTranscript = existingArtifacts.some((a) => a.id === artifactId);
  const sourceArtifacts: SourceArtifact[] = haveTranscript
    ? existingArtifacts
    : [
        ...existingArtifacts,
        {
          id: artifactId,
          type: 'transcript',
          source_tool: transcript.tool,
          uri: ref,
          digest: transcriptArtifactDigest(transcript),
          created_at: packet.updated_at,
        },
      ];

  return {
    ...packet,
    provenance_links: links,
    source_artifacts: sourceArtifacts,
  };
}
