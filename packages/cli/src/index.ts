import { Command } from 'commander';
import { registerCommands } from './commands/index.js';

const VERSION = '0.0.0';

/**
 * Build a fresh commander program. Cold-start sensitive: keep import
 * surface narrow. Heavy modules (LLM SDKs, clipboardy, store) are
 * dynamically imported inside command handlers.
 */
function buildProgram(): Command {
  const program = new Command();
  program
    .name('baton')
    .description('CLI-first task-state runtime for AI coding tools')
    .version(VERSION)
    .exitOverride()
    .configureOutput({
      writeOut: (s) => process.stdout.write(s),
      writeErr: (s) => process.stderr.write(s),
    });
  registerCommands(program);
  return program;
}

/**
 * Entry point per tech spec §19. Returns an exit code:
 *   0  success
 *   1  user error (bad args, unknown command, missing file)
 *   2  lint or validation failure
 *   3  internal error
 */
export async function main(argv: string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    const e = err as { code?: string; exitCode?: number; message?: string };
    if (
      e.code === 'commander.helpDisplayed' ||
      e.code === 'commander.version' ||
      e.code === 'commander.help'
    ) {
      return 0;
    }
    if (
      e.code === 'commander.unknownCommand' ||
      e.code === 'commander.unknownOption' ||
      e.code === 'commander.missingArgument' ||
      e.code === 'commander.missingMandatoryOptionValue'
    ) {
      // Commander already wrote a helpful message to stderr.
      return 1;
    }
    if (err instanceof Error) {
      const debug = (process.env.BATON_LOG_LEVEL ?? '').toLowerCase();
      if (debug === 'debug' || debug === 'debug-unsafe' || debug === 'trace') {
        process.stderr.write(`${err.stack ?? err.message}\n`);
      } else {
        process.stderr.write(`baton: ${err.message}\n`);
      }
      return 3;
    }
    return 3;
  }
  const code = process.exitCode;
  if (typeof code === 'number') return code;
  if (typeof code === 'string') {
    const n = Number.parseInt(code, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export { redactForLog } from './output/redact.js';
export type { LoggableMetadata, SafeLoggable } from './output/redact.js';
