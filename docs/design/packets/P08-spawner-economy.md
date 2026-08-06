# P08 — Spawner economy

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop.
>
> **SPEC coverage:** §7 (spawner logic, stacked spawners, blockade, reset-on-capture,
> exact rationals), §11 items 12–15, 18, 25, 34. Placement / band *radii* / *R* /
> default forces are **setup data owned by P09** — this packet consumes authored
> spawners and must not branch on 1/3 vs 1/12 (§7).
> **Depends on:** P07. **Unblocks:** P09.

## What this packet is for

Territory finally pays. Spawners on vertices feed bordering arrows through
**accumulators** (exact rationals, carry remainder, reset on capture). Round-robin
implements thirds. Blockade freezes a share. No randomness.

## In scope

- Grow `GameState` with per-arrow accumulators and per-spawner round-robin phase.
- Accrual, spawn-on-threshold, carry remainder, reset-on-capture, enemy blockade.
- Double-fed arrows (two spawners → one accumulator).
- Tests with **authored** spawner placements (force + vertex); no radial table yet.
- Prefer fixture boards where local; tiling when sharing `borderArrows` of a vertex.

## Out of scope

- **Which vertices carry spawners, band radii, *R*, *N*** — P09's tuning table.
- **Victory / domination** — P09.
- **Renderer** — P11.
- **No vertex enumeration in fill** — ownership is still read off bordering
  territory arrows (item 34). Accrual may ask `borderArrows(vertex)` for a
  known authored spawner list.

## Decisions from SPEC (encode, do not reopen)

**D1 — Accumulator is per arrow, not per player.** Carry remainder past 1; emit a
head and keep the overshoot (item 14). Exact `Rational` only (ADR 0001).

**D2 — Reset on capture.** When an arrow's territory owner changes, its
accumulator becomes 0 (item 13). Unowned arrows accrue nothing useful for a
player (no owner to spawn for).

**D3 — Enemy head on the arrow halts accrual.** Accumulator holds; RR still
advances and that *f* is lost (items 15, 18). Nothing spawns onto that arrow
while the enemy stands there.

**D4 — Round-robin is a fixed cycle** over the three bordering arrows in a
deterministic order (`compareArrows`). Phase is setup/state, not board-dependent
reordering.

**D5 — Force and placement are setup data.** Scenarios author `f` and vertices;
implementation must not special-case 1/3 vs 1/12 (item 12 / §7).

**D6 — Spawn merges** into a friendly stack already on the arrow (ordinary
occupancy). New head: `spent` 0, no override unless merge rules say otherwise —
a fresh spawn onto empty is a 1-stack; onto friendly is a merge (P04 merge cost
may apply — **see Q3**).

## Open precision questions (human) — resolved

**Q1 — Accrual tick.** → **(b) once per full round** — when `endTurn` returns
the active seat to `players[0]`. §11 item 41.

**Q2 — Friendly occupation.** → **(a)** accrue and merge into the stack.

**Q3 — Spawn-merge cost.** → **exempt.** Birth is not a spent move; no
`speedOverride`.

## Invariants (EARS candidates)

- When a spawner's round-robin lands on an owned, non-enemy-occupied arrow, the
  system shall add that spawner's force to the arrow's accumulator exactly.
- When an accumulator reaches or exceeds 1, the system shall emit heads and carry
  the fractional remainder.
- When an arrow's territory owner changes, the system shall reset its accumulator
  to 0.
- When an enemy head occupies a feed arrow, the system shall neither advance that
  arrow's accumulator nor spawn onto it for that tick.
- The system shall use exact rational arithmetic for all accrual (no float).
- The system shall not mutate the input state; equal inputs yield equal outputs.
- The system shall not branch accrual logic on particular force denominators.

## Scenario inventory

- Single spawner RR over 3 turns; ownership filters who receives.
- Carry remainder at spawn; exact 1 lands clean.
- Double-fed 1/9 + 1/12 compound.
- Enemy blockade: RR visits, *f* lost, accumulator held.
- Capture resets accumulator.
- Spawn onto empty; spawn onto friendly (per Q2/Q3).
- Unowned arrow: no player head from that tick.
- Purity / determinism.

## Definition of done

- [ ] `pnpm verify` green.
- [ ] Accumulators exact; eslint purity guard still holds.
- [ ] No P09 placement table invented here.
- [ ] Q1–Q3 answered in SPEC §11 before code.
