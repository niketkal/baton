import type { Command } from 'commander';

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

/**
 * Stream stdin to `dest` while computing a sha256 digest in flight.
 * Avoids materializing the entire artifact in memory — important for
 * large transcripts (a 100MB log used to allocate 100MB before this).
 */
async function streamStdinTo(dest: string): Promise<{ digest: string; bytes: number }> {
  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { Transform } = await import('node:stream');
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  let bytes = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  await pipeline(process.stdin, tap, createWriteStream(dest));
  return { digest: hash.digest('hex'), bytes };
}

/**
 * Stream a file on disk through a sha256 hash. We can't reuse `copyFileSync`
 * + read-back because we want a single pass. `pipeline(read, hash-tap, write)`
 * mirrors the stdin path.
 */
async function streamFileTo(
  source: string,
  dest: string,
): Promise<{ digest: string; bytes: number }> {
  const { createReadStream, createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { Transform } = await import('node:stream');
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  let bytes = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  await pipeline(createReadStream(source), tap, createWriteStream(dest));
  return { digest: hash.digest('hex'), bytes };
}

export async function runIngest(
  kind: IngestKind,
  source: string,
  opts: IngestOptions,
): Promise<number> {
  const { randomUUID } = await import('node:crypto');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { basename, extname, isAbsolute, join, resolve } = await import('node:path');
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
  let digest: string;
  let bytes: number;
  if (source === '-') {
    storedName = 'stdin.txt';
    const out = await streamStdinTo(join(artifactsDir, storedName));
    digest = out.digest;
    bytes = out.bytes;
  } else {
    // Resolve a relative `source` against `--repo` (`repoRoot`) rather
    // than `process.cwd()`. Multi-repo automation that calls
    // `baton ingest ... --repo /other/repo transcript.md` from a
    // different working directory expects the file to be read from
    // `/other/repo/transcript.md`, not from wherever the CLI was launched.
    const path = isAbsolute(source) ? source : resolve(repoRoot, source);
    storedName = basename(path);
    const out = await streamFileTo(path, join(artifactsDir, storedName));
    digest = out.digest;
    bytes = out.bytes;
  }

  const meta = {
    id: artifactId,
    kind,
    file: storedName,
    bytes,
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

  const { renderHumanResult } = await import('../output/human.js');
  const { renderJsonResult } = await import('../output/json.js');
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

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'ingest',
      subcommand: kind,
      exit_code: 0,
      duration_ms: Date.now() - start,
      artifact_id: artifactId,
      artifact_type: kind,
      size_bytes: bytes,
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
