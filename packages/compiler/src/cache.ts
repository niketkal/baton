import type { PacketStore } from '@baton/store';
import type { Packet } from './types.js';

/**
 * Look up a previously-stored packet so the assemble step can reuse its
 * narrative fields in `--fast` mode. Returns `null` when the packet does
 * not yet exist.
 */
export async function getPriorPacket(store: PacketStore, packetId: string): Promise<Packet | null> {
  if (!store.has(packetId)) return null;
  return store.read(packetId);
}
