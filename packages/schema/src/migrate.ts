import { MIGRATIONS, type Migration } from './migrations/index.js';

export { MIGRATIONS, type Migration } from './migrations/index.js';

export class NoMigrationPathError extends Error {
  readonly from: string;
  readonly to: string;
  constructor(from: string, to: string) {
    super(`No migration path from ${from} to ${to}`);
    this.name = 'NoMigrationPathError';
    this.from = from;
    this.to = to;
  }
}

export interface MigrateResult {
  /** The migrated packet object. Reference-equal to the input iff no migration ran. */
  migrated: object;
  /** Non-fatal warnings collected as the chain ran. */
  warnings: string[];
}

/**
 * Apply the chain of registered migrations from `fromVersion` to
 * `toVersion`. The chain is resolved by walking forward through
 * MIGRATIONS, picking the next migration whose `from` matches the
 * current version. Cycles are bounded by MIGRATIONS.length.
 *
 * If `fromVersion === toVersion` and no migration with that from/to
 * is registered, we return the input unchanged (zero-step is always
 * valid). If the versions differ and no chain exists, throws
 * `NoMigrationPathError`.
 */
export function migrate(packet: object, fromVersion: string, toVersion: string): MigrateResult {
  const warnings: string[] = [];
  if (fromVersion === toVersion) {
    // Zero-step is always valid. If a self-loop migration is registered
    // (like 000-noop), still run it so its side-effect-free up() exercises
    // the rails. Otherwise return the input unchanged.
    const selfLoop = MIGRATIONS.find((m) => m.from === fromVersion && m.to === toVersion);
    if (selfLoop !== undefined) {
      return { migrated: selfLoop.up(packet), warnings };
    }
    return { migrated: packet, warnings };
  }

  const chain = resolveChain(fromVersion, toVersion);
  if (chain === undefined) {
    throw new NoMigrationPathError(fromVersion, toVersion);
  }
  let current: object = packet;
  for (const step of chain) {
    current = step.up(current);
  }
  return { migrated: current, warnings };
}

function resolveChain(from: string, to: string): Migration[] | undefined {
  // Bounded BFS over the registered migrations. Avoids cycles by
  // tracking visited versions. With one migration registered today
  // the search is trivial; the structure is here for v2+ ordering.
  const visited = new Set<string>([from]);
  const queue: Array<{ version: string; path: Migration[] }> = [{ version: from, path: [] }];
  while (queue.length > 0) {
    const head = queue.shift();
    if (head === undefined) break;
    if (head.version === to && head.path.length > 0) {
      return head.path;
    }
    for (const step of MIGRATIONS) {
      if (step.from !== head.version) continue;
      if (step.to === step.from) continue; // skip self-loops in chain search
      if (visited.has(step.to)) continue;
      visited.add(step.to);
      queue.push({ version: step.to, path: [...head.path, step] });
    }
  }
  return undefined;
}
