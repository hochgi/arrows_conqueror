#!/usr/bin/env node
// Reads a Stryker `mutation.json` report and emits a Markdown summary suitable
// for posting as a PR comment. Designed to fit within GitHub's 65,536-char
// comment limit by listing only survivors (not every killed mutant). For runs
// with hundreds of survivors, the script truncates and links to the HTML artifact.
//
// Inputs:
//   STRYKER_JSON   path to mutation.json (default: reports/mutation/mutation.json)
//
// Output: Markdown to stdout for local triage (`pnpm test:mutation` then this).

const fs = require('node:fs');

const REPORT_PATH = process.env.STRYKER_JSON ?? 'reports/mutation/mutation.json';
const MAX_SURVIVOR_ROWS = 50;
const MAX_COMMENT_BYTES = 60_000;

function die(reason) {
  console.error(`### Stryker mutation testing report\n\n` + `:rotating_light: ${reason}`);
  process.exit(1);
}

if (!fs.existsSync(REPORT_PATH)) {
  die(`No JSON report at \`${REPORT_PATH}\`. Stryker may have crashed before writing output.`);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
} catch (err) {
  die(`Failed to parse \`${REPORT_PATH}\`: ${err.message}`);
}

// Stryker's mutation-testing-elements schema does NOT include a per-mutant
// `original` field. The original code is implicit in `file.source` and the
// mutant's `location` (1-based line + column, half-open at end). We need to
// slice it out ourselves.
function buildLineOffsets(source) {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

function sliceByLocation(source, lineOffsets, location) {
  if (!source || !location?.start || !location?.end) return '';
  const startLine = location.start.line - 1;
  const endLine = location.end.line - 1;
  if (startLine < 0 || endLine >= lineOffsets.length) return '';
  const startOffset = lineOffsets[startLine] + (location.start.column - 1);
  const endOffset = lineOffsets[endLine] + (location.end.column - 1);
  return source.slice(startOffset, endOffset);
}

const files = report.files ?? {};
const allMutants = Object.entries(files).flatMap(([filePath, file]) => {
  const source = file.source ?? '';
  const lineOffsets = buildLineOffsets(source);
  return (file.mutants ?? []).map((m) => ({
    ...m,
    path: filePath,
    original: sliceByLocation(source, lineOffsets, m.location),
  }));
});

const counts = {
  Killed: 0,
  Survived: 0,
  NoCoverage: 0,
  Timeout: 0,
  RuntimeError: 0,
  CompileError: 0,
  Pending: 0,
  Ignored: 0,
};
for (const m of allMutants) {
  counts[m.status] = (counts[m.status] ?? 0) + 1;
}

// Mutation-score formula: detected / (detected + undetected). Excludes errors,
// pending, ignored mutants. Matches Stryker's own reporting.
const totalDetected = counts.Killed + counts.Timeout;
const totalUndetected = counts.Survived + counts.NoCoverage;
const totalCovered = totalDetected + totalUndetected;
const score = totalCovered === 0 ? null : (totalDetected / totalCovered) * 100;

const survivors = allMutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');

// Sanitize a code snippet for a Markdown table cell wrapped in `inline code`.
// Embedded backticks would close the code span early; pipes break the table
// layout; newlines collapse the row. Replace rather than escape because the
// snippet is for human triage, not for round-tripping.
function sanitizeCell(value) {
  return String(value ?? '')
    .replace(/`/g, "'")
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .slice(0, 60);
}

const lines = [];
lines.push('### Stryker mutation testing report');
lines.push('');
lines.push(
  `**Mutation score: ${score === null ? 'n/a' : `${score.toFixed(1)}%`}** — ` +
    `${counts.Killed} killed, ${counts.Survived} survived, ${counts.NoCoverage} no-coverage, ` +
    `${counts.Timeout} timeout, ${counts.RuntimeError + counts.CompileError} errors. ` +
    `${allMutants.length} total.`,
);
lines.push('');

if (survivors.length === 0) {
  lines.push(':white_check_mark: No surviving mutants.');
} else {
  lines.push(`### Surviving mutants (${survivors.length})`);
  lines.push('');
  lines.push('| File | Line | Mutator | Status | Original → Mutated |');
  lines.push('|---|---|---|---|---|');
  const shown = survivors.slice(0, MAX_SURVIVOR_ROWS);
  for (const m of shown) {
    const lineNum = m.location?.start?.line ?? '?';
    const mutator = m.mutatorName ?? '?';
    const orig = sanitizeCell(m.original);
    const repl = sanitizeCell(m.replacement);
    lines.push(`| \`${m.path}\` | ${lineNum} | ${mutator} | ${m.status} | \`${orig}\` → \`${repl}\` |`);
  }
  if (survivors.length > shown.length) {
    lines.push('');
    lines.push(`… and ${survivors.length - shown.length} more. See \`reports/mutation/index.html\`.`);
  }
}

lines.push('');
lines.push('HTML report: `reports/mutation/index.html`.');
lines.push('');
lines.push(
  '<sub>Triage guidance: `mutation-testing` skill. Re-run: `pnpm test:mutation` or `:incremental`. Score is advisory (`break: null`).</sub>',
);

let output = lines.join('\n');

if (output.length > MAX_COMMENT_BYTES) {
  const cap = MAX_COMMENT_BYTES - 200;
  output =
    output.slice(0, cap) +
    '\n\n… (truncated; open reports/mutation/index.html for the full view).';
}

console.log(output);
