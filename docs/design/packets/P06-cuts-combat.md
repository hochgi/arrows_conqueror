# P06 — Cuts, evaporation & contact combat

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §6.1 (cutting a trail, bidirectional evaporation, firebreaks,
> demotion), §6.2 (contact combat — step onto enemy-occupied arrow), §6.1a
> (all-to-all points, headless trail is ordinary), §2 (the chord test —
> `chordsCross` for cuts), §11 items 6, 10, **37**.
> **Depends on:** P05. **Unblocks:** P07 (territory & encirclement). Parallel to
> P05b — neither needs the other.

## What this packet is for

P05 gave the board a memory and a crossing *query*. This packet is where that
query finally costs something: an enemy traversal that crosses your trail **cuts
it**, and stepping onto an enemy-occupied arrow is **contact combat**.

Two ideas, kept apart on purpose:

1. **A cut evaporates a region** — both ways from the cut point, one kill per
   front, halt per *arrow* (§6.1). Territory is a wall; a surviving stack is a
   lesser anchor.
2. **Combat is contact on the destination arrow** (§6.2 / §11 item 37). Threat-
   weighted deterministic losses; equals favour the attacker; no RNG.

They sit on **different axes**: combat is per *destination arrow*; evaporation
halts on the *arrow being entered*. Contested-point gating is withdrawn.

## In scope

- **`packages/contracts`** — grow `RulesPort` / helpers as needed (e.g. combat
  loss query). Prefer growing `apply` rather than a new move kind — a cut is an
  ordinary step that crosses, and an attack is an ordinary step onto an
  enemy-occupied arrow.
- **`packages/rules-core`** — cut detection, bidirectional evaporation, and
  contact-combat resolution replacing P04's refusal of enemy-occupied
  destinations.
- Tests on the **P02 fixture boards**. Cuts and combat are local.

## Out of scope

- **Encirclement / conversion** — P07 (§6.3). Document the seam.
- **Closure / fill** — P05b. A cut mid-closure is an interaction in scope.
- **Accumulators, spawners, victory** — P08 / P09.
- **Blotto / battle slots / secret bids / RNG** — rejected.
- **No new geometry; no vertex enumeration.**

## Decisions this packet fixes

**D1 — A cut is an ordinary step that crosses an enemy trail.**

P05's `crossesTrail` (`chordsCross` — interleave **or** coincide). When true,
`apply` resolves evaporation for that victim as part of the step. Turning aside
is not a cut. Shadowing survives.

**D2 — Evaporation runs both ways, one kill per front.**

Front spends its kill on the first head and halts at the next (§6.1). All-to-all
branch spread; halt per arrow; territory is a wall; destroyed arrows leave the
victim's trail; survivors keep remaining heads.

**D3 — Lone head bleeds; pair is a firebreak. Advice, not a mandate.**

**D4 — Surviving fragments demote to stack grade; not destroyed.**

**D5 — Contact combat replaces the P04 refusal of enemy-occupied destinations.**

~~Contested-point 1:1~~ withdrawn (§11 item 37). The rule is:

> An attack is an ordinary step whose destination arrow is occupied by an enemy
> group. That is the only combat trigger.

Two stacks that merely point into the same point do **not** fight. Skip declines
advancing.

**Stay-behind (§11 item 38).** An attack may not empty `from` — `count ≤ heads − 1`.
A lone head cannot attack. Refuse (and omit from `legalMoves`); do not silently cap.

**Fight to wipe (§11 item 38).** Resolve fully inside one `apply` — loop the
floor rule until *A* or *D* is 0. No mid-fight interrupt. One allowance for the
whole battle. (Retreat-between-rounds deferred.)

Resolve with *A* = step `count`, *D* = defender heads on the destination:

1. *tA* = *D*/(*A*+*D*), *tD* = *A*/(*A*+*D*)
2. *wa*∶*wd* = *tA*² ∶ *tD*
3. Scale so max(atk_loss, def_loss) = *D*, preserving ratio; cap atk ≤ *A*, def ≤ *D*
4. Floor. If both floors are 0 and weights > 0, deal 1 to the larger weight
   (ties → defender)
5. Subtract; if both sides still have heads, repeat from (1)
6. If *D* remaining = 0, attacker **lands** with *A* remaining and **marks** the
   destination. If *A* remaining = 0, attacker does **not** land and does **not**
   mark — stay-behind is the tip on `from`
7. Costs one step of allowance for the whole battle

Equals (*A* = *D*) favour the attacker (3v3 → attacker 2, defender 0). Floor may
yield 0 attacker loss when *A* is moderately larger (5v3) — accepted PoC, no
min-1. Under the current magnitude step one round already wipes a side; the loop
states HoMM intent if the table is retuned.

Arithmetic is **exact** (integer / rational), never float — ADR 0001.

**D6 — Cut and combat on one step: combat first, then cut.**

Destination enemy-occupied **and** traversal crosses that player's trail:
resolve **combat first**, then **cut** against the trail set (trail is
independent of heads). Settled by the human for P06.
**D7 — Cutter's own trail is marked as usual; cutting does not evaporate the cutter.**

**D8 — No randomness.** Ordered removals sort on `compareArrows`.

**D9 — Headless trail after a cut is ordinary.**

## Invariants (EARS candidates)

- When a step's traversal crosses a victim's trail (`chordsCross`), the system
  shall evaporate that trail in both directions from the cut point.
- The system shall give each evaporation front exactly one kill, spent on the
  first head the front meets, and shall halt the front at the next head.
- At a point where the victim's trail has more than one continuation in a
  front's direction, the system shall send a front into every continuation.
- The system shall halt a front per arrow (on the arrow being entered), and
  shall not let a head on another arrow of the same point shield against fire.
- When a backward front reaches the victim's own territory, the system shall
  stop there and destroy nothing further.
- The system shall remove destroyed arrows from the victim's trail and leave
  every other player's trail unchanged by that cut.
- When a cut removes the territory-side region of a trail, the system shall
  leave surviving fragments at stack grade rather than destroying them.
- When a step's destination holds an enemy group, the system shall resolve
  contact combat with the threat-weighted floor rule of §6.2.
- The system shall not treat two stacks that merely point into the same point
  as in combat.
- When *A* = *D*, the system shall leave the attacker with remainder and the
  defender with zero after flooring (equals favour the attacker).
- When combat and a cut both apply on one step, the system shall resolve combat
  before the cut.
- The system shall permit a stack to decline advancing by skipping.
- The system shall not mutate the input state, and shall return equal outputs
  for equal inputs.
- The system shall enumerate no vertex.

## Scenario inventory

- **Bare-trail cuts** (≈5) — spine mid-trail; tip; coincidence landing; turn-aside
  is not a cut; cutter's trail untouched.
- **Firebreaks** (≈6) — lone bleeds; pair halts; second cut rolls on; both
  directions; sequence across turns.
- **All-to-all / forks** (≈4) — cut behind fork; join spreads; crossover; kill
  count matches branches.
- **Territory wall & demotion** (≈4) — stops at territory; deep cut demotes;
  fragment extendable; re-attachment restores grade via `anchorGrade`.
- **Contact combat** (≈10) — step onto enemy is attack; stay-behind / lone cannot
  attack; equal stacks attacker wins with remainder; 5v3 floor may zero attacker
  loss; wipe → land and mark; wiped attacker does not land and does not mark;
  skip declines; pointing into same point alone is not combat; allowance spent
  once for the battle.
- **Interactions** (≈4) — cut mid-closure; combat then cut on same step;
  headless stretch; empty group leaves.
- **Purity** (≈2) — no mutation; equal inputs, equal ordered outputs.

## Definition of done

- [x] `pnpm verify` green.
- [x] `packages/rules-core` still depends only on `@arrows/contracts`.
- [x] P04's "contact is P06" refusal is gone; combat scenarios own that seam.
- [x] Cut suite runs on fixture boards; failures print.
- [x] No conversion, no accumulator, no victory — those packets' scenarios do
      not start passing "for free".
- [x] No `Date`, `Math.random`, or insertion-order dependence; combat arithmetic
      is exact (no float).
- [x] Every scenario in the approved spec has a test; every EARS invariant has
      an assertion.
- [x] No vertex is enumerated.
- [x] The P07 seam — demoted fragments inside enemy ground are not converted
      here — is documented where a reader will hit it.
- [x] §6.2 / §11 items 37–38 coherent with the packet and the suite.

**Review notes (phase 4, updated):** §11 item **38** closed — stay-behind,
fight-to-wipe, mark only on land. Item **39** parks territory combat modifiers.
Both-floors-0 clause remains defensive / unreachable under max=*D* for positive
*A*,*D* (documented in the feature file).