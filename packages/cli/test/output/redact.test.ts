import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redactForLog } from '../../src/output/redact.js';

const ORIGINAL_LEVEL = process.env.BATON_LOG_LEVEL;

describe('redactForLog', () => {
  beforeEach(() => {
    process.env.BATON_LOG_LEVEL = undefined;
  });
  afterEach(() => {
    if (ORIGINAL_LEVEL === undefined) process.env.BATON_LOG_LEVEL = undefined;
    else process.env.BATON_LOG_LEVEL = ORIGINAL_LEVEL;
  });

  it('passes typed metadata through unchanged', () => {
    const out = redactForLog({ command: 'failover', duration_ms: 1000, exit_code: 0 });
    expect(out).toEqual({ command: 'failover', duration_ms: 1000, exit_code: 0 });
  });

  it('rejects unknown metadata fields', () => {
    expect(() =>
      redactForLog({ totally_unknown_field: 'x' } as unknown as { command?: string }),
    ).toThrow(/unknown metadata field/);
  });

  it('rejects { raw } payload outside debug-unsafe', () => {
    expect(() => redactForLog({ raw: 'sk-secret' })).toThrow(/debug-unsafe/);
  });

  it('accepts { raw } payload only with debug-unsafe', () => {
    process.env.BATON_LOG_LEVEL = 'debug-unsafe';
    const out = redactForLog({ raw: 'arbitrary text' });
    expect(out).toEqual({ unsafe: true, raw: 'arbitrary text' });
  });

  it('strips BTN060-flagged values from string fields', () => {
    // sk-ant- is a BTN060 prefix; detectSecrets tokenizes on whitespace
    // and quote-like punctuation, so the value must be standalone.
    const out = redactForLog({
      command: 'compile',
      path: 'sk-ant-deadbeefcafe1234567890abcd',
    });
    expect(out.path).toContain('[REDACTED]');
    expect(out.path).not.toContain('sk-ant-deadbeefcafe1234567890abcd');
  });

  it('strips BTN060-flagged values from nested arrays', () => {
    const out = redactForLog({
      paths: ['/safe/path', 'sk-ant-deadbeefcafe1234567890abcd'],
    });
    expect(Array.isArray(out.paths)).toBe(true);
    const arr = out.paths as string[];
    expect(arr[0]).toBe('/safe/path');
    expect(arr[1]).toContain('[REDACTED]');
  });

  it('drops undefined fields', () => {
    const out = redactForLog({ command: 'init', packet_id: undefined });
    expect(out).toEqual({ command: 'init' });
  });
});
