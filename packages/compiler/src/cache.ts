import type { PacketStore } from '@batonai/store';
import type { CompileWarning, Packet } from './types.js';

export interface PriorPacketResult {
  packet: Packet | null;
  warning?: CompileWarning;
}

/**
 * Look up a previously-stored packet so the assemble step can reuse its
 * narrative fields in `--fast` mode.
 *
 * Distinguishes two outcomes:
 * - `{ packet: null }` — no prior exists (the normal first-compile case).
 * - `{ packet: null, warning }` — store I/O failed (corrupt index, bad
 *   permissions, malformed JSON). The pipeline continues with no prior
 *   but surfaces the warning so the caller knows the cache is degraded.
 */
export async function getPriorPacket(
  store: PacketStore,
  packetId: string,
): Promise<PriorPacketResult> {
  let exists: boolean;
  try {
    exists = store.has(packetId);
  } catch (err) {
    return {
      packet: null,
      warning: {
        code: 'COMPILE_STORE_READ_FAILED',
        severity: 'error',
        message: `Failed to query packet store for '${packetId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    };
  }
  if (!exists) return { packet: null };
  try {
    const packet = store.read(packetId);
    return { packet };
  } catch (err) {
    return {
      packet: null,
      warning: {
        code: 'COMPILE_STORE_READ_FAILED',
        severity: 'error',
        message: `Failed to read prior packet '${packetId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    };
  }
}
