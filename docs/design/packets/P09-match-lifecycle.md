# P09 — Match lifecycle, setup & victory

> **Phase-1 input.** Scope, decisions, invariants, scenario inventory.
>
> **SPEC coverage:** §8 (setup, two-player reflection), §9 (elimination +
> domination), §7 (radial gradient as **setup data**), §11 items 11, 12, 25, 32.
> **Depends on:** P07, P08. **Unblocks:** P10, P11.

## What this packet is for

A match can start and end. Setup places two players by **reflection**
`(i,j) ↦ (i+j, −j)`, authors the spawner table (bands / forces / *R*), and
victory is **elimination** or **domination** (every spawner share held for *N*
consecutive full rounds — §11 item 32).

P08 already accrues; this packet owns **when a match is won** and **what the
initial board looks like**. Tuning numbers are playtest-first — they must be
chosen here as explicit defaults, not invented in code.

## In scope

- Match setup constructor (initial `GameState` + authored spawners).
- Two-player home placement via the lattice reflection (§8).
- Win checks: no heads left (elimination); all shares held for *N* full rounds
  (domination). Round counter for *N*.
- The setup table: *R*, band radii, force per band, density per band, *N*.

## Out of scope

- Renderer / hot-seat input — P11.
- Replay harness — P10 (consumes ordered moves; may land in parallel after this).
- AI — post-MVP.

## Decisions from SPEC (encode)

**D1 — Two win conditions.** Elimination (opponent has 0 heads) and domination
(every spawner share as territory for *N* consecutive **full rounds**).

**D2 — Reflection placement**, not 180° rotation (grain would reverse).

**D3 — Placement / force are opaque setup data** for the core (P08 already
obeys this).

**D4 — Domination clock** advances on the same full-round boundary as accrual
(P08 / item 41): when `endTurn` returns to `players[0]`.

## Open precision questions (human) — resolved

**Q1 — *N*.** → **5** (configurable).
**Q2 — *R* / force.** → **R = 7**, force **`1/3^r`** for *r* ∈ 1..R (configurable).
**Q3 — Opening.** → homes at hexagon corners `(0, homeOffset)` and its reflection
`(homeOffset, −homeOffset)`, `homeOffset = 5`, each a 3-arrow pinwheel + 3-stack
(§8). (Not opposite corners — that is the grain-reversing 180°.)
**Q4 — Placer.** → full disc of spawners within *R* (every vertex), not a stub.

## Definition of done

- [x] Q1–Q4 answered; numbers in `DEFAULT_MATCH_CONFIG` / `forceAtRadius`.
