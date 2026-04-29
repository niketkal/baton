import { defineConfig } from 'vitest/config';

// Dedicated config for performance-budget tests. Each test spawns the
// built binary and asserts wall-clock against tech spec §11. Run via
// `pnpm --filter @baton/cli test:performance`.
//
// We disable parallel file execution because budget tests contend on
// CPU when run alongside one another (and spawn() startup is the very
// thing being measured). Sequential file execution gives stable numbers.
export default defineConfig({
  test: {
    include: ['test/performance/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
