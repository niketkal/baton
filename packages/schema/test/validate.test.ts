import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PacketValidationError,
  SCHEMA_VERSION,
  assertPacket,
  packetSchema,
  validatePacket,
} from '../src/index.js';

const fixturePath = fileURLToPath(new URL('./fixtures/minimal-valid-packet.json', import.meta.url));
const validPacket = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;

describe('packetSchema', () => {
  it('exposes the JSON Schema with the canonical $id', () => {
    expect(packetSchema.$id).toBe('https://baton.dev/schema/packet-v1.json');
  });

  it('is frozen so consumers cannot mutate it', () => {
    expect(Object.isFrozen(packetSchema)).toBe(true);
  });

  it('exports the schema version constant', () => {
    expect(SCHEMA_VERSION).toBe('baton.packet/v1');
  });
});

describe('validatePacket', () => {
  it('accepts the minimal valid packet fixture', () => {
    const result = validatePacket(validPacket);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.packet.id).toBe('demo-packet-001');
    }
  });

  it('rejects a packet missing required fields', () => {
    const result = validatePacket({ schema_version: 'baton.packet/v1' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown schema_version', () => {
    const broken = { ...validPacket, schema_version: 'baton.packet/v999' };
    const result = validatePacket(broken);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const paths = result.errors.map((e) => e.instancePath);
      expect(paths).toContain('/schema_version');
    }
  });

  it('rejects an id that does not match the kebab pattern', () => {
    const broken = { ...validPacket, id: 'BAD ID with spaces' };
    const result = validatePacket(broken);
    expect(result.valid).toBe(false);
  });

  it('rejects a confidence_score outside [0, 1]', () => {
    const broken = { ...validPacket, confidence_score: 1.5 };
    const result = validatePacket(broken);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown top-level properties', () => {
    const broken = { ...validPacket, surprise: 'nope' };
    const result = validatePacket(broken);
    expect(result.valid).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(validatePacket(null).valid).toBe(false);
    expect(validatePacket('string').valid).toBe(false);
    expect(validatePacket(42).valid).toBe(false);
  });
});

describe('assertPacket', () => {
  it('returns void on a valid packet and narrows the type', () => {
    expect(() => {
      assertPacket(validPacket);
    }).not.toThrow();
  });

  it('throws PacketValidationError on an invalid packet', () => {
    let caught: unknown;
    try {
      assertPacket({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PacketValidationError);
    if (caught instanceof PacketValidationError) {
      expect(caught.errors.length).toBeGreaterThan(0);
    }
  });
});
