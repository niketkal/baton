import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCases } from '../src/cases/index.js';
import { comparePartialPacket, runConformance, safeEnv } from '../src/runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK_BIN = resolve(HERE, 'fixtures', 'mock-bin.mjs');

describe('runConformance against the mock binary', () => {
  it('passes the happy-path cases and surfaces secret-leak / partial-context as expected', async () => {
    const cases = loadCases();
    const report = await runConformance({ cases, binPath: MOCK_BIN });
    expect(report.total).toBe(cases.length);
    // The mock binary is engineered to satisfy every case
    // expectation: BTN060 fires on the secret-leak fixture, BTN010
    // fires on partial-context, and the three happy-path cases pass
    // lint with the right task_type.
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(cases.length);
  }, 30_000);

  it('fails the secret-leak case if the mock cannot detect a secret (binary that always passes)', async () => {
    const ALWAYS_PASS = resolve(HERE, 'fixtures', 'always-pass-bin.mjs');
    const cases = loadCases();
    const secretCase = cases.find((c) => c.id === 'secret-leak');
    expect(secretCase).toBeDefined();
    if (secretCase === undefined) throw new Error('secret-leak case missing');
    const report = await runConformance({ cases: [secretCase], binPath: ALWAYS_PASS });
    // Secret-leak case expects lint to fail; an always-pass binary
    // should be flagged as a runner failure.
    expect(report.failed).toBe(1);
    expect(report.results[0]?.failures.some((f) => f.includes('lint'))).toBe(true);
  }, 30_000);
});

describe('safeEnv (conformance harness env allowlist)', () => {
  // Secrets the harness must never propagate into the target binary.
  // Listed explicitly so a future refactor that accidentally re-adds
  // `{ ...process.env }` regresses this test loudly.
  const SECRET_KEYS = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'NPM_TOKEN',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'BATON_CODEX_BIN',
    'BATON_CLAUDE_BIN',
  ];

  it('does not leak secret env vars to the target binary', () => {
    const previous: Record<string, string | undefined> = {};
    for (const key of SECRET_KEYS) {
      previous[key] = process.env[key];
      process.env[key] = `canary-${key}`;
    }
    try {
      const env = safeEnv();
      for (const key of SECRET_KEYS) {
        expect(env[key], `expected ${key} to be stripped from target env`).toBeUndefined();
      }
      // Sanity: PATH still passes so the target can still resolve
      // executables, and NO_COLOR is forced on.
      expect(env.PATH).toBeDefined();
      expect(env.NO_COLOR).toBe('1');
    } finally {
      for (const key of SECRET_KEYS) {
        const prior = previous[key];
        if (prior === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = prior;
        }
      }
    }
  });

  it('forces NO_COLOR=1 even when the host has a different value set', () => {
    const prior = process.env.NO_COLOR;
    process.env.NO_COLOR = '';
    try {
      expect(safeEnv().NO_COLOR).toBe('1');
    } finally {
      if (prior === undefined) {
        // biome-ignore lint/performance/noDelete: env vars must be unset
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = prior;
      }
    }
  });
});

describe('comparePartialPacket', () => {
  it('returns no failures when expected fields match', () => {
    const failures = comparePartialPacket(
      { id: 'a', task_type: 'debugging', extra: 1 },
      { task_type: 'debugging' },
    );
    expect(failures).toEqual([]);
  });

  it('flags a mismatched scalar', () => {
    const failures = comparePartialPacket({ task_type: 'review' }, { task_type: 'debugging' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('task_type');
  });

  it('handles arrays partially', () => {
    const failures = comparePartialPacket(
      { items: [{ kind: 'a' }, { kind: 'b' }] },
      { items: [{ kind: 'a' }] },
    );
    expect(failures).toEqual([]);
  });
});
