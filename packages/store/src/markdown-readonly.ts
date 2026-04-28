import type { BatonPacket } from '@baton/schema';
import { READONLY_CLOSE, READONLY_OPEN, extractReadonlyBlocks } from './markdown.js';

/**
 * Thrown by `assertNoReadonlyEdits` when a `packet.md` has been edited
 * inside one of its `<!-- baton:read-only -->` blocks. Carries the list
 * of offending lines so the caller can echo them back to the user.
 */
export class ReadonlyTamperError extends Error {
  readonly offendingLines: string[];
  constructor(offendingLines: string[]) {
    const preview = offendingLines.slice(0, 5).join('\n  ');
    super(
      `packet.md was edited inside a ${READONLY_OPEN} … ${READONLY_CLOSE} block, ` +
        `which is system-managed.\n\nOffending line${offendingLines.length === 1 ? '' : 's'}:\n  ` +
        `${preview}\n\nIf you really need to override these fields, edit packet.json directly.`,
    );
    this.name = 'ReadonlyTamperError';
    this.offendingLines = offendingLines;
  }
}

/**
 * Compare two `packet.md` strings and throw `ReadonlyTamperError` if any
 * line inside a `<!-- baton:read-only -->` block in `currentMd` is
 * missing or altered in `newMd`, OR if `newMd` contains a read-only
 * block whose content does not appear verbatim in `currentMd`.
 *
 * The third argument (`currentPacket`) is unused today but is kept on
 * the signature so a future call site can validate the read-only block
 * matches the canonical packet (defense in depth against a stale
 * `packet.md` whose read-only block diverged from `packet.json`).
 */
export function assertNoReadonlyEdits(
  currentMd: string,
  newMd: string,
  _currentPacket: BatonPacket,
): void {
  const currentBlocks = extractReadonlyBlocks(currentMd);
  const newBlocks = extractReadonlyBlocks(newMd);

  if (currentBlocks.length === 0 && newBlocks.length === 0) return;

  if (currentBlocks.length !== newBlocks.length) {
    throw new ReadonlyTamperError([
      `read-only block count changed (was ${currentBlocks.length}, now ${newBlocks.length})`,
    ]);
  }

  const offending: string[] = [];
  for (let i = 0; i < currentBlocks.length; i += 1) {
    const before = currentBlocks[i] ?? '';
    const after = newBlocks[i] ?? '';
    if (before === after) continue;
    const beforeLines = before.split(/\r?\n/);
    const afterLines = after.split(/\r?\n/);
    const max = Math.max(beforeLines.length, afterLines.length);
    for (let j = 0; j < max; j += 1) {
      const b = beforeLines[j] ?? '<missing>';
      const a = afterLines[j] ?? '<missing>';
      if (b !== a) offending.push(`block#${i} line ${j + 1}: '${a}' (was '${b}')`);
    }
  }

  if (offending.length > 0) throw new ReadonlyTamperError(offending);
}
