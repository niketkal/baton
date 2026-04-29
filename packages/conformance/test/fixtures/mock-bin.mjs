#!/usr/bin/env node
/**
 * Mock baton CLI used by the conformance runner test. Implements
 * just enough of the surface that `runner.ts` invokes:
 * - `ingest <kind> <source> --repo <root> --packet <id> [--json]`
 * - `compile --packet <id> --mode fast --repo <root> --json`
 * - `lint --packet <id> --strict --repo <root> --json`
 *
 * Behaviour is deterministic per packet id so the test can assert
 * expected vs actual outcomes:
 * - For `secret-leak`: lint exits 2 with a BTN060 finding.
 * - For `partial-context`: lint exits 2 with a BTN010 finding.
 * - Everything else: lint passes.
 *
 * The mock writes a synthetic packet.json to
 * `<root>/.baton/packets/<id>/packet.json` so the runner's
 * fallback path (read from store) works.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function getFlag(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv, name) {
  return argv.indexOf(name) !== -1;
}

const argv = process.argv.slice(2);
const cmd = argv[0];

function packetForId(id) {
  const taskTypeMap = {
    'simple-debugging': 'debugging',
    'feature-implementation': 'implementation',
    'code-review': 'review',
    'partial-context': 'generic',
    'secret-leak': 'generic',
  };
  return {
    schema_version: 'baton.packet/v1',
    id,
    title: `synthetic ${id}`,
    status: 'draft',
    validation_level: 'draft',
    task_type: taskTypeMap[id] ?? 'generic',
    objective: 'synthetic objective',
    current_state: 'synthetic state',
    next_action: 'synthetic next action',
    open_questions: [],
    confidence_score: 0.5,
    repo_context: { root: '.', vcs: 'git' },
    context_items: [],
    constraints: [],
    attempts: [],
    acceptance_criteria: [],
    warnings: [],
    provenance_links: [],
    source_artifacts: [],
    created_at: '2026-04-26T00:00:00Z',
    updated_at: '2026-04-26T00:00:00Z',
  };
}

if (cmd === 'ingest') {
  // ingest <kind> <source> --repo <root> --packet <id> [--json]
  const repo = getFlag(argv, '--repo') ?? process.cwd();
  const packetId = getFlag(argv, '--packet') ?? 'unknown';
  const kind = argv[1];
  const source = argv[2];
  const dir = join(
    repo,
    '.baton',
    'artifacts',
    `${packetId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  const stored = source ? (source.split(/[\\/]/).pop() ?? 'in.txt') : 'in.txt';
  if (source && existsSync(source)) {
    writeFileSync(join(dir, stored), readFileSync(source));
  }
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify({ id: packetId, kind, file: stored, packet: packetId }, null, 2),
  );
  if (hasFlag(argv, '--json')) {
    process.stdout.write(
      `${JSON.stringify({ artifactId: packetId, kind, path: join(dir, stored) })}\n`,
    );
  }
  process.exit(0);
}

if (cmd === 'compile') {
  const repo = getFlag(argv, '--repo') ?? process.cwd();
  const packetId = getFlag(argv, '--packet') ?? 'unknown';
  const dir = join(repo, '.baton', 'packets', packetId);
  mkdirSync(dir, { recursive: true });
  const packet = packetForId(packetId);
  writeFileSync(join(dir, 'packet.json'), JSON.stringify(packet, null, 2));
  if (hasFlag(argv, '--json')) {
    process.stdout.write(`${JSON.stringify({ packet, warnings: [], valid: true })}\n`);
  }
  process.exit(0);
}

if (cmd === 'lint') {
  const repo = getFlag(argv, '--repo') ?? process.cwd();
  const packetId = getFlag(argv, '--packet') ?? 'unknown';
  // Detect secret in any artifact for the secret-leak case.
  let leaksSecret = false;
  const missingContext = packetId === 'partial-context';
  try {
    const artifactsRoot = join(repo, '.baton', 'artifacts');
    if (existsSync(artifactsRoot)) {
      for (const name of readdirSync(artifactsRoot)) {
        const sub = join(artifactsRoot, name);
        for (const f of readdirSync(sub)) {
          if (f === 'metadata.json') continue;
          const text = readFileSync(join(sub, f), 'utf8');
          if (/sk-[a-zA-Z0-9-]{16,}/.test(text)) leaksSecret = true;
        }
      }
    }
  } catch {
    // ignore
  }
  const errors = [];
  if (leaksSecret) {
    errors.push({ code: 'BTN060', severity: 'critical', message: 'apparent secret in artifact' });
  }
  if (missingContext) {
    errors.push({
      code: 'BTN010',
      severity: 'error',
      message: 'repo_context required for code tasks',
    });
  }
  const status = errors.length === 0 ? 'passed' : 'failed';
  if (hasFlag(argv, '--json')) {
    process.stdout.write(
      `${JSON.stringify({ packetId, status, errors, warnings: [], summary: { blockingCount: errors.length, warningCount: 0 } })}\n`,
    );
  }
  process.exit(status === 'passed' ? 0 : 2);
}

process.stderr.write(`mock-bin: unknown command ${cmd}\n`);
process.exit(1);
