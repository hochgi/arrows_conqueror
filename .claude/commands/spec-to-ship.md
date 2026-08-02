---
description: Orchestrate the full spec→ship pipeline (spec → tests → code → review) for one work packet, with a human gate between phases.
argument-hint: <path-to-work-packet>
---

# /spec-to-ship

Drive one work packet all the way to a shippable PR through four phases,
delegating each phase to its dedicated subagent via the **Agent** tool and
**stopping at every human gate** for explicit approval.

The packet to work from: `$ARGUMENTS` — a path under
`docs/design/packets/`. If it is missing, list the packet index from
`docs/design/02-work-packets.md`, ask which one, and stop.

Read the `spec-to-ship` skill first for the pipeline and the gates. Do not skip
gates and do not collapse phases.

**Before anything else**, read `AGENTS.md` and the packet's section of `SPEC.md`.
Two conventions govern every phase of this pipeline and are the most common way
a run goes wrong:

- **The core is pure.** No `Date.now()`, no `Math.random()`, no I/O in the rules
  engine, ever.
- **Never invent a rule.** If a behaviour is not in SPEC.md, it is an open
  question. Add it to §11 and surface it — do not choose a sensible default.

**Who runs where.** Human gates and any phase that must consult the user live in
the **main thread**, because a delegated background subagent cannot ask the user
questions or pause for approval.

- **Phase 1 runs interactively in the main thread** — adopt the `spec-author`
  role and follow `write-spec` yourself, using `AskUserQuestion` directly. Do not
  delegate it; consulting the user is its entire job.
- **Phases 2–4 are delegated** via the Agent tool. Collect each result and run
  the human gate yourself before launching the next phase.

**Model selection.** Omit the `model` argument when launching a subagent unless
the human explicitly named one. Agent frontmatter is authoritative.

## Phase 1 — Specify (role: `spec-author`, skill: `write-spec`, main thread)

Adopt the **spec-author** role and follow `write-spec` interactively. Turn the
packet's scope into Gherkin `.feature` files, mermaid diagrams (escape every
literal `;` as `#59;`), and EARS invariants under `docs/spec/<feature>/`.

Because SPEC.md is already a complete design, your questions are **precision
questions, not product questions**: which §11 gaps this packet must close, what
the exact boundary behaviour is, which scenarios are in scope. Where SPEC.md
already decided something, encode it — do not reopen it.

→ **HUMAN GATE 1: approve the spec.** Present the scenario count, the invariants,
the §11 items closed or added, and the file paths. STOP. Loop back for changes.

## Phase 2 — Red (agent: `test-author`, skill: `write-failing-tests`)

Delegate to **test-author** with the approved spec. It writes one failing
component test per scenario, property tests for the EARS invariants (see
`rules-invariants`), and the minimal skeletons so the suite compiles and fails
for the *right* reason.

→ **HUMAN GATE 2: approve the failing tests.** Present scenario coverage and the
red state. STOP.

## Phase 3 — Green (agent: `coder`, skill: `code-to-green`)

Delegate to **coder** with the approved tests. It implements until green, then
refactors within budget. It does not change the spec, weaken a test, or invent a
rule — any of those means kicking back to phase 1.

→ **HUMAN GATE 3: approve the implementation.** Present green state,
lint/typecheck status, and anything it had to kick back. STOP.

## Phase 4 — Review & ship (agent: `reviewer`, skill: `review-changes`)

Delegate to **reviewer**. It checks spec ↔ tests ↔ code coherence, hexagonal
boundaries, core purity, and complexity, then prepares the PR.

→ **HUMAN GATE 4: approve to ship.** Opening or merging a PR is human-gated.
Present the verdict and the proposed PR. STOP.
