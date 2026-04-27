import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lint } from '../src/engine.js';
import { ALL_RULES } from '../src/rules/index.js';
import { detectSecrets } from '../src/secrets/detect.js';
import type { LintRule, Packet } from '../src/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, 'fixtures');

function load(rule: string, kind: 'good' | 'bad'): Packet {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, rule, kind, 'packet.json'), 'utf8')) as Packet;
}

interface Case {
  rule: string;
  folder: string;
  expectedSeverity: 'critical' | 'error';
}

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
    rule: 'BTN060',
    folder: 'BTN060-no-apparent-secrets-in-artifacts',
    expectedSeverity: 'critical',
  },
];

describe('lint engine — registry', () => {
  it('registers exactly the 5 expected rules in order', () => {
    expect(ALL_RULES.map((r) => r.code)).toEqual([
      'BTN001',
      'BTN002',
      'BTN003',
      'BTN004',
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
    expect(report.status).toBe('failed');
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
});
