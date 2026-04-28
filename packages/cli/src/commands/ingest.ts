import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import type { Command } from 'commander';
import { renderHumanResult } from '../output/human.js';
import { renderJsonResult } from '../output/json.js';
import { getLogger } from '../output/logger.js';
import { redactForLog } from '../output/redact.js';

export type IngestKind = 'transcript' | 'log' | 'diff' | 'issue' | 'note' | 'image' | 'test-report';

const ALLOWED_KINDS: IngestKind[] = [
  'transcript',
  'log',
  'diff',
  'issue',
  'note',
  'image',
  'test-report',
];

export interface IngestOptions {
  repo?: string;
  packet?: string;
  json?: boolean;
}

export interface IngestResult {
  artifactId: string;
  path: string;
  kind: IngestKind;
  packet?: string;
}

function readStdinSync(): { bytes: Buffer; suggestedName: string } {
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(64 * 1024);
  try {
    while (true) {
      const n = readSync(0, buf, 0, buf.length, null);
      if (n === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, n)));
    }
  } catch {
    // EAGAIN or closed: stop reading.
  }
  return { bytes: Buffer.concat(chunks), suggestedName: 'stdin.txt' };
}

export async function runIngest(
  kind: IngestKind,
  source: string,
  opts: IngestOptions,
): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();

  if (!ALLOWED_KINDS.includes(kind)) {
    process.stderr.write(
      `unknown artifact kind: ${kind}. Supported: ${ALLOWED_KINDS.join(', ')}\n`,
    );
    return 1;
  }

  const artifactId = randomUUID();
  const artifactsDir = join(repoRoot, '.baton', 'artifacts', artifactId);
  mkdirSync(artifactsDir, { recursive: true });

  let storedName: string;
  let bytes: Buffer;
  if (source === '-') {
    const read = readStdinSync();
    bytes = read.bytes;
    storedName = read.suggestedName;
    writeFileSync(join(artifactsDir, storedName), bytes);
  } else {
    const path = isAbsolute(source) ? source : resolve(source);
    bytes = readFileSync(path);
    storedName = basename(path);
    copyFileSync(path, join(artifactsDir, storedName));
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  const meta = {
    id: artifactId,
    kind,
    file: storedName,
    bytes: bytes.length,
    digest_sha256: digest,
    extension: extname(storedName).slice(1),
    packet: opts.packet ?? null,
    ingested_at: new Date().toISOString(),
  };
  writeFileSync(join(artifactsDir, 'metadata.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const result: IngestResult = {
    artifactId,
    path: join(artifactsDir, storedName),
    kind,
    ...(opts.packet !== undefined ? { packet: opts.packet } : {}),
  };

  if (opts.json === true) {
    process.stdout.write(renderJsonResult(result));
  } else {
    process.stdout.write(
      renderHumanResult({
        ok: true,
        title: `ingested ${kind}`,
        summary: `id=${artifactId}`,
        details: [`stored at ${result.path}`],
      }),
    );
  }

  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'ingest',
      subcommand: kind,
      exit_code: 0,
      duration_ms: Date.now() - start,
      artifact_id: artifactId,
      artifact_type: kind,
      size_bytes: bytes.length,
      digest,
      ...(opts.packet !== undefined ? { packet_id: opts.packet } : {}),
    }),
    'command complete',
  );
  return 0;
}

export function registerIngest(program: Command): void {
  program
    .command('ingest <kind> <source>')
    .description('Register an artifact (transcript|log|diff|issue|note|image|test-report)')
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--packet <id>', 'associate with packet id')
    .option('--json', 'machine-readable output', false)
    .action(async (kind: string, source: string, raw: IngestOptions) => {
      const code = await runIngest(kind as IngestKind, source, raw);
      process.exitCode = code;
    });
}
