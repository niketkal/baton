import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schemaModule from '@baton/schema';
import { describe, expect, it, vi } from 'vitest';
import { lint } from '../src/engine.js';
import { BTN002 } from '../src/rules/BTN002-packet-schema-valid.js';
import { BTN012 } from '../src/rules/BTN012-referenced-files-exist.js';
import { BTN013 } from '../src/rules/BTN013-git-refs-resolve.js';
import { BTN014 } from '../src/rules/BTN014-packet-not-stale.js';
import { BTN040 } from '../src/rules/BTN040-status-transition-legal.js';
import { ALL_RULES } from '../src/rules/index.js';
import { detectSecrets } from '../src/secrets/detect.js';
import type { LintRule, Packet } from '../src/types.js';
import { clonePacket } from './_base.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, 'fixtures');

function load(rule: string, kind: 'good' | 'bad'): Packet {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, rule, kind, 'packet.json'), 'utf8')) as Packet;
}

interface Case {
  rule: string;
  folder: string;
  expectedSeverity: 'critical' | 'error' | 'warning';
}

/**
 * Standard fixture-based cases. Each rule's `bad` fixture must surface a
 * finding from that rule via `lint(packet)` (no special ctx). Rules that
 * require an injected accessor (BTN012/013/014) are exercised via the
 * dedicated suites further down rather than this generic table.
 */
const CASES: Case[] = [
  { rule: 'BTN001', folder: 'BTN001-schema-version-supported', expectedSeverity: 'critical' },
  { rule: 'BTN002', folder: 'BTN002-packet-schema-valid', expectedSeverity: 'critical' },
  {
    rule: 'BTN003',
    folder: 'BTN003-required-narrative-fields-present',
    expectedSeverity: 'error',
  },
  { rule: 'BTN004', folder: 'BTN004-confidence-score-bounded', expectedSeverity: 'error' },
  {
    rule: 'BTN010',
    folder: 'BTN010-repo-context-required-for-code-tasks',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN011',
    folder: 'BTN011-context-items-required-for-code-tasks',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN020',
    folder: 'BTN020-acceptance-criteria-required-for-execution',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN021',
    folder: 'BTN021-open-blocking-questions-gate-readiness',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN030',
    folder: 'BTN030-constraints-require-provenance',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN031',
    folder: 'BTN031-attempt-failures-require-evidence',
    expectedSeverity: 'warning',
  },
  {
    rule: 'BTN032',
    folder: 'BTN032-acceptance-criteria-require-provenance',
    expectedSeverity: 'warning',
  },
  {
    rule: 'BTN033',
    folder: 'BTN033-context-items-require-provenance',
    expectedSeverity: 'warning',
  },
  {
    rule: 'BTN041',
    folder: 'BTN041-ready-requires-validation-level-ready',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN042',
    folder: 'BTN042-approval-policy-respected',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN043',
    folder: 'BTN043-dispatch-allowed-policy-respected',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN050',
    folder: 'BTN050-blocking-warnings-gate-dispatch',
    expectedSeverity: 'error',
  },
  {
    rule: 'BTN060',
    folder: 'BTN060-no-apparent-secrets-in-artifacts',
    expectedSeverity: 'critical',
  },
];

describe('lint engine — registry', () => {
  it('registers exactly the expected rules in canonical order', () => {
    expect(ALL_RULES.map((r) => r.code)).toEqual([
      'BTN001',
      'BTN002',
      'BTN003',
      'BTN004',
      'BTN010',
      'BTN011',
      'BTN012',
      'BTN013',
      'BTN014',
      'BTN020',
      'BTN021',
      'BTN030',
      'BTN031',
      'BTN032',
      'BTN033',
      'BTN040',
      'BTN041',
      'BTN042',
      'BTN043',
      'BTN050',
      'BTN060',
    ]);
  });
});

describe.each(CASES)('rule $rule', ({ rule, folder, expectedSeverity }) => {
  it(`good fixture passes (no ${rule} finding)`, () => {
    const packet = load(folder, 'good');
    const report = lint(packet);
    const codes = [...report.errors, ...report.warnings].map((f) => f.code);
    expect(codes).not.toContain(rule);
  });

  it(`bad fixture surfaces ${rule} as ${expectedSeverity}`, () => {
    const packet = load(folder, 'bad');
    const report = lint(packet);
    const all = [...report.errors, ...report.warnings];
    const hits = all.filter((f) => f.code === rule);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.severity).toBe(expectedSeverity);
    }
    // For warning-severity rules we don't assert report.status since
    // those don't fail by default; for error/critical rules the report
    // must be failed.
    if (expectedSeverity !== 'warning') {
      expect(report.status).toBe('failed');
    }
  });
});

describe('BTN012 with injected fs accessor', () => {
  it('good fixture: all referenced files exist => no finding', () => {
    const packet = load('BTN012-referenced-files-exist', 'good');
    const fs = {
      existsSync: (_p: string) => true,
    };
    const findings = BTN012.check(packet, { fs });
    expect(findings).toHaveLength(0);
  });

  it('bad fixture: missing referenced file => error finding', () => {
    const packet = load('BTN012-referenced-files-exist', 'bad');
    const fs = {
      existsSync: (p: string) => !p.includes('missing'),
    };
    const findings = BTN012.check(packet, { fs });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/missing\.ts/);
    expect(findings[0]?.path).toBe('/context_items/0/ref');
  });

  it('is a no-op when ctx.fs is absent', () => {
    const packet = load('BTN012-referenced-files-exist', 'bad');
    const findings = BTN012.check(packet, {});
    expect(findings).toEqual([]);
  });

  it('skips when repo_context.attached is false', () => {
    const packet = load('BTN012-referenced-files-exist', 'bad');
    (packet.repo_context as { attached: boolean }).attached = false;
    const fs = { existsSync: () => false };
    const findings = BTN012.check(packet, { fs });
    expect(findings).toEqual([]);
  });

  it('rejects an absolute context_item.ref without consulting the fs accessor', () => {
    const packet = load('BTN012-referenced-files-exist', 'bad-absolute');
    let consulted = false;
    const fs = {
      existsSync: (_p: string) => {
        consulted = true;
        return true;
      },
    };
    const findings = BTN012.check(packet, { fs });
    expect(consulted).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/absolute paths are not allowed/);
    expect(findings[0]?.path).toBe('/context_items/0/ref');
  });

  it('rejects a `..`-traversal context_item.ref without consulting the fs accessor', () => {
    const packet = load('BTN012-referenced-files-exist', 'bad-traversal');
    let consulted = false;
    const fs = {
      existsSync: (_p: string) => {
        consulted = true;
        return true;
      },
    };
    const findings = BTN012.check(packet, { fs });
    expect(consulted).toBe(false);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/must not traverse outside the repo/);
    expect(findings[0]?.path).toBe('/context_items/0/ref');
  });
});

describe('BTN013 with injected git ref resolver', () => {
  it('good fixture: all refs resolve => no finding', () => {
    const packet = load('BTN013-git-refs-resolve', 'good');
    const gitRefs = { resolves: () => 'resolved' as const };
    const findings = BTN013.check(packet, { gitRefs });
    expect(findings).toHaveLength(0);
  });

  it('bad fixture: deleted branch does not resolve => error finding', () => {
    const packet = load('BTN013-git-refs-resolve', 'bad');
    const gitRefs = {
      resolves: (ref: string) =>
        (ref === 'deleted-branch' ? 'unresolved' : 'resolved') as
          | 'resolved'
          | 'unresolved'
          | 'unavailable',
    };
    const findings = BTN013.check(packet, { gitRefs });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/deleted-branch/);
    expect(findings[0]?.path).toBe('/repo_context/branch');
  });

  it('is a no-op when ctx.gitRefs is absent', () => {
    const packet = load('BTN013-git-refs-resolve', 'bad');
    const findings = BTN013.check(packet, {});
    expect(findings).toEqual([]);
  });

  it('silently skips when the resolver reports git is unavailable', () => {
    const packet = load('BTN013-git-refs-resolve', 'bad');
    const gitRefs = { resolves: () => 'unavailable' as const };
    const findings = BTN013.check(packet, { gitRefs });
    expect(findings).toEqual([]);
  });
});

describe('BTN014 with injected freshness signal', () => {
  it('good fixture: freshness.stale=false => no finding', () => {
    const packet = load('BTN014-packet-not-stale', 'good');
    const findings = BTN014.check(packet, { freshness: { stale: false } });
    expect(findings).toHaveLength(0);
  });

  it('bad fixture: freshness.stale=true => critical finding', () => {
    const packet = load('BTN014-packet-not-stale', 'bad');
    const findings = BTN014.check(packet, {
      freshness: { stale: true, reason: 'referenced files changed since compile' },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/stale/i);
    expect(findings[0]?.message).toMatch(/referenced files changed/);
  });

  it('is a no-op when ctx.freshness is absent', () => {
    const packet = load('BTN014-packet-not-stale', 'bad');
    const findings = BTN014.check(packet, {});
    expect(findings).toEqual([]);
  });
});

describe('BTN040 with injected priorStatus', () => {
  it('is a no-op when ctx.priorStatus is absent', () => {
    const packet = load('BTN040-status-transition-legal', 'bad');
    const findings = BTN040.check(packet, {});
    expect(findings).toEqual([]);
  });

  it('is a no-op when ctx.priorStatus equals current status', () => {
    const packet = load('BTN040-status-transition-legal', 'good');
    const findings = BTN040.check(packet, { priorStatus: 'ready_for_export' });
    expect(findings).toEqual([]);
  });

  it('passes a legal transition (draft -> ready_for_export)', () => {
    const packet = load('BTN040-status-transition-legal', 'good');
    const findings = BTN040.check(packet, { priorStatus: 'draft' });
    expect(findings).toEqual([]);
  });

  it('flags an illegal skip (draft -> dispatched)', () => {
    const packet = load('BTN040-status-transition-legal', 'bad');
    const findings = BTN040.check(packet, { priorStatus: 'draft' });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/draft/);
    expect(findings[0]?.message).toMatch(/dispatched/);
    expect(findings[0]?.path).toBe('/status');
  });

  it('flags any move out of a terminal status', () => {
    const packet = load('BTN040-status-transition-legal', 'good');
    const findings = BTN040.check(packet, { priorStatus: 'completed' });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/terminal/);
  });
});

describe('BTN042 approvalGranted gates dispatch', () => {
  it('clears the finding when approvalGranted=true', () => {
    const packet = load('BTN042-approval-policy-respected', 'bad');
    const report = lint(packet, { approvalGranted: true });
    expect(report.errors.map((f) => f.code)).not.toContain('BTN042');
  });
});

describe('BTN031 strict mode promotion', () => {
  it('warning by default, promoted to error in strict mode', () => {
    const packet = load('BTN031-attempt-failures-require-evidence', 'bad');

    const lenient = lint(packet);
    expect(lenient.warnings.map((f) => f.code)).toContain('BTN031');
    expect(lenient.errors.map((f) => f.code)).not.toContain('BTN031');

    const strict = lint(packet, {}, { strict: true });
    expect(strict.errors.map((f) => f.code)).toContain('BTN031');
  });
});

describe('lint engine — robustness', () => {
  it('does not crash and reports a finding when a rule throws', () => {
    const packet = load('BTN001-schema-version-supported', 'good');
    const exploding: LintRule = {
      code: 'BTN999',
      severity: 'error',
      failInStrict: true,
      description: 'synthetic exploder',
      check() {
        throw new Error('boom');
      },
    };
    const report = lint(packet, {}, {}, [exploding]);
    expect(report.status).toBe('failed');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.code).toBe('BTN999');
    expect(report.errors[0]?.message).toMatch(/boom/);
  });

  it('strict mode promotes warning-severity findings of failInStrict rules into errors', () => {
    const packet = load('BTN001-schema-version-supported', 'good');
    const warnish: LintRule = {
      code: 'BTN998',
      severity: 'warning',
      failInStrict: true,
      description: 'synthetic warning that should fail in strict mode',
      check() {
        return [{ message: 'always fires' }];
      },
    };

    const lenient = lint(packet, {}, { strict: false }, [warnish]);
    expect(lenient.status).toBe('passed');
    expect(lenient.warnings.map((f) => f.code)).toContain('BTN998');
    expect(lenient.errors.map((f) => f.code)).not.toContain('BTN998');

    const strict = lint(packet, {}, { strict: true }, [warnish]);
    expect(strict.status).toBe('failed');
    expect(strict.errors.map((f) => f.code)).toContain('BTN998');
    expect(strict.warnings.map((f) => f.code)).not.toContain('BTN998');
  });
});

describe('detectSecrets heuristics', () => {
  it('flags a known token prefix', () => {
    const hits = detectSecrets('use sk-ant-abcdef0123456789ABCDEF here');
    expect(hits.some((h) => h.kind === 'prefix')).toBe(true);
  });

  it('flags PEM private key markers', () => {
    const hits = detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n');
    expect(hits.some((h) => h.kind === 'pem')).toBe(true);
  });

  it('flags .env-style assignments', () => {
    const hits = detectSecrets('AWS_SECRET_ACCESS_KEY=abcdefghij1234567890');
    expect(hits.some((h) => h.kind === 'env')).toBe(true);
  });

  it('flags high-entropy strings near sensitive context terms', () => {
    const hits = detectSecrets('password: aZ9!bX2@cV3#dQ4$eM5%fL6^gH7&iJ8*kP9 used in handshake');
    expect(hits.some((h) => h.kind === 'entropy')).toBe(true);
  });

  it('does not flag innocuous prose', () => {
    const hits = detectSecrets('The quick brown fox jumps over the lazy dog.');
    expect(hits).toHaveLength(0);
  });

  it('flags a high-entropy token at the 40-char keyword window boundary', () => {
    // Token: 32 chars, high entropy (mixed alnum + symbols).
    const token = 'aZ9!bX2@cV3#dQ4$eM5%fL6^gH7&iJ8*';
    // Place 'password' at the start of the string and the token at offset
    // exactly 40 — this is the inclusive boundary: winStart = max(0, 40-40)
    // = 0, so 'password' (chars 0..7) is just barely inside the window.
    // Pushing the token to offset 41 shifts winStart to 1 and the keyword
    // 'p' falls out of the window — the literal 'password' no longer
    // appears in `window` and the heuristic should not fire.
    // Use spaces (a token boundary) so the tokenizer sees the high-entropy
    // run as its own token starting at the intended offset.
    const atBoundary = `password${' '.repeat(32)}${token}`; // token offset = 40
    const beyondBoundary = `password${' '.repeat(33)}${token}`; // token offset = 41

    const hitsAt = detectSecrets(atBoundary);
    expect(hitsAt.some((h) => h.kind === 'entropy')).toBe(true);

    const hitsBeyond = detectSecrets(beyondBoundary);
    expect(hitsBeyond.some((h) => h.kind === 'entropy')).toBe(false);
  });
});

describe('lint engine — null/non-object packet guard', () => {
  it('returns a single BTN-engine finding instead of N rule-threw findings', () => {
    const report = lint(null as unknown as Packet);
    expect(report.status).toBe('failed');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.code).toBe('BTN-engine');
    expect(report.errors[0]?.severity).toBe('critical');
    expect(report.errors[0]?.message).toBe('packet is not an object');
    expect(report.packetId).toBe('<unknown>');
    expect(report.summary).toEqual({ blockingCount: 1, warningCount: 0 });
  });
});

describe('BTN004 type-mismatch handling', () => {
  it('fires when confidence_score is a string instead of a number', () => {
    const packet = clonePacket({ confidence_score: '0.5' as unknown as number });
    const report = lint(packet);
    const hits = [...report.errors, ...report.warnings].filter((f) => f.code === 'BTN004');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.severity).toBe('error');
  });
});

describe('BTN002 fallback when ajv reports no error objects', () => {
  it('emits a single generic schema-invalid finding', () => {
    // Simulate the rare ajv mode where validation fails but `errors` is null
    // or empty by stubbing the module-level validator BTN002 reads from.
    const spy = vi
      .spyOn(schemaModule, 'validatePacket')
      .mockReturnValue({ valid: false, errors: [] });
    try {
      const packet = clonePacket();
      const findings = BTN002.check(packet, {});
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/schema validation/i);
      expect(findings[0]?.path).toBe('/');
    } finally {
      spy.mockRestore();
    }
  });
});
