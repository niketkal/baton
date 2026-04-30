import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CompleteOptions,
  type CompleteResult,
  LLMCache,
  type LLMProvider,
} from '@batonai/llm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCompile } from '../../src/commands/compile.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_FIXTURE = join(
  __dirname,
  '..',
  '..',
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

function freshProvider(): CannedProvider {
  return new CannedProvider([
    '{"objective":"Fix the flaky auth-flow integration test","confidence":0.85}',
    '{"attempts":[{"summary":"Tried lazy fixture init","result":"failed","failure_reason":"race","evidence_span":""}]}',
    '{"criteria":[{"text":"Test passes 100/100 runs","required":true}]}',
    '{"next_action":"Reproduce with --repeat-each=10","confidence":0.7}',
  ]);
}

let dir: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderrChunks: string[];
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'baton-cli-compile-full-'));
  resetLoggerCacheForTests();
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrChunks = [];
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderrChunks.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'),
    );
    return true;
  });
  // Ingest one transcript artifact so compile has something to chew on.
  const artDir = join(dir, '.baton', 'artifacts', 'art-001');
  mkdirSync(artDir, { recursive: true });
  writeFileSync(
    join(artDir, 'metadata.json'),
    JSON.stringify({ id: 'art-001', kind: 'transcript', file: 'transcript.md' }),
  );
  writeFileSync(join(artDir, 'transcript.md'), readFileSync(SHARED_FIXTURE, 'utf8'));
});

afterEach(async () => {
  stdout.mockRestore();
  stderr.mockRestore();
  await closeLogger();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function readLogEvents(): Array<Record<string, unknown>> {
  const logsDir = join(dir, '.baton', 'logs');
  if (!existsSync(logsDir)) return [];
  const files = readdirSync(logsDir).filter((f) => f.endsWith('.log'));
  const out: Array<Record<string, unknown>> = [];
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // ignore
      }
    }
  }
  return out;
}

describe('cli compile --full', () => {
  it('prints the cost block to stderr and writes a §12.3-shaped log event', async () => {
    const llm = freshProvider();
    const cache = new LLMCache({ root: join(dir, '.baton', 'llm-cache') });
    const code = await runCompile({
      packet: 'demo',
      mode: 'full',
      repo: dir,
      llm,
      cache,
    });
    expect(code).toBe(0);
    const errOut = stderrChunks.join('');
    expect(errOut).toMatch(/LLM calls: 4 \(0 cached, 4 live\)/);
    expect(errOut).toMatch(/Tokens: 400 input \/ 100 output/);
    expect(errOut).toMatch(/Estimated cost: \$\d+\.\d{3} to \$\d+\.\d{3}/);

    const events = readLogEvents();
    const completeEvent = events.find((e) => e.msg === 'command complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.command).toBe('compile');
    expect(completeEvent?.mode).toBe('full');
    expect(completeEvent?.exit_code).toBe(0);
    expect(completeEvent?.packet_id).toBe('demo');
    expect(completeEvent?.llm_provider).toBe('anthropic');
    expect(completeEvent?.llm_calls_live).toBe(4);
    expect(completeEvent?.llm_calls_cached).toBe(0);
    expect(completeEvent?.tokens_in).toBe(400);
    expect(completeEvent?.tokens_out).toBe(100);
    expect(typeof completeEvent?.estimated_cost_usd_min).toBe('number');
    expect(typeof completeEvent?.estimated_cost_usd_max).toBe('number');
    // Defense-in-depth: prompt content / completion text never enters the log.
    const fullText = JSON.stringify(events);
    expect(fullText).not.toMatch(/Reproduce with --repeat-each/);
    expect(fullText).not.toMatch(/Fix the flaky auth-flow/);
  });

  it('--full with explicit --json still emits the structured log event', async () => {
    const llm = freshProvider();
    const cache = new LLMCache({ root: join(dir, '.baton', 'llm-cache') });
    const code = await runCompile({
      packet: 'demo',
      mode: 'full',
      repo: dir,
      json: true,
      llm,
      cache,
    });
    expect(code).toBe(0);
    // No human cost block in JSON mode, but the log still has the metrics.
    const events = readLogEvents();
    const ce = events.find((e) => e.msg === 'command complete');
    expect(ce?.tokens_in).toBe(400);
    expect(ce?.tokens_out).toBe(100);
    expect(ce?.estimated_cost_usd_min).toBeTypeOf('number');
  });
});
