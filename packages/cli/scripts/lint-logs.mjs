#!/usr/bin/env node
// CI grep check enforcing CLAUDE.md invariant 3 / tech spec §12.2.1:
// every logger.{info,warn,error,debug,trace,fatal} call site must wrap
// its first argument in `redactForLog(...)`. Direct strings or raw
// metadata objects are not allowed.
//
// Reads packages/cli/src/**/*.ts (excluding the redact module itself)
// and exits non-zero with line/column references on any violation.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = process.env.BATON_LINT_LOGS_ROOT
  ? resolve(process.env.BATON_LINT_LOGS_ROOT)
  : resolve(__dirname, '..', 'src');

const LOGGER_METHOD_RE = /\blogger\s*\.\s*(info|warn|error|debug|trace|fatal)\s*\(/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(path, out);
    else if (st.isFile() && path.endsWith('.ts')) out.push(path);
  }
  return out;
}

function lineCol(source, index) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

function findArgEnd(source, openIdx) {
  // openIdx points at '('. Walk forward tracking depth + strings.
  let depth = 1;
  let i = openIdx + 1;
  let inString = null;
  let inTemplate = false;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '`') inTemplate = false;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
    } else if (ch === '`') {
      inTemplate = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function checkFile(path) {
  const source = readFileSync(path, 'utf8');
  const violations = [];
  const matches = [...source.matchAll(LOGGER_METHOD_RE)];
  for (const m of matches) {
    const openParen = m.index + m[0].length - 1;
    const close = findArgEnd(source, openParen);
    if (close === -1) {
      const { line, col } = lineCol(source, m.index);
      violations.push({ path, line, col, reason: 'unbalanced parentheses' });
      continue;
    }
    const inner = source.slice(openParen + 1, close).trim();
    // The first argument must syntactically start with `redactForLog(`
    // (or be the result of one — we only allow the wrapper call directly).
    if (!/^redactForLog\s*\(/.test(inner)) {
      const { line, col } = lineCol(source, m.index);
      const preview = inner.slice(0, 60).replace(/\s+/g, ' ');
      violations.push({
        path,
        line,
        col,
        reason: `logger.${m[1]}() first argument is not redactForLog(...)`,
        preview,
      });
    }
  }
  return violations;
}

function main() {
  const files = walk(SRC_ROOT).filter(
    (f) => !f.endsWith('output/redact.ts') && !f.endsWith('output/logger.ts'),
  );
  const allViolations = [];
  for (const f of files) {
    allViolations.push(...checkFile(f));
  }
  if (allViolations.length === 0) {
    process.stdout.write(`lint:logs ok — scanned ${files.length} file(s)\n`);
    process.exit(0);
  }
  for (const v of allViolations) {
    process.stderr.write(
      `${v.path}:${v.line}:${v.col} — ${v.reason}${v.preview ? ` :: ${v.preview}` : ''}\n`,
    );
  }
  process.stderr.write(
    `\nlint:logs failed — ${allViolations.length} violation(s). All logger calls must wrap their first argument in redactForLog(...).\n`,
  );
  process.exit(1);
}

main();
