import { defineConfig } from 'vitest/config';

// Default test run excludes the performance suite. Performance tests
// spawn the built binary repeatedly and assert wall-clock budgets from
// tech spec §11; they take ~30-60s end-to-end. Keeping them out of the
// default `pnpm test` keeps the inner-loop fast (~1-2s).
//
// Run perf budgets explicitly via `pnpm --filter @batonai/cli test:performance`,
// which uses a separate config (`vitest.performance.config.ts`).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'test/performance/**'],
  },
});
