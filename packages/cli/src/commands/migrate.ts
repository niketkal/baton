import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

export interface MigrateCommandOptions {
  packet: string;
  from?: string;
  to?: string;
  json?: boolean;
  repo?: string;
}

interface MigrateSummary {
  packet_id: string;
  from: string;
  to: string;
  changed: boolean;
  history_snapshot: string | null;
  warnings: string[];
}

/**
 * Apply the registered migration chain to a packet on disk.
 *
 * Layout:
 *   .baton/packets/<id>/packet.json                — current packet (rewritten)
 *   .baton/history/packets/<id>/v<n>.json          — pre-migration snapshot
 *
 * The history snapshot uses a monotonically increasing `v<n>.json` name
 * so repeated migrations produce v1.json, v2.json, etc. Files-canonical
 * (per CLAUDE.md invariant 1): we never touch SQLite here.
 */
export async function runMigrate(opts: MigrateCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const packetId = opts.packet;
  const packetPath = join(repoRoot, '.baton', 'packets', packetId, 'packet.json');

  if (!existsSync(packetPath)) {
    process.stderr.write(`baton: packet not found: ${packetId}\n`);
    return 1;
  }

  const raw = readFileSync(packetPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const fromVersion = opts.from ?? (parsed.schema_version as string | undefined);
  if (typeof fromVersion !== 'string' || fromVersion.length === 0) {
    process.stderr.write(
      `baton: cannot determine source schema version for ${packetId} (no --from and packet has no schema_version)\n`,
    );
    return 1;
  }

  // Lazy-load the schema migrate module per Session 8 cold-load discipline.
  const { migrate } = await import('@baton/schema/migrate');
  const { SCHEMA_VERSION } = await import('@baton/schema');
  const toVersion = opts.to ?? SCHEMA_VERSION;

  let result: { migrated: object; warnings: string[] };
  try {
    result = migrate(parsed, fromVersion, toVersion);
  } catch (err) {
    process.stderr.write(`baton: ${(err as Error).message}\n`);
    return 1;
  }

  const afterSerialized = stableStringify(result.migrated);
  // Compare on-disk bytes (raw) against the canonicalised post-migration
  // bytes. If they match, the file is already in the desired form and
  // no rewrite + no history snapshot is needed.
  const changed = raw !== afterSerialized;

  let snapshotPath: string | null = null;
  if (changed) {
    snapshotPath = writeHistorySnapshot(repoRoot, packetId, raw);
    atomicWriteFile(packetPath, afterSerialized);
  }

  const summary: MigrateSummary = {
    packet_id: packetId,
    from: fromVersion,
    to: toVersion,
    changed,
    history_snapshot: snapshotPath,
    warnings: result.warnings,
  };

  if (opts.json === true) {
    const { renderJsonResult } = await import('../output/json.js');
    process.stdout.write(renderJsonResult(summary));
  } else {
    const { renderHumanResult } = await import('../output/human.js');
    process.stdout.write(
      renderHumanResult({
        ok: true,
        title: `migrate ${packetId}: ${fromVersion} -> ${toVersion}`,
        summary: changed
          ? `migrated; snapshot ${snapshotPath ?? '(none)'}`
          : 'no changes (chain was a no-op)',
      }),
    );
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'migrate',
      exit_code: 0,
      duration_ms: Date.now() - start,
      packet_id: packetId,
      shape: { warnings: result.warnings.length },
      meta: { from: fromVersion, to: toVersion, changed },
    }),
    'command complete',
  );
  return 0;
}

export function registerMigrate(program: Command): void {
  program
    .command('migrate')
    .description('Migrate a packet to a newer schema version')
    .requiredOption('--packet <id>', 'packet id')
    .option('--from <version>', "source schema version (default: packet's current schema_version)")
    .option('--to <version>', 'target schema version (default: current SCHEMA_VERSION)')
    .option('--json', 'machine-readable output', false)
    .option('--repo <path>', 'repo root', process.cwd())
    .action(async (raw: MigrateCommandOptions) => {
      const code = await runMigrate(raw);
      process.exitCode = code;
    });
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicWriteFile(path: string, contents: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, path);
}

function writeHistorySnapshot(repoRoot: string, packetId: string, contents: string): string {
  const dir = join(repoRoot, '.baton', 'history', 'packets', packetId);
  mkdirSync(dir, { recursive: true });
  let n = 1;
  try {
    const existing = readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f));
    const numbers = existing
      .map((f) => Number.parseInt(f.slice(1, -5), 10))
      .filter(Number.isFinite);
    if (numbers.length > 0) n = Math.max(...numbers) + 1;
  } catch {
    // no existing dir; n stays 1
  }
  const snapshot = join(dir, `v${n}.json`);
  atomicWriteFile(snapshot, contents);
  return snapshot;
}
