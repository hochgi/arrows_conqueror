# P10 — Replay & determinism harness

> Cross-cutting. A match is initial state + ordered moves; pure `apply` makes
> replay exact. This packet is the primary detector of accidental nondeterminism.

**Depends on:** P04, P09. **SPEC:** ADR 0001, AGENTS.md testing posture.

## In scope

- `replay(rules, initial, moves)` with optional `legalMoves` guard (default on).
- Refactor existing movement golden onto the harness.
- Determinism check helper.

## Out of scope

- Persistence / save files (out of MVP).
- Netcode.
- Renderer (P11).

## Decisions

**D1 — Records must be playable.** Default: every move ∈ `legalMoves` at apply time.
**D2 — Do not re-record goldens to hide drift** — find the ordering bug.
