---
name: spec-to-ship
description: >-
  Orchestrator overview of the 4-phase, multi-agent delivery pipeline for
  arrows-conqueror: spec-author → test-author → coder → reviewer, with a human
  gate between every phase. Use as the entry point when starting ANY non-trivial
  work packet, and to understand how the /spec-to-ship command, the four agents,
  and the phase skills fit together.
---

# Spec-to-Ship (multi-agent pipeline)

The delivery workflow for every non-trivial change in arrows-conqueror. It exists
because plausible-looking-but-wrong code is the dominant failure mode in
agent-driven development. The loop kills it by forcing the design conversation
before tests, tests before code, and a coherence check after.

## The particular failure mode this repo has

Most repos risk an agent writing *bad* code. This one risks an agent writing
**good code implementing a rule nobody chose.**

`SPEC.md` is unusually complete — every structural mechanic was argued to a
conclusion, and many of those conclusions are counter-intuitive: forward-only
evaporation, unanchored trails claiming nothing, closure requiring departure
*and* landing, an accumulator that carries a remainder but resets on capture.
Each has a plausible alternative that an agent will reach for naturally, and each
alternative produces a game that compiles, passes hand-written tests, and is
quietly the wrong game.

So the pipeline's gates are not ceremony. **Gate 1 is where a wrong rule costs
one edit; by gate 3 it costs a test rewrite plus a code rewrite plus the
archaeology to notice.**

## The four phases

```
  ┌──────────────────────────────────────────────────────────────────┐
  │ PHASE 1 — SPEC             agent: spec-author                    │
  │   packet → Gherkin .feature + mermaid + EARS invariants          │
  │   skill: write-spec                    (runs in the main thread) │
  └──────────────────────────────┬───────────────────────────────────┘
                    ▟ HUMAN GATE 1: approve the spec ▙
  ┌──────────────────────────────┴───────────────────────────────────┐
  │ PHASE 2 — FAILING TESTS    agent: test-author                    │
  │   one component test per scenario, property tests per invariant, │
  │   replay fixtures, compiling skeletons — all red for the right   │
  │   reason.  skills: write-failing-tests, rules-invariants         │
  └──────────────────────────────┬───────────────────────────────────┘
                 ▟ HUMAN GATE 2: approve the red tests ▙
  ┌──────────────────────────────┴───────────────────────────────────┐
  │ PHASE 3 — CODE TO GREEN    agent: coder                          │
  │   implement behind the ports, refactor within budget, keep the   │
  │   core pure.  skill: code-to-green                               │
  └──────────────────────────────┬───────────────────────────────────┘
               ▟ HUMAN GATE 3: approve the implementation ▙
  ┌──────────────────────────────┴───────────────────────────────────┐
  │ PHASE 4 — REVIEW           agent: reviewer                       │
  │   spec↔tests↔code coherence, purity, boundaries, spec hygiene    │
  │   skill: review-changes                                          │
  └──────────────────────────────┬───────────────────────────────────┘
                 ▟ HUMAN GATE 4: approve & ship ▙
```

## Context is handed off through artifacts, not chat

Each phase's output — the spec files, the red suite, the diff, the review — is
the durable interface to the next phase. Write for an agent that does not share
your context window. In particular: a phase that resolved an ambiguity must
write the resolution into `SPEC.md`, not just into its report.

## Where phase 1 differs from a normal spec phase

Elsewhere, phase 1 discovers what to build. Here `SPEC.md` already says what to
build, in detail, with the reasoning attached. Phase 1's job is narrower:

- **Translate**, don't invent. Turn decided prose into executable scenarios.
- **Interrogate the gaps.** SPEC §11 is an honest list of what is undecided.
  A packet that touches a §11 item must close it *with the human*, and record
  the answer in §11.
- **Ask precision questions, not product questions.** "Does a sentry on the
  fork stem count as the nearest stack for both branches?" — yes. "Should
  cutting cost more?" — no, that was decided.

## The human gates

A phase does not start until a human has approved the previous phase's output.
While waiting, do not jump ahead to keep momentum — gate feedback frequently
moves the design, and the work is thrown away.

## When NOT to run the full pipeline

Typo fixes, doc-only changes, mechanical refactors with no observable delta, and
dependency bumps skip the pipeline — ship a small change with a one-line scope
note. Everything that touches the rules engine runs the pipeline.

## References

- Command: `.claude/commands/spec-to-ship.md`
- Phase skills: `write-spec`, `write-failing-tests`, `code-to-green`, `review-changes`
- Support skills: `rules-invariants`, `engineering-principles`
- Design source of truth: `SPEC.md`
- Packet index: `docs/design/02-work-packets.md`
