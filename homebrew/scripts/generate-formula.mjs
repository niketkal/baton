#!/usr/bin/env node
/**
 * Release-time generator for the Baton Homebrew formula.
 *
 * Reads packages/cli/package.json for the version, fetches the published
 * npm tarball at https://registry.npmjs.org/@baton/cli/-/cli-<version>.tgz,
 * computes its sha256, and writes the resolved formula to homebrew/baton.rb.
 *
 * Run order in .github/workflows/release.yml (per the github-setup doc):
 *   1. pnpm changeset publish --provenance     ← npm tarball appears
 *   2. node homebrew/scripts/generate-formula.mjs   ← fills in url + sha256
 *   3. (manual or automated) submit homebrew/baton.rb to the Baton tap
 *
 * Usage:
 *   node homebrew/scripts/generate-formula.mjs            # write file
 *   node homebrew/scripts/generate-formula.mjs --dry-run  # print + don't write
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const TEMPLATE_PATH = resolve(REPO_ROOT, 'homebrew', 'baton.rb');
const CLI_PKG_PATH = resolve(REPO_ROOT, 'packages', 'cli', 'package.json');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pkgRaw = await readFile(CLI_PKG_PATH, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const version = pkg.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('packages/cli/package.json has no version field');
  }
  const tarballUrl = `https://registry.npmjs.org/@baton/cli/-/cli-${version}.tgz`;

  let sha256;
  if (dryRun) {
    // In --dry-run we don't make network calls — useful for CI smoke tests
    // and for verifying this script parses cleanly during scaffolding sessions.
    sha256 = 'DRY_RUN_PLACEHOLDER';
    process.stderr.write(`[dry-run] would fetch ${tarballUrl}\n`);
  } else {
    process.stderr.write(`fetching ${tarballUrl}\n`);
    const res = await fetch(tarballUrl);
    if (!res.ok) {
      throw new Error(`failed to fetch tarball: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    sha256 = createHash('sha256').update(buf).digest('hex');
  }

  const template = await readFile(TEMPLATE_PATH, 'utf8');
  const resolved = template
    .replace(/url ".*"/, `url "${tarballUrl}"`)
    .replace(/sha256 ".*"/, `sha256 "${sha256}"`);

  if (dryRun) {
    process.stdout.write(resolved);
    process.stderr.write('[dry-run] not writing baton.rb\n');
    return;
  }
  await writeFile(TEMPLATE_PATH, resolved, 'utf8');
  process.stderr.write(`wrote ${TEMPLATE_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`generate-formula: ${err.message}\n`);
  process.exit(1);
});
