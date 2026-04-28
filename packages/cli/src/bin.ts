#!/usr/bin/env node
import { main } from './index.js';

process.on('uncaughtException', (err) => {
  const debug = (process.env.BATON_LOG_LEVEL ?? '').toLowerCase();
  if (debug === 'debug' || debug === 'debug-unsafe' || debug === 'trace') {
    process.stderr.write(`${err.stack ?? err.message}\n`);
  } else {
    process.stderr.write(`baton: ${err.message}\n`);
  }
  process.exit(3);
});

main(process.argv).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const debug = (process.env.BATON_LOG_LEVEL ?? '').toLowerCase();
    if (debug === 'debug' || debug === 'debug-unsafe' || debug === 'trace') {
      process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    } else {
      process.stderr.write(`baton: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exit(3);
  },
);
