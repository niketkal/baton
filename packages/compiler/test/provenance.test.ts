import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../src/pipeline.js';
import type { ArtifactRef } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'transcript-claude-code-01.md');

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-provenance-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const transcriptArtifact: ArtifactRef = { type: 'transcript', uri: FIXTURE };

describe('attachProvenanceLinks (via pipeline)', () => {
  it('populates provenance_links and a transcript source artifact', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    expect(result.valid).toBe(true);
    expect(result.packet.provenance_links.length).toBeGreaterThan(0);

    // Source artifact for the transcript should be present.
    const sa = result.packet.source_artifacts;
    expect(sa.length).toBeGreaterThan(0);
    expect(sa.some((a) => a.type === 'transcript')).toBe(true);
    const transcriptArt = sa.find((a) => a.type === 'transcript');
    expect(transcriptArt?.digest).toMatch(/^sha256:/);

    // At least one provenance link should reference the transcript artifact
    // and have non-null span_start/span_end (the runFastMode path picks
    // narrative fields verbatim from transcript messages, so spans match).
    const transcriptLinks = result.packet.provenance_links.filter(
      (l) => l.artifact_id === transcriptArt?.id,
    );
    expect(transcriptLinks.length).toBeGreaterThan(0);
    const withSpan = transcriptLinks.filter(
      (l) => typeof l.span_start === 'number' && typeof l.span_end === 'number',
    );
    expect(withSpan.length).toBeGreaterThan(0);
    for (const link of withSpan) {
      expect(link.span_start).not.toBeNull();
      expect(link.span_end).not.toBeNull();
      expect(link.span_start as number).toBeGreaterThanOrEqual(0);
      expect(link.span_end as number).toBeGreaterThan(link.span_start as number);
    }
  });

  it('produces stable link ids across compiles of the same input', async () => {
    const a = await compile({
      packetId: 'demo-a',
      repoRoot: mkdtempSync(join(tmpdir(), 'baton-prov-a-')),
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    const b = await compile({
      packetId: 'demo-b',
      repoRoot: mkdtempSync(join(tmpdir(), 'baton-prov-b-')),
      mode: 'fast',
      artifacts: [transcriptArtifact],
    });
    const idsA = a.packet.provenance_links.map((l) => l.id).sort();
    const idsB = b.packet.provenance_links.map((l) => l.id).sort();
    expect(idsA).toEqual(idsB);
  });
});
