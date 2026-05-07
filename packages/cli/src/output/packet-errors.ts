/**
 * Classify errors thrown by `PacketStore.read()` into operator-mistake
 * vs data-corruption shapes.
 *
 * `store.read()` can throw for four reasons:
 *
 *   1. Invalid packet id format — `Error('Invalid packet id: ...')`
 *      (operator typo)
 *   2. Missing packet — `readFileSync` throws an `ENOENT` (operator
 *      typed an id that doesn't exist)
 *   3. Malformed JSON — `JSON.parse` throws `SyntaxError`
 *      (canonical state is corrupted; not a user mistake)
 *   4. Schema assertion failure — `assertPacket` throws
 *      `PacketValidationError` (canonical state is corrupted)
 *
 * Cases 1 and 2 should produce a clean exit-1 message; cases 3 and 4
 * should escape to `main()` and map to exit-3 so the user knows their
 * on-disk packet has decayed and isn't a typo problem.
 */

type ErrnoLike = { code?: string; message?: string };

export function isOperatorPacketError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as ErrnoLike;
  if (e.code === 'ENOENT') return true;
  // Both messages used by `assertValidPacketId` (`Invalid packet id:`)
  // and the lower-case form thrown by the path-traversal guard
  // (`invalid packet id:`) — match either.
  if (typeof e.message === 'string' && /^invalid packet id\b/i.test(e.message)) return true;
  return false;
}
