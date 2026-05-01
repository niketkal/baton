import { describe, expect, it } from 'vitest';
import { validatePacketId } from '../src/index.js';

describe('validatePacketId', () => {
  it('accepts well-formed ids', () => {
    for (const id of ['demo', 'feat-x', 'pkg.v2', 'a1', 'a_b', 'a-b.c_d', 'a'.repeat(128)]) {
      expect(() => validatePacketId(id)).not.toThrow();
    }
  });

  it('rejects path-traversal sequences', () => {
    expect(() => validatePacketId('../foo')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('foo/../bar')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('..')).toThrow(/invalid packet id/);
  });

  it('rejects absolute paths', () => {
    expect(() => validatePacketId('/abs/path')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('C:\\foo')).toThrow(/invalid packet id/);
  });

  it('rejects whitespace and control bytes', () => {
    expect(() => validatePacketId('has space')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('has\nnewline')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('has\ttab')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('has\0null')).toThrow(/invalid packet id/);
  });

  it('rejects ids that start with a separator', () => {
    expect(() => validatePacketId('-leading-dash')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('.leading-dot')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('_leading-underscore')).toThrow(/invalid packet id/);
  });

  it('rejects empty, too-short, and too-long ids', () => {
    expect(() => validatePacketId('')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('a')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('a'.repeat(129))).toThrow(/invalid packet id/);
  });

  it('rejects uppercase and unicode', () => {
    expect(() => validatePacketId('Foo')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('café')).toThrow(/invalid packet id/);
    expect(() => validatePacketId('日本語')).toThrow(/invalid packet id/);
  });

  it('rejects non-string inputs', () => {
    expect(() => validatePacketId(null as unknown as string)).toThrow(/expected string/);
    expect(() => validatePacketId(undefined as unknown as string)).toThrow(/expected string/);
    expect(() => validatePacketId(42 as unknown as string)).toThrow(/expected string/);
    expect(() => validatePacketId({} as unknown as string)).toThrow(/expected string/);
  });
});
