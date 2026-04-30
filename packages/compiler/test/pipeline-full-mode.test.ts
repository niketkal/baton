import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CompleteOptions,
  type CompleteResult,
  LLMCache,
  type LLMProvider,
} from '@batonai/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../src/pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'transcript-claude-code-01.md');

class CannedProvider implements LLMProvider {
  readonly name = 'mock';
  callCount = 0;
  constructor(private readonly responses: string[]) {}
  isConfigured(): boolean {
    return true;
  }
  async complete(_opts: CompleteOptions): Promise<CompleteResult> {
    const i = this.callCount++;
    return {
      text: this.responses[Math.min(i, this.responses.length - 1)] ?? '',
      tokensIn: 100,
      tokensOut: 25,
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      cached: false,
    };
  }
  estimateTokens(text: string): number {
    return text.length;
  }
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-full-pipeline-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function freshProvider(): CannedProvider {
  return new CannedProvider([
    '{"objective":"Fix the flaky auth-flow integration test","confidence":0.85}',
    '{"attempts":[{"summary":"Tried lazy fixture init","result":"failed","failure_reason":"race on warm-up","evidence_span":"two tests warm the loader at once"}]}',
    '{"criteria":[{"text":"Test passes 100/100 runs","required":true}]}',
    '{"next_action":"Reproduce with --repeat-each=10","confidence":0.7}',
  ]);
}

describe('compile (full mode, mock provider)', () => {
  it('produces a packet whose narrative fields come from the extractors', async () => {
    const llm = freshProvider();
    const cache = new LLMCache({ root: join(tmp, '.baton', 'llm-cache') });
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'full',
      artifacts: [{ type: 'transcript', uri: FIXTURE }],
      llm,
      cache,
    });
    expect(result.valid).toBe(true);
    expect(result.usedLLM).toBe(true);
    expect(result.cacheHits).toBe(0);
    expect(result.cacheMisses).toBe(4);
    expect(result.tokensIn).toBe(400);
    expect(result.tokensOut).toBe(100);
    expect(result.llmProvider).toBe('anthropic');
    expect(result.llmModel).toBe('claude-sonnet-4-5');
    expect(result.packet.objective).toBe('Fix the flaky auth-flow integration test');
    expect(result.packet.next_action).toBe('Reproduce with --repeat-each=10');
    expect(result.packet.attempts).toHaveLength(1);
    expect(result.packet.acceptance_criteria).toHaveLength(1);
    expect(result.packet.confidence_score).toBeCloseTo(0.85);
  });

  it('a second compile run is served entirely from the cache', async () => {
    const cache = new LLMCache({ root: join(tmp, '.baton', 'llm-cache') });
    await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'full',
      artifacts: [{ type: 'transcript', uri: FIXTURE }],
      llm: freshProvider(),
      cache,
    });
    const llm = freshProvider();
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'full',
      artifacts: [{ type: 'transcript', uri: FIXTURE }],
      llm,
      cache,
    });
    expect(result.valid).toBe(true);
    expect(result.cacheHits).toBe(4);
    expect(result.cacheMisses).toBe(0);
    expect(result.usedLLM).toBe(false);
    expect(llm.callCount).toBe(0);
  });

  it('fast mode never imports the extractor module (sentinel: usedLLM=false, no tokens)', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      artifacts: [{ type: 'transcript', uri: FIXTURE }],
    });
    expect(result.usedLLM).toBe(false);
    expect(result.tokensIn ?? 0).toBe(0);
    expect(result.tokensOut ?? 0).toBe(0);
  });
});
