import type { InstallOpts, InstallPlan } from '../types.js';
import { buildPlan } from './install.js';

export async function dryRun(opts: InstallOpts): Promise<InstallPlan> {
  return buildPlan(opts);
}
