#!/usr/bin/env node
/**
 * Test fixture: a "baton" CLI mock whose `lint` always exits 0.
 * Used by runner.test.ts to verify that the runner correctly fails
 * a case which expects lint to fail (e.g. secret-leak).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}
function has(name) {
  return argv.indexOf(name) !== -1;
}

if (cmd === 'ingest') {
  const repo = flag('--repo');
  const id = flag('--packet') ?? 'x';
  const dir = join(repo, '.baton', 'artifacts', `${id}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify({ id, kind: argv[1], file: 'x', packet: id }),
  );
  if (has('--json')) process.stdout.write(`${JSON.stringify({ artifactId: id })}\n`);
  process.exit(0);
}
if (cmd === 'compile') {
  const repo = flag('--repo');
  const id = flag('--packet') ?? 'x';
  const dir = join(repo, '.baton', 'packets', id);
  mkdirSync(dir, { recursive: true });
  const p = { schema_version: 'baton.packet/v1', id, title: 't', task_type: 'generic' };
  writeFileSync(join(dir, 'packet.json'), JSON.stringify(p));
  if (has('--json'))
    process.stdout.write(`${JSON.stringify({ packet: p, warnings: [], valid: true })}\n`);
  process.exit(0);
}
if (cmd === 'lint') {
  if (has('--json'))
    process.stdout.write(
      `${JSON.stringify({
        packetId: flag('--packet'),
        status: 'passed',
        errors: [],
        warnings: [],
        summary: { blockingCount: 0, warningCount: 0 },
      })}\n`,
    );
  process.exit(0);
}
process.exit(1);
