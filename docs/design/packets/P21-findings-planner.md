# P21 — Deterministic findings planner (playtest AI)

> **Status:** in progress (adapter).
> **Layer:** `packages/web` only. **Depends on:** P11, playtest opponent.
> **Does not touch:** `rules-core`, SPEC.md game rules.

## Intent

Replace opaque one-ply weight soup with an explicit, pure **findings** list:

- Each finding is a goal-directed plan stub: kind, cost (grain steps), reward,
  and the **immediate legal `step`** that progresses it.
- Cap by `maxFindings` and BFS `distCap` (node budget).
- Selection is **deterministic argmax** of `score = reward * 100 - cost * 10`,
  with stable move-key tie-break. No `Math.random`.

Heuristic `chooseMove` prefers the top finding when present; otherwise falls
back to the existing evaluate/scoreStepExtras path.

BYOK (follow-on packet slice): lock stacks to findings / replan — not this
commit's required surface.

## Finding kinds (v0)

| Kind | Meaning |
|---|---|
| `claim_share` | Step onto an unclaimed spawner border arrow |
| `approach_spawner` | Step that reduces grain distance to an open share |
| `cut` | Step that shrinks an enemy trail |
| `close` | Tip on trail lands home / territory grows |
| `attack` | Step onto an enemy-occupied arrow |
| `merge_pair` | Portion/leave creates or preserves heads===2 |

## Non-goals

- Minimax / MCTS
- Randomized softmax among findings
- Inventing rules-core behaviour
- LLM tool-calling replan loop (later)

## Invariants (adapter)

- WHILE collecting findings, the planner SHALL NOT call `Date.now`, `Math.random`, or I/O.
- WHEN two findings tie on score, the planner SHALL pick the lesser move key.
- WHEN a legal step exists, `chooseMove` SHALL NOT return `endTurn`.
