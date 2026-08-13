#!/usr/bin/env node
// CRAP (Change Risk Anti-Patterns) score report, per function.
//
//   CRAP(m) = comp(m)^2 * (1 - cov(m))^3 + comp(m)
//
// where comp = cyclomatic complexity and cov = statement coverage in [0, 1].
// The cubed coverage term means a complex function is "rescued" only by being
// thoroughly tested; a complex AND poorly-covered function scores explosively.
// The conventional "crappy" cutoff is 30.
//
// Why this exists: Stryker tells us whether the tests are good; CRAP tells us
// whether the *shape* is good (complex code that tests merely paper over). The
// two are independent — see the `engineering-principles` skill.
//
// Complexity is read straight from the TypeScript AST (one decision point per
// if / ternary / for / while / do / case / catch / && / || / ??, plus a base of
// 1). Nested functions are scored as their own entries, not folded into the
// parent. Coverage comes from Istanbul's `coverage-final.json` (`vitest run
// --coverage`), mapping each function's line span to the statements inside it.
//
// Inputs (env):
//   COVERAGE_JSON   path to coverage-final.json (default coverage/coverage-final.json)
//   CRAP_THRESHOLD  "crappy" cutoff (default 30)
//   CRAP_MAX_ROWS   max table rows (default 40)
//   CRAP_FAIL       when "1", exit 1 if any function exceeds the threshold.
//                   Default unset: advisory only (this repo does not gate on CRAP).
//   CRAP_LOCAL_COMMAND    the local re-run command named in the footer
//                         (default `pnpm crap`)
//
// Output: Markdown to stdout. Not a CI gate.

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const COVERAGE_JSON = process.env.COVERAGE_JSON ?? 'coverage/coverage-final.json';
const LOCAL_COMMAND = process.env.CRAP_LOCAL_COMMAND ?? 'pnpm crap';
const THRESHOLD = Number(process.env.CRAP_THRESHOLD ?? 30);
const MAX_ROWS = Number(process.env.CRAP_MAX_ROWS ?? 40);
const FAIL_OVER = process.env.CRAP_FAIL === '1';
const MAX_COMMENT_BYTES = 60_000;

function die(reason) {
  console.error(`### CRAP score report\n\n` + `:rotating_light: ${reason}`);
  process.exit(1);
}

if (!fs.existsSync(COVERAGE_JSON)) {
  die(
    `No coverage report at \`${COVERAGE_JSON}\`. Run \`vitest run --coverage\` ` +
      `first (the workflow and \`pnpm crap\` both do this before invoking the report).`,
  );
}

let coverage;
try {
  coverage = JSON.parse(fs.readFileSync(COVERAGE_JSON, 'utf8'));
} catch (err) {
  die(`Failed to parse \`${COVERAGE_JSON}\`: ${err.message}`);
}

const DECISION_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

const LOGICAL_OPS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function functionName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const p = node.parent;
  if (p && ts.isVariableDeclaration(p) && p.name && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  if (p && (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name && ts.isIdentifier(p.name)) {
    return p.name.text;
  }
  if (p && ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return '<anonymous>';
}

// Cyclomatic complexity of one function — decision points directly inside it,
// NOT descending into nested functions (those get their own entries).
function complexityOf(fnNode) {
  let count = 1;
  const visit = (node) => {
    if (node !== fnNode && isFunctionLike(node)) return;
    if (DECISION_KINDS.has(node.kind)) count += 1;
    if (ts.isBinaryExpression(node) && LOGICAL_OPS.has(node.operatorToken.kind)) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fnNode, visit);
  return count;
}

function statementCoverageForRange(fileCov, startLine, endLine) {
  const statementMap = fileCov.statementMap ?? {};
  const hits = fileCov.s ?? {};
  let total = 0;
  let covered = 0;
  for (const id of Object.keys(statementMap)) {
    const line = statementMap[id]?.start?.line;
    if (typeof line !== 'number' || line < startLine || line > endLine) continue;
    total += 1;
    if ((hits[id] ?? 0) > 0) covered += 1;
  }
  // A function with no instrumented statements (e.g. a pure type guard whose
  // body is a single expression Istanbul folds elsewhere) is treated as fully
  // covered so it can't generate a false CRAP alarm off a 0/0 division.
  return total === 0 ? 1 : covered / total;
}

function isTestPath(absPath) {
  return /\.(test|component-spec)\.ts$/.test(absPath) || absPath.includes(`${path.sep}test${path.sep}`);
}

const functions = [];
for (const absPath of Object.keys(coverage)) {
  if (!absPath.endsWith('.ts') || absPath.endsWith('.d.ts')) continue;
  if (isTestPath(absPath) || !fs.existsSync(absPath)) continue;

  const source = fs.readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true);
  const fileCov = coverage[absPath];
  const rel = path.relative(process.cwd(), absPath);

  const walk = (node) => {
    if (isFunctionLike(node)) {
      const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const complexity = complexityOf(node);
      const cov = statementCoverageForRange(fileCov, startLine, endLine);
      const crap = complexity * complexity * Math.pow(1 - cov, 3) + complexity;
      functions.push({
        file: rel,
        name: functionName(node),
        startLine,
        lines: endLine - startLine + 1,
        complexity,
        cov,
        crap,
      });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

if (functions.length === 0) {
  die(
    'No functions found in the coverage report. Did `vitest run --coverage` instrument any ' +
      'source files? (Check that tests imported the production code.)',
  );
}

const COMPLEXITY_BUDGET = Number(process.env.CRAP_COMPLEXITY_BUDGET ?? 12);

const byCrap = [...functions].sort((a, b) => b.crap - a.crap);
const byComplexity = [...functions].sort((a, b) => b.complexity - a.complexity);
const overCrap = byCrap.filter((f) => f.crap > THRESHOLD);
const overComplexity = byComplexity.filter((f) => f.complexity > COMPLEXITY_BUDGET);

function fmtRow(f) {
  const name = String(f.name).replace(/\|/g, '\\|').slice(0, 40);
  return (
    `| ${f.crap.toFixed(1)} | ${f.complexity} | ${(f.cov * 100).toFixed(0)}% | ${f.lines} | ` +
    `\`${name}\` | \`${f.file}:${f.startLine}\` |`
  );
}

const lines = [];
lines.push('### CRAP score report');
lines.push('');
lines.push(
  `**${overCrap.length} over CRAP ${THRESHOLD}** · **${overComplexity.length} over complexity ${COMPLEXITY_BUDGET}** ` +
    `(of ${functions.length} functions). CRAP = complexity² · (1 − coverage)³ + complexity.`,
);
lines.push('');
lines.push(
  '> Two independent risks. **CRAP** catches complex code the tests *don’t* cover. ' +
    '**Complexity** catches hard-to-read code even when it’s well covered (CRAP hides ' +
    'these because coverage cancels the term — they’re the maintainability debt).',
);
lines.push('');

lines.push(`#### Over CRAP ${THRESHOLD} — complex *and* under-tested`);
lines.push('');
if (overCrap.length === 0) {
  lines.push(':white_check_mark: none.');
} else {
  lines.push('| CRAP | Cx | Cov | LOC | Function | Location |');
  lines.push('|---:|---:|---:|---:|---|---|');
  for (const f of overCrap.slice(0, MAX_ROWS)) lines.push(fmtRow(f));
  if (overCrap.length > MAX_ROWS) lines.push(`\n… and ${overCrap.length - MAX_ROWS} more.`);
}
lines.push('');

lines.push(`#### Over complexity ${COMPLEXITY_BUDGET} — structural hotspots (extract regardless of coverage)`);
lines.push('');
if (overComplexity.length === 0) {
  lines.push(':white_check_mark: none.');
} else {
  lines.push('| CRAP | Cx | Cov | LOC | Function | Location |');
  lines.push('|---:|---:|---:|---:|---|---|');
  for (const f of overComplexity.slice(0, MAX_ROWS)) lines.push(fmtRow(f));
  if (overComplexity.length > MAX_ROWS) {
    lines.push(`\n… and ${overComplexity.length - MAX_ROWS} more.`);
  }
}
lines.push('');
lines.push(
  '<sub>CRAP is advisory here — it hints boy-scouting on files you already touch. ' +
    'Coverage can hide high complexity (the CRAP term shrinks); the thing we will ' +
    'eventually gate is raw complexity, currently ESLint **warn**. ' +
    `Guidance: \`engineering-principles\` skill. Re-run: \`${LOCAL_COMMAND}\`.</sub>`,
);

let output = lines.join('\n');
if (output.length > MAX_COMMENT_BYTES) {
  output = output.slice(0, MAX_COMMENT_BYTES - 200) + "\n\n… (truncated for GitHub's comment-size limit).";
}
console.log(output);

if (FAIL_OVER && (overCrap.length > 0 || overComplexity.length > 0)) {
  process.exit(1);
}
