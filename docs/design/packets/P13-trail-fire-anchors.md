# P13 — Trail fire & anchors

> **Phase-1 input.** Rewrites how cuts hurt, what may exist as trail, and when a
> territory root is severed. Delivery is `/spec-to-ship` against landed P05–P07.
>
> **SPEC coverage:** §5 (branch tolls — **unchanged** join+split), §6.1
> (evaporation), §6.1a (trail invariants), §6.2 (wipe ⇒ evaporate), §6.3
> (convert strips trail), §7 (territory-root feeders), §11 items 8, 40 and the
> firebreak prose.
> **Depends on:** P05, P06, P07. **Unblocks:** cleaner playtest UX; adapter amber
> merge warning.

## What this packet is for

Playtests showed three problems with one root cause:

1. Evaporation **killed** heads while combat already did — lone sentries felt like
   a tax, and "1 bleeds / 2 walls" was hard to read.
2. **Headless / dormant** trail was legal and looked like a bug (especially enemy
   paint surviving inside a claim).
3. A trail's **territory root** could stay live while every feeder into the departure
   point was painted over by the enemy.

This packet separates the axes: **cuts delete trail; combat deletes heads;**
unanchored trail is not a legal standing state.

## Locked decisions

| # | Decision |
|---|---|
| D1 | Evaporation **does not kill**. A front destroys trail until it would **enter** an occupied arrow; that arrow and its stack survive. Halt per arrow, not at the point ahead. |
| D2 | Branch tolls stay **join + split** (item 35). Crossover still costs both. |
| D3 | **Dormant / headless-without-anchor is illegal.** A trail component must reach clean territory feeders at its root **or** carry at least one of the owner's stacks. |
| D4 | Stack-grade size **1** that would leave dormant trail by stepping away is **frozen** (no legal step) until merge-in or conversion. Size **≥ 2** may leave ≥1 and walk. |
| D5 | Any stack reduced to **0** heads starts evaporation of that owner's trail from that arrow (both ways; tip is one-sided). Attacker and defender both. |
| D6 | **Territory-root cut:** trail leaving point `P0` is safe while ≥1 in-arrow of `P0` that is the owner's **territory** is not in any enemy trail. When a step marks the **last** such feeder, that step **is a cut** at `P0`. |
| D7 | **On convert**, strip the victim's trail from converted stacks (item 40 reversed for trail cleanup). |
| D8 | Multi-head sentry: cut does **not** thin stacks. |

## In scope

- `packages/rules-core` — `cuts.ts`, combat wipe hook in `movement.ts`,
  `encirclement.ts` trail scrub, trail legality / freeze in `trails.ts` /
  `legalMoves`.
- SPEC + `docs/spec/cuts`, `combat`, `encirclement`, `trails` as needed.
- Tests on fixtures + tiling where planar.

## Out of scope

- Combat loss formula, stay-behind, starvation.
- Moving where the split leave-behind sits (still out-arrow after the point).
- Dropping the join toll.
- Large renderer redesign (amber merge warning is adapter-only follow-up).

## Seam notes

- `CutRules` must expose evaporation **from a point** (wipe / root cut), not only
  from a crossing `Move`.
- Order in `applyStep` remains combat → mark → cuts (crossing + root-feeder) →
  closure → convert (with scrub) → elimination.
