import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PLUGIN_FILES } from '../../src/claude-code/plugin/assets.js';

/**
 * Drive each hook script as a subprocess with a synthetic Claude Code
 * stdin payload. We replace `baton` on PATH with a tiny shim that just
 * records its argv so the test can assert the hook called `ingest`
 * and `compile` correctly. Skipped on Windows where bash isn't standard.
 */
const isWindows = process.platform === 'win32';
const describeIfPosix = isWindows ? describe.skip : describe;

describeIfPosix('claude-code hook scripts', () => {
  let workDir: string;
  let scriptDir: string;
  let logPath: string;
  let shimPath: string;
  let argvLogPath: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'baton-hook-test-'));
    scriptDir = join(workDir, 'hooks');
    mkdirSync(scriptDir, { recursive: true });
    for (const file of PLUGIN_FILES) {
      if (!file.path.startsWith('hooks/')) continue;
      const dest = join(workDir, file.path);
      writeFileSync(dest, file.content, { mode: file.executable ? 0o755 : 0o644 });
    }
    logPath = join(workDir, '.baton-hook.log');
    argvLogPath = join(workDir, '.baton-argv.log');
    // baton shim records every invocation's argv to argvLogPath.
    const shimDir = join(workDir, 'shim-bin');
    mkdirSync(shimDir, { recursive: true });
    shimPath = join(shimDir, 'baton');
    writeFileSync(
      shimPath,
      `#!/usr/bin/env bash
echo "$@" >> "${argvLogPath}"
exit 0
`,
      { mode: 0o755 },
    );
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function runHook(
    scriptName: string,
    payload: Record<string, unknown>,
  ): { stdout: string; stderr: string; code: number | null } {
    const scriptPath = join(workDir, 'hooks', scriptName);
    expect(existsSync(scriptPath)).toBe(true);
    const result = spawnSync('bash', [scriptPath], {
      input: JSON.stringify(payload),
      env: {
        ...process.env,
        PATH: `${join(workDir, 'shim-bin')}:${process.env.PATH ?? ''}`,
        HOME: workDir,
        BATON_REPO_ROOT: workDir,
      },
      encoding: 'utf8',
    });
    return { stdout: result.stdout, stderr: result.stderr, code: result.status };
  }

  for (const script of ['pre-compact.sh', 'stop.sh', 'session-end.sh']) {
    it(`${script}: ingests transcript_path and runs compile`, () => {
      const transcriptPath = join(workDir, 'fake-transcript.jsonl');
      writeFileSync(transcriptPath, '{"type":"user","message":{"role":"user","content":"hi"}}\n');

      const result = runHook(script, {
        session_id: 'test-session',
        transcript_path: transcriptPath,
        cwd: workDir,
        hook_event_name: script.replace('.sh', ''),
      });

      expect(result.code).toBe(0);
      const argv = (() => {
        try {
          return require('node:fs').readFileSync(argvLogPath, 'utf8');
        } catch {
          return '';
        }
      })();
      expect(argv).toContain(`ingest transcript ${transcriptPath} --packet current-task`);
      expect(argv).toContain('compile --fast --packet current-task');
    });

    it(`${script}: skips ingest gracefully when transcript_path is missing`, () => {
      const result = runHook(script, { session_id: 'test', cwd: workDir });
      expect(result.code).toBe(0);
      const argv = (() => {
        try {
          return require('node:fs').readFileSync(argvLogPath, 'utf8');
        } catch {
          return '';
        }
      })();
      expect(argv).not.toContain('ingest');
      expect(argv).toContain('compile --fast --packet current-task');
    });
  }
});
