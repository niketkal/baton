import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyOutcome, runOutcomeIngest } from '../../src/commands/outcome.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('outcome classifyOutcome heuristics', () => {
  it('buckets clear successes', () => {
    expect(classifyOutcome('All tests pass and PR was merged.')).toBe('success');
    expect(classifyOutcome('Build succeeded.')).toBe('success');
  });

  it('buckets clear failures (failure beats success)', () => {
    expect(classifyOutcome('Tests pass but build failed with 1 error.')).toBe('failure');
    expect(classifyOutcome('Crashed during init.')).toBe('failure');
  });

  it('buckets incomplete states', () => {
    expect(classifyOutcome('Migration is in progress; TODO: cleanup.')).toBe('incomplete');
  });

  it('falls back to unknown', () => {
    expect(classifyOutcome('here is some neutral note about the file')).toBe('unknown');
  });
});

describe('outcome ingest', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-outcome-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('persists a JSON outcome and writes the events row', async () => {
    const src = join(dir, 'result.json');
    writeFileSync(src, JSON.stringify({ status: 'PR merged', tests: 'pass' }, null, 2), 'utf8');
    const code = await runOutcomeIngest(src, {
      packet: 'flaky-test-fix',
      source: 'codex',
      repo: dir,
    });
    expect(code).toBe(0);

    const outcomesDir = join(dir, '.baton', 'packets', 'flaky-test-fix', 'outcomes');
    const outcomes = readdirSync(outcomesDir);
    expect(outcomes.length).toBe(1);
    const outcomeFile = outcomes[0] as string;
    expect(outcomeFile).toMatch(/codex\.json$/);

    const stored = JSON.parse(readFileSync(join(outcomesDir, outcomeFile), 'utf8')) as {
      classification: string;
      source_tool: string;
      packet_id: string;
      format: string;
      body: unknown;
    };
    expect(stored.classification).toBe('success');
    expect(stored.source_tool).toBe('codex');
    expect(stored.packet_id).toBe('flaky-test-fix');
    expect(stored.format).toBe('json');

    const eventsLog = join(dir, '.baton', 'events', 'outcomes.jsonl');
    expect(existsSync(eventsLog)).toBe(true);
    const event = JSON.parse(readFileSync(eventsLog, 'utf8').trim()) as {
      packet_id: string;
      classification: string;
    };
    expect(event.packet_id).toBe('flaky-test-fix');
    expect(event.classification).toBe('success');
  });

  it('classifies a failure markdown payload', async () => {
    const src = join(dir, 'fail.md');
    writeFileSync(src, '# Result\n\nThe build failed with 3 errors.\n', 'utf8');
    const code = await runOutcomeIngest(src, {
      packet: 'flaky-test-fix',
      source: 'ci',
      repo: dir,
    });
    expect(code).toBe(0);
    const outcomesDir = join(dir, '.baton', 'packets', 'flaky-test-fix', 'outcomes');
    const stored = JSON.parse(
      readFileSync(join(outcomesDir, readdirSync(outcomesDir)[0] as string), 'utf8'),
    ) as { classification: string; format: string };
    expect(stored.classification).toBe('failure');
    expect(stored.format).toBe('markdown');
  });

  it('sanitizes the source tool name', async () => {
    const src = join(dir, 'r.md');
    writeFileSync(src, 'looks neutral', 'utf8');
    await runOutcomeIngest(src, {
      packet: 'pkt',
      source: '../evil/path tool',
      repo: dir,
    });
    const outcomesDir = join(dir, '.baton', 'packets', 'pkt', 'outcomes');
    const file = readdirSync(outcomesDir)[0] as string;
    expect(file).not.toContain('/');
    expect(file).not.toContain('..');
  });
});
