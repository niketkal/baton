import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type CompleteOptions, type CompleteResult, LLMCache, type LLMProvider } from '@baton/llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCompile } from '../../src/commands/compile.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';
import { BUDGETS, PKG_ROOT } from './_helpers.js';

// compile --full perf test runs in-process with a mock provider so we
// never make a network call (CLAUDE.md invariant 6: no real LLM keys
// in CI). Spawning the binary would require either a real provider
// env or a spawn-time injection hook neither of which exist; the
// in-process API is the established pattern (see compile-full.test.ts).
const TRANSCRIPT_FIXTURE = resolve(
  PKG_ROOT,
  '..',
  'compiler',
  'test',
  'fixtures',
  'transcript-claude-code-01.md',
);

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

describe('performance: baton compile --full (mock LLM)', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-perf-compile-full-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const artDir = join(dir, '.baton', 'artifacts', 'art-001');
    mkdirSync(artDir, { recursive: true });
    writeFileSync(
      join(artDir, 'metadata.json'),
      JSON.stringify({ id: 'art-001', kind: 'transcript', file: 'transcript.md' }),
    );
    writeFileSync(join(artDir, 'transcript.md'), readFileSync(TRANSCRIPT_FIXTURE, 'utf8'));
  });
  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('compile --full completes under the 10s tech-spec budget with a mock provider', async () => {
    const llm = new CannedProvider([
      '{"objective":"Fix the flaky auth-flow integration test","confidence":0.85}',
      '{"attempts":[{"summary":"Tried lazy fixture init","result":"failed","failure_reason":"race","evidence_span":""}]}',
      '{"criteria":[{"text":"Test passes 100/100 runs","required":true}]}',
      '{"next_action":"Reproduce with --repeat-each=10","confidence":0.7}',
    ]);
    const cache = new LLMCache({ root: join(dir, '.baton', 'llm-cache') });
    const start = performance.now();
    const code = await runCompile({
      packet: 'demo',
      mode: 'full',
      repo: dir,
      llm,
      cache,
    });
    const elapsed = performance.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeLessThan(BUDGETS.compileFull);
  });
});
