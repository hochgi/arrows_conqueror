# P05b — Closure, fill & land bridges

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §7 (closure, the land bridge, the pincer, territory is
> contestable, specials are owned in thirds), §6.1a invariant 3 (points may be
> revisited, and revisiting inverts), §2 (the plane, the chord test).
> **Depends on:** P05. **Unblocks:** P07 (territory & encirclement).

## What this packet is for

P05 gave the board a memory. This is the packet where that memory finally pays:
a trail that comes home stops being a trail and becomes **ground**.

It is the second half of the packet P02's finiteness theorem split. Everything in
P05 was *local* and testable on a 7-point fixture. Nothing here is:

> On any finite board every lattice ray is a **closed loop**, so it crosses a
> contractible curve an even number of times, and even-odd fill reports *outside*
> for every tile of every enclosure (§11 items 4 and 30).

So this is the first packet that **cannot use a fixture board**. It tests against
`geometry-tiling` (P03), and that is a property of the mathematics rather than a
preference: a fixture is finite, and fill needs somewhere to escape to.

§11 item 36 later replaced the parity route with reachability (D4 below), which
leaves the conclusion above standing by a shorter road: *enclosed* means **cannot
reach infinity**, and a finite board has no infinity to fail to reach.

## In scope

- **`packages/contracts`** — the closure result on `RulesPort`, and whatever
  `GameState` needs that P05 did not already land. `territory` already exists.
- **`packages/rules-core`** — what a landing claims (the backward walk), reachability
  fill over the pockets the claim rings, the land bridge, the pincer, and the carve-out
  of enemy territory.
- Tests against the **generated tiling**. Fixture boards keep the P05 suite green
  and host nothing new here.

## Out of scope

- **Conversion.** §7 grants "the enclosed tiles **and everything standing on
  them** — enemy heads, converted (§6.3)". This packet claims the *tiles* and
  leaves the heads exactly where they stand. Conversion is **P07**, and the seam is
  stated in a doc comment so nobody reads a surviving enemy head as a rule.
- **Cuts, evaporation, combat** — P06. Territory is a wall for evaporation, but
  nothing evaporates here.
- **Accumulators.** §7 resets an arrow's accumulator on capture; there are no
  accumulators until **P08**. A closure that changes an arrow's owner is exactly the
  event P08 will hook, and it must not grow a placeholder counter now.
- **Victory.** Domination reads share ownership off `territory` (§9, §11 item 32),
  and that reading is **P09**'s.
- **No new vertex handling anywhere.** §11 item 34 resolved: a closure moves
  *tiles*, and every special's ownership follows from its three bordering arrows in
  thirds. **Fill must not enumerate a single vertex** — if it does, the reading has
  drifted from the tiles it is supposed to be derived from.

## Decisions this packet fixes

**D1 — A closure is a *landing*, and the landing is an ordinary step.**
No new move kind. §7: *depart from your own territory, land back on your own
territory*. The trigger is a step whose destination is already the mover's own
territory — which is exactly the branch of P05's `markStep` that marks nothing and
was left open as a seam (P05 D8). This packet fills that branch and nothing else
about movement changes.

**D2 — What a landing claims is the trail walked *backwards along the grain* from
the closing arrow.**

> From the arrow the step departed, follow trail arrows **against the grain** —
> `Y` precedes `X` when `Y` is in the trail and `target(Y) = origin(X)`. Everything
> reached is claimed. Nothing else is.

This is the decision the packet turns on, and it is what makes §7's two hardest
passages agree without a special case:

| §7 says | the backward walk gives it |
|---|---|
| the pincer's second arm "is then an **open trail** hanging off a fork point that is *now territory*" | the other arm is **downstream** of the fork, so the walk never reaches it. It stays trail, re-rooted on ground that is now territory |
| a cut fragment driven home claims "**the path itself** — a land bridge" | the fragment is entirely **upstream** of where the stack drove home, so the walk takes all of it, dead end included |
| a point is **all-to-all**, every in feeding every out (§6.1a) | at a merge the walk takes **every** trail in-arrow, because the set holds no pairing to prefer one (§11 item 26) |

The three alternatives all fail one of those. *Claim the whole connected stretch*
deletes the pincer, because the second arm becomes territory before it can enclose
anything. *Claim only paths between two anchored ends* deletes salvage, because a
fragment is one long dangle. *Claim dangles that carry no head* satisfies both but
makes what you own depend on where your heads happen to be.

~~**D3 — The same walk decides whether the landing encloses or only strips.**~~
**Withdrawn: there is no enclose-or-strip gate** (§11 item 36, opened by phase 2
against this doc and closed by the human). The walk claims the path either way; a
strip claims only itself because *a strip rings nothing*, and a walk that crossed
itself claims the loop's inside even when it dead-ends. `anchorGrade` is still
deliberately not consulted, for the reason this decision gave: grade is undirected
because §6.1 re-attaches a fragment against the direction it was laid, whereas a
claim has the direction the closing head travelled.

~~**D4 — Fill is even-odd, the ray is straight-ahead, and the crossing test is the
narrow predicate.**~~
**Re-decided: fill is reachability** (§11 item 36). Even-odd needs a closed curve and
a claim is not one — it is bounded by the trail on one side and by the player's
existing territory, a thick *region*, on the other. So the curve was removed rather
than closed: **the wall is the player's ground, and an arrow is enclosed when no walk
from it reaches infinity.** Of D4's three parts, one survives and two are gone:

- ~~**The ray.**~~ There is no probe and so no parity — which also disposes of the
  degenerate-ray problem that `GeometryPort` exposes no coordinate to perturb.
- **The crossing test survives intact.** A walk steps between two arrows sharing a
  point and is **blocked** when their chord `chordsInterleave` with one the player's
  ground presents there — never `chordsCross`. This is what stops a pocket leaking
  through the seam between two arrows that merely touch (§2), and it is the one piece
  of the withdrawn formulation the reachability reading still needs.
- **The two readings part company on nested loops**, and that is why this was a rules
  question: parity calls the core of two separate rings *outside*, reachability calls
  it surrounded. Reachability is the answer.

**D5 — Fill is bounded by the ground that rings, never by the board.**
A closed run of *L* arrows cannot ring more than `O(L²)` (§7), so the sweep takes a
`window()` sized from that run and not from any board extent — there is no board
extent (§11 item 4). The radius must be **derived and justified in one place**,
because a window one step too small is a silently wrong answer rather than a crash.

Corrected by phase 4: the bound belongs to the **ring**, not to the freshly walked
path. Existing territory is part of the wall, so a one-arrow closure can seal a large
holding's mouth — while a *second* holding elsewhere rings nothing and must not be
allowed to size or centre the sweep.

**D6 — A closure claims what it encloses regardless of who held it.**
§7, *territory is contestable*: an enemy can drive a chain into your territory and
close a loop inside it, carving that chunk back out. So fill writes `territory`
over whatever was there — neutral ground, and enemy ground alike. One owner per
arrow was already the shape P05 landed for exactly this reason.

**D7 — Claimed arrows leave the claiming player's trail.**
P05's invariant already says an arrow is never both a player's own territory and
their own trail. So a closure *removes* arrows from the trail set, which is the
first time anything in the engine does. An **enemy's** trail on a carved arrow is
untouched: trails overlap (P05 D1), removing theirs would be evaporation, and
evaporation is P06.

**D8 — Specials are read, never written.**
No vertex is enumerated, before or after. §7: ownership is fractional in thirds and
follows the three bordering arrows, so *"who owns this spawner"* is a query over
`territory` that P08 will ask through `borderArrows`. The minimal closure — three
arrows around one vertex, enclosing zero tiles — takes a whole spawner *because of*
that reading and not because fill found the vertex (§11 items 16 and 34).

**D9 — No new geometry.** `slotOf`, `inArrows`, `outArrows`, `origin`, `target` and
`window` are enough. The straight-ahead probe is built from `slotOf` plus
`outArrows`; if a rule here seems to want a coordinate, it has been mis-specified.

## Invariants (EARS candidates)

- The system shall treat a step onto the mover's own territory as a closure, and
  shall claim the trail arrows reachable from the departed arrow by following the
  trail against the grain.
- The system shall claim no trail arrow that is reachable only by following the
  trail *with* the grain from the departed arrow.
- The system shall claim the walked path whether or not it rings anything, and shall
  claim in addition every arrow the claimed ground then rings.
- At a point where the claimed trail has more than one in-arrow, the system shall
  claim every one of them.
- The system shall report an arrow enclosed when no walk from it over non-territory
  arrows escapes the claimed ground, and shall block a walk only where its chord
  interleaves with one the ground presents at the shared point.
- The system shall give the same verdict however the walk is routed.
- The system shall claim an enclosed arrow whichever player held it, and shall leave
  at most one owner per arrow.
- The system shall remove every claimed arrow from the claiming player's trail, and
  shall leave every other player's trail unchanged.
- The system shall claim nothing when the closure's path is not the mover's trail.
- The system shall enumerate no vertex.
- The system shall not mutate the input state, and shall return equal outputs for
  equal inputs.
- The system shall bound the fill by the extent of the ground that does the ringing and
  shall read no board extent.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Landing and claiming** (≈6) — a loop from territory back to territory claims its
  interior and its path; a path that encloses nothing becomes a one-wide strip; a
  landing on *enemy* territory is not a closure; landing while not trailing claims
  nothing; the claimed arrows leave the trail.
- **The backward walk** (≈6) — a fork's other arm stays trail; that arm's own later
  landing takes the ground between (the pincer, in two steps); a merge claims both
  upstreams; a crossover claims both; a spur upstream of the landing is claimed and
  one downstream is not.
- **Fill** (≈7) — the minimal three-arrow closure; a region with an interior tile; a
  self-crossing claim, whose loop rings its inside (**not** a figure-eight lobe
  inversion — that was even-odd's, §11 item 36); two separate rings around one region;
  a concave shape; a hole ringed inside a pocket.
- **Land bridges** (≈4) — a stack-grade fragment driven home claims the path only; it
  encloses nothing even when the path looks like a loop; a land bridge between two
  holdings; a land bridge that later becomes the departure point of a real closure.
- **Carve-out** (≈4) — a chain driven into enemy territory closing a loop takes the
  chunk; the enemy's trail on a carved arrow survives; an enemy head on a carved arrow
  survives *in this packet* (the P07 seam); the specials reading follows the tiles.
- **Purity and determinism** (≈3) — no mutation; equal inputs, equal outputs; the
  claim does not depend on the order the trail set was built in.

## The question this packet asked, and its answer

**Which arrows does a landing claim?** §7 needed opposite answers in two places —
the pincer's second arm has to stay an open trail or it has nothing left to enclose,
and a cut fragment driven home has to claim "the path itself" even though a fragment
is entirely a dangling arm.

Answered by the human: **follow the grain backwards from the closing arrow.** A fork
is downstream and is not claimed; a fragment is upstream and is. It also settles
enclose-versus-strip from the same traversal (D3), so the packet needs no second
gate. Recorded in §7 rather than in §11, because it is not a gap in the design — it
is the reading that makes both of §7's sentences true at once.

## Definition of done

- [x] `pnpm verify` green.
- [x] `packages/rules-core` still depends only on `@arrows/contracts`. `geometry-tiling`
      is a **dev** dependency, for the suites only; `src/` imports it nowhere.
- [x] The fill suite runs against `geometry-tiling`, and its scenarios are the ones a
      fixture board provably cannot host.
- [x] No conversion, no evaporation, no accumulator, no victory check — those packets'
      scenarios do not start passing "for free".
- [x] No `Date`, `Math.random`, or insertion-order dependence. Fill enumerates a
      window and a trail `Set`; both are ordered answers derived from unordered
      collections, and both sort on `compareArrows`.
- [x] Every scenario in the approved spec has a test; every EARS invariant has an
      assertion.
- [x] **No vertex is enumerated anywhere in fill** (§11 item 34) — asserted through a
      `GeometryPort` that counts `flankVertices` and `borderArrows` calls.
- [x] The window the sweep uses is derived in one place, with the bound stated.
- [x] The P07 seam — enclosed enemy heads are not converted here — is documented where
      a reader will hit it, not only in this doc.

**Phase 4 found two of these unmet and fixed them**, and the second is the reason this
list asks for the bound in writing:

- The sweep took **one** window for the player's whole ground, sized from that set and
  centred on whichever arrow sorted first. A second holding anywhere else therefore
  moved the window off the closure and a plainly ringed pocket reported as escaping —
  a wrong answer, and reachable from any ordinary mid-game state. Now the ground is
  split into the runs of arrows that touch, and each is swept in a window grown until
  it contains that run. The scenario that would have caught it had no test; it has one.
- Three fill.core scenarios had no test at all (the turning-aside walk, the saturated
  pocket, the sweep bound), and two more were authored against shapes that did not
  hold them — the nested hole and the two-ring core were both a single ring plus a
  spur. They now build a sealing band through the port.
