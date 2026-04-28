import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', '..', 'scripts', 'lint-logs.mjs');

describe('lint-logs script', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-lint-logs-'));
    mkdirSync(join(dir, 'sub'), { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 on a clean file', () => {
    writeFileSync(
      join(dir, 'a.ts'),
      `import { redactForLog } from './r';\nconst logger: any = {};\nlogger.info(redactForLog({ command: 'x' }), 'msg');\n`,
    );
    const r = spawnSync('node', [SCRIPT], {
      env: { ...process.env, BATON_LINT_LOGS_ROOT: dir },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/lint:logs ok/);
  });

  it('exits non-zero when a logger call passes a raw string', () => {
    writeFileSync(
      join(dir, 'bad.ts'),
      `const logger: any = {};\nlogger.info('raw string here');\n`,
    );
    const r = spawnSync('node', [SCRIPT], {
      env: { ...process.env, BATON_LINT_LOGS_ROOT: dir },
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/redactForLog/);
    expect(r.stderr).toMatch(/bad\.ts/);
  });

  it('exits non-zero when a logger call passes a bare object', () => {
    writeFileSync(
      join(dir, 'bad2.ts'),
      `const logger: any = {};\nlogger.warn({ command: 'x' }, 'msg');\n`,
    );
    const r = spawnSync('node', [SCRIPT], {
      env: { ...process.env, BATON_LINT_LOGS_ROOT: dir },
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/bad2\.ts/);
  });
});
