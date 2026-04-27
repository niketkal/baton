import { createRequire } from 'node:module';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { BatonPacket } from './types.js';

const require = createRequire(import.meta.url);
const schema = require('../packet.schema.json') as Record<string, unknown>;
// ajv & ajv-formats ship as CJS with `export =` shapes that don't round-trip cleanly
// through ESM default-import + verbatimModuleSyntax; require() them instead.
const Ajv2020 = require('ajv/dist/2020.js') as new (
  opts?: Record<string, unknown>,
) => {
  compile<T>(schema: unknown): ValidateFunction<T>;
};
const addFormats = require('ajv-formats') as (ajv: unknown) => void;

export const packetSchema: Readonly<Record<string, unknown>> = Object.freeze(schema);
export const SCHEMA_VERSION = 'baton.packet/v1' as const;

export type * from './types.js';
export type { ErrorObject } from 'ajv';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn: ValidateFunction<BatonPacket> = ajv.compile<BatonPacket>(schema);

export type ValidationResult =
  | { valid: true; packet: BatonPacket }
  | { valid: false; errors: ErrorObject[] };

export function validatePacket(input: unknown): ValidationResult {
  if (validateFn(input)) {
    return { valid: true, packet: input as BatonPacket };
  }
  return { valid: false, errors: validateFn.errors ?? [] };
}

export class PacketValidationError extends Error {
  readonly errors: ErrorObject[];
  constructor(errors: ErrorObject[]) {
    super(`Invalid Baton packet: ${errors.length} error(s)`);
    this.name = 'PacketValidationError';
    this.errors = errors;
  }
}

export function assertPacket(input: unknown): asserts input is BatonPacket {
  const result = validatePacket(input);
  if (!result.valid) {
    throw new PacketValidationError(result.errors);
  }
}
