// "internal" commands are not for end users — they exist only to be invoked
// by Baton's own shims (e.g., baton-codex). Documented as such in --help
// output but not surfaced in user-facing docs.
//
// Cold-start discipline (CLAUDE.md / cold-start regression test): the heavy
// `@batonai/integrations` module is reached only via `await import()` inside the
// action handler. The top-level surface here is `commander` types only.
import type { Command } from 'commander';

export function registerInternal(program: Command): void {
  const internal = program
    .command('internal')
    .description('Internal commands invoked by Baton shims (not for end users)')
    .helpCommand(false);

  internal
    .command('codex-wrap')
    .description('Internal: run the codex wrapper-launcher (used by baton-codex shim)')
    .allowUnknownOption(true) // forward all flags through to codex
    .allowExcessArguments(true)
    .action(async (_options, cmd: Command) => {
      // Lazy-load to keep cold-start of `baton --version` fast.
      const { runWrapper } = await import('@batonai/integrations');
      // commander gives us positional args + (with allowUnknownOption) any
      // unknown flags in cmd.args. That's exactly what we want to forward
      // verbatim to the codex subprocess.
      const codexArgs = cmd.args;
      const exitCode = await runWrapper(codexArgs);
      process.exit(exitCode);
    });
}
