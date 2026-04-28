import type { Integration } from '../types.js';
import { detect } from './detect.js';
import { dryRun } from './dry-run.js';
import { install } from './install.js';
import { status } from './status.js';
import { uninstall } from './uninstall.js';

export const claudeCodeIntegration: Integration = {
  id: 'claude-code',
  modes: ['native-hook'] as const,
  preferredMode: 'native-hook',
  detect,
  dryRun,
  install,
  uninstall,
  status,
};

export { detect } from './detect.js';
export { dryRun } from './dry-run.js';
export { install, buildPlan } from './install.js';
export { uninstall } from './uninstall.js';
export { status } from './status.js';
