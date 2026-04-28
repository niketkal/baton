import { isAbsolute, join, normalize, sep } from 'node:path';
import type { LintRule } from '../types.js';

/**
 * BTN012 referenced_files_exist
 *
 * Every `context_item.ref` with `kind = file` or `directory` must exist
 * locally when `repo_context.attached = true`.
 *
 * Implementation note: filesystem access is brokered via `ctx.fs`
 * (LintFsAccessor) which the engine/CLI inject. When `ctx.fs` is
 * absent (e.g. unit tests not exercising filesystem behavior, or
 * stages before Session 13 wires the real accessor) the rule is a
 * no-op so packet authoring remains usable. If `repo_context.root` is
 * a string, relative refs are resolved against it; otherwise refs are
 * treated as already absolute or repo-root-relative paths the
 * accessor can resolve.
 *
 * Defense in depth: although the injected `LintFsAccessor` is expected
 * to be sandboxed by its caller (Session 13), this rule independently
 * rejects obviously unsafe refs before consulting the accessor. An
 * absolute path or a normalized form containing `..` segments is
 * reported as an error finding and the accessor is not invoked. This
 * keeps BTN012's contract independent of the accessor's hardening.
 */
const PATH_KINDS = new Set(['file', 'directory']);

export const BTN012: LintRule = {
  code: 'BTN012',
  severity: 'error',
  failInStrict: true,
  description: 'referenced files/directories must exist when repo is attached',
  check(packet, ctx) {
    if (!ctx.fs) return [];
    const repo = (packet as { repo_context?: { attached?: unknown; root?: unknown } }).repo_context;
    if (repo?.attached !== true) return [];
    const items = (packet as { context_items?: unknown }).context_items;
    if (!Array.isArray(items)) return [];
    const root = typeof repo.root === 'string' ? repo.root : undefined;

    const findings: Array<{ message: string; path?: string }> = [];
    items.forEach((raw, idx) => {
      if (raw === null || typeof raw !== 'object') return;
      const item = raw as { kind?: unknown; ref?: unknown };
      if (typeof item.kind !== 'string' || !PATH_KINDS.has(item.kind)) return;
      if (typeof item.ref !== 'string' || item.ref.length === 0) return;
      const pointer = `/context_items/${idx}/ref`;

      // Defense-in-depth sandboxing: reject absolute paths outright. The
      // injector (Session 13) is the primary line of defense; this guard
      // keeps the rule's contract self-contained.
      if (isAbsolute(item.ref)) {
        findings.push({
          message: 'context_item.ref must be a repo-relative path; absolute paths are not allowed',
          path: pointer,
        });
        return;
      }
      // Reject `..` traversal in the normalized form. We check both
      // the platform-native separator and `/` so a forward-slash ref on
      // Windows is still caught.
      const normalized = normalize(item.ref);
      const segments = normalized.split(sep).flatMap((s) => s.split('/'));
      if (segments.includes('..')) {
        findings.push({
          message: 'context_item.ref must not traverse outside the repo',
          path: pointer,
        });
        return;
      }

      const candidate = root ? join(root, item.ref) : item.ref;
      if (!ctx.fs?.existsSync(candidate)) {
        findings.push({
          message: `context_item[${idx}] references missing ${item.kind}: '${item.ref}'.`,
          path: pointer,
        });
      }
    });
    return findings;
  },
};
