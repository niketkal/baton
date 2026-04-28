import type { InstallOpts, InstallPlan } from '../types.js';
import { buildPlan } from './install.js';

/**
 * Compute what `install()` would do without writing anything. Shares
 * `buildPlan()` with the install path so the two stay in sync.
 */
export async function dryRun(opts: InstallOpts): Promise<InstallPlan> {
  const { plan } = await buildPlan(opts);
  return plan;
}
