import type { Integration } from '../types.js';
import { detect } from './detect.js';
import { dryRun } from './dry-run.js';
import { install } from './install.js';
import { status } from './status.js';
import { uninstall } from './uninstall.js';

export const codexIntegration: Integration = {
  id: 'codex',
  modes: ['wrapper-launcher', 'paste'] as const,
  preferredMode: 'wrapper-launcher',
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
export { runWrapper, runWrapperOnStream } from './wrapper.js';
export { LIMIT_MARKERS, hasLimitMarker } from './markers.js';
export {
  POSIX_SHIM,
  POSIX_SHIM_FILENAME,
  SHIM_CONTENT,
  SHIM_FILENAME,
  WINDOWS_SHIM,
  WINDOWS_SHIM_FILENAME,
  shimContentForPlatform,
  shimFilenameForPlatform,
  shimSha256,
} from './shim.js';
