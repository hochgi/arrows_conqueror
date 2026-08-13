# P05 — Trails, sentries & crossings

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §5 (the safety rule, sentries, branching costs an anchor),
> §6.1a (trail invariants, all-to-all points), §2 (trails own points, the chord
> test), §6.1 (the two grades of anchor — the *reachability* half only).
> **Depends on:** P04. **Unblocks:** P05b (closure & fill), P06 (cuts & combat).

## The packet was split, and this is the first half

The work-packet index carried one P05: *trails, crossings & closure*. It is two
packets, and the seam between them was measured rather than chosen.

**P02's finiteness theorem is the seam.** Everything in this half — what a trail
is, what a step marks, what a branch costs, whether a traversal crosses — is
**local**, so it can be tested on a 7-point fixture board where a failure prints.
Closure and fill are not: on any finite board every ray closes, so even-odd
reports *outside* for every cell of every enclosure (SPEC §11 item 4), and they
have to test against the generated tiling. The two halves cannot share a test
harness, and bundling them would have put the game's subtlest rule behind fifty
scenarios of trail bookkeeping, with one human gate at the end covering both.

So:

- **P05 (this packet)** — trail state, the safety rule, branch anchors, chord
  extraction, the crossing predicate, anchor-grade reachability. Fixture boards.
- **P05b** — closure, even-odd fill, land bridges, the pincer. The tiling.

P06 depends on this half and not on P05b: evaporation needs *what a trail is* and
*where it is anchored*, not *what a closure claims*. So the split also lets the
rules chain continue while P05b's one open question is settled.

Numbering stops here rather than renumbering P06–P11, which are unaffected.

## What this packet is for

P04 moved heads over an occupancy map. This one gives the board a memory of where
they have been, and makes that memory the thing the rest of the game reads.

Three ideas, in dependency order:

1. **A trail is a set of arrows** (§6.1a) — no order, no tree, no record of who
   laid it or how often. Every question the rules ask is answerable from that set
   plus the counts standing on it.
2. **A point the trail uses more than once is all-to-all** — `i` in-arrows and
   `o` out-arrows present `i × o` chords, with no pairing between them, because
   the set holds none to recover (§11 item 26).
3. **Branching is the one place the rules require a head** (§5, §11 item 23).
   Everything else a player leaves behind is discretionary.

## In scope

- **`packages/contracts`** — trail and territory in `GameState`. No closure
  method, no fill.
- **`packages/rules-core`** — the safety rule (what a step marks), branch-anchor
  legality, chord extraction at a point, the crossing query, anchor-grade
  reachability.
- Tests on the P02 fixture boards. Every rule here is local; `minimal` (7 points,
  `K₇`) hosts the dense cases and `spacious` (8 points, diameter 2) the ones that
  need a non-adjacent pair.

## Out of scope

- **Closure, even-odd fill, land bridges, the pincer** — P05b (§7). A step that
  lands on your own territory while trailing marks nothing new here and claims
  nothing. See D8: this is a seam, and it leaves the game visibly incomplete
  rather than subtly wrong.
- **Cuts, evaporation, combat** — P06 (§6.1, §6.2). This packet *reports* that a
  traversal crossed a trail and does not resolve it. Nothing evaporates yet.
- **Encirclement and conversion** — P07 (§6.3).
- **Spawners, shares, accrual** — P08 (§7). Vertices are untouched here, and
  nothing should tempt you to touch them: a special is owned in thirds by its
  three bordering arrows (§7), so vertex ownership is a *reading* of tile
  ownership and no rule in this half has any reason to name a vertex.
- **Victory, setup, replay harness, renderer** — P09 / P10 / P11.

## Decisions this packet fixes

**D1 — Trail is a per-player set of arrows; territory is a per-arrow owner.**

```
trails:    Map<PlayerId, ReadonlySet<ArrowId>>
territory: Map<ArrowId, PlayerId>
```

Two different shapes because they answer different questions. Territory has one
owner — carving it transfers it (§7, *territory is contestable*) — while trail
**may overlap**: an enemy stepping onto an arrow your trail holds is a crossing
(§2, *coincide*), which is legal and whose consequences are P06's. The type must
therefore permit an arrow in two players' trail sets. In this packet that state
persists, because nothing evaporates yet; under P06 it is transient.

**D2 — The arrow a head stands on is trail.** Not the arrow behind it. §6.1
halts a front "when it meets a head on the arrow it is entering", and heads stand
on trail; the dropped *every tip carries a head* invariant assumed the same. So a
step marks its **destination**.

**D3 — The safety rule is a test on the destination, not on the journey.**

> A step marks its destination as the mover's trail **unless that destination is
> already the mover's own territory.**

That is §5's *moving inside your own closed territory lays no trail* in one line,
and it covers every combination without a case analysis: territory → territory
marks nothing, territory → neutral starts a trail, trail → neutral extends it,
trail → own territory marks nothing (and, from P05b, closes), and stepping onto
your own trail adds nothing because the trail is a set (§6.1a invariant 2).

Stepping into **enemy** territory marks trail: it is hostile ground, enterable
and exposing (§7).

**D4 — Chord extraction is this packet's job, and it is `i × o`.**
At a point, a player's trail in-arrows and trail out-arrows are read off the set,
and the chords are every (in, out) pair — a spine one, a fork or join two, a
crossover four, a triple crossover nine (§2, §6.1a). No pairing is recovered
because none exists. `chordsCross` and `chordsInterleave` (P01) are called once
per chord.

**D5 — Two crossing queries, because §7 asks a narrower question than §6.1.**
A traversal `(from, exit)` transiting `P = target(from)` draws one chord.

- Against an **enemy** trail: `chordsCross` — interleave **or** coincide (§2).
- Against the mover's **own** trail: `chordsInterleave` only. Coincidence cannot
  invert anything, because re-traversing an arrow already in the set leaves the
  set unchanged (chord-test spec; §2).

Both are **queries**. Neither refuses a move and neither destroys anything.

**D6 — Branch anchors constrain what you may leave, not what may exist.**
§5's rule, read with its own next paragraph and §11 item 23:

> A move that gives a point a second trail in-arrow must leave at least one head
> on the in-arrow it arrived by. A move that gives a point a second trail
> out-arrow must leave at least one head on the out-arrow it departed onto.

Three readings of *when* it bites are possible and only one does not deadlock.
The rule is **local to what the move changes**: a move is illegal if it creates
an unpaid branch, or if it strips the anchor off a branch it is stepping away
from. It is **not** a standing invariant over the whole trail — damage can empty a
branch point (§5, §6.1), that state is legal, and a whole-trail invariant would
make every subsequent move illegal and freeze the game.

Consequences, all of them already stated in §5 and none of them new here:

- A **lone head cannot branch.** It pays its only head and *stops there*, becoming
  the anchor rather than passing through. Too small to pay and unable to act are
  the same state.
- A **crossover costs two** — one before the join, one after the split — so a
  2-stack that crosses its own trail ends with one head on each side and nothing
  continues past it.
- The anchor is a **toll, not a wall**: a front spends its kill on the first head
  and halts at the second (§6.1), so one anchor buys an arrow of delay. A player
  who wants a branch point to stop something leaves two, exactly as anywhere else.

**D7 — Anchor grade is reachability over the trail set, and it lives here.**
§6.1's two grades are consumed by P05b (only territory grade can close) and P06
(evaporation stops at territory), but computing them is trail bookkeeping:

- **Territory grade** — the arrow is connected, through the player's own trail
  arrows, to an arrow of that player's territory.
- **Stack grade** — connected to one of that player's own stacks, but not to
  their territory.
- **Dormant** — neither. A headless wall: it claims nothing, charges nothing, and
  a head walking onto it later puts it back to work (§6.1a, *headless trail is
  ordinary*).

Connectivity is **undirected over the trail set**, not along the grain:
§7's pincer says outright that "enclosure is a property of the curve, not of the
flow along it", and §6.1 re-attaches a fragment by laying a fresh path *to* it.

**D8 — The closure seam is left visibly open, not quietly guessed.**
Landing on your own territory while trailing is a closure (§7) and this packet
does not implement one: the trail stays open and nothing is claimed. That is the
same shape as P04 refusing an enemy-occupied destination — a seam a later packet
fills, stated in a refusal message or a doc comment so nobody reads it as a rule.
**It must not be approximated.** A closure that claims "the path only" looks like
§7's land bridge and would be wrong in every case that encloses anything.

**D9 — No new geometry.** `slotOf`, `inArrows`, `outArrows`, `origin`, `target`
and `window` are enough. If a rule here seems to need a new port method, the rule
has been mis-specified — the chord test was deliberately built on `slotOf` rather
than on an opaque verdict so that this stays true.

## Invariants (EARS candidates)

- The system shall mark a step's destination as the mover's trail unless that
  destination is already the mover's own territory.
- The system shall treat a trail as a set: stepping onto an arrow it already holds
  shall leave the set unchanged.
- The system shall answer every trail question from the arrow set and the standing
  counts alone, and shall record no order, no tree and no laying history.
- The system shall present `i × o` chords at a point where a player's trail has
  `i` trail in-arrows and `o` trail out-arrows, and shall pair no in-arrow with
  any particular out-arrow.
- The system shall report a crossing of an enemy trail when the traversal's chord
  interleaves with or coincides with any of that trail's chords at the point.
- When testing a traversal against the mover's own trail, the system shall report
  a self-crossing only on interleave, never on coincidence.
- The system shall refuse a move that gives a point a second trail in-arrow
  without leaving at least one head on the in-arrow it arrived by.
- The system shall refuse a move that gives a point a second trail out-arrow
  without leaving at least one head on the out-arrow it departed onto.
- The system shall refuse a move that would strip the last head off an anchor the
  move is stepping away from.
- The system shall permit a move that leaves an already-unanchored branch
  unanchored, so that a state damage created does not freeze the game.
- The system shall refuse every branching move by a lone head, and shall leave
  that head standing where it was.
- When a trail arrow is connected through the player's own trail to that player's
  territory, the system shall report territory grade.
- When a trail arrow is connected to one of the player's own stacks but not to
  their territory, the system shall report stack grade.
- The system shall compute connectivity over the trail set without regard to the
  grain.
- The system shall permit one arrow to belong to two players' trails.
- The system shall not mutate the input state of `apply`, and shall return equal
  outputs for equal inputs.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Laying trail** (≈6) — a step off territory starts a trail; a step inside
  territory marks nothing; a step onto own trail adds nothing; a step into enemy
  territory marks trail; the occupied arrow is trail; trail survives the turn
  boundary.
- **Trail is a set** (≈4) — two walks with the same arrows are the same trail; a
  lagging group is not re-tracing (§11 item 22); re-traversal is idempotent; no
  order is observable.
- **Chords at a point** (≈6) — spine 1, fork 2, join 2, crossover 4, triple 9;
  a full crossover leaves no free slot, so no enemy can transit at all.
- **Crossings** (≈7) — interleave crosses; coincide crosses an enemy trail;
  coincide does *not* self-cross; turning aside is not a crossing; shadowing a
  trail point after point never crosses; standing at a trail point is not a
  crossing until an exit is chosen; a traversal is tested against every chord.
- **Branch anchors** (≈8) — join pays before, split pays after, crossover pays
  both; a lone head cannot join, cannot split, cannot cross over; a 2-stack
  crossover ends with one head each side; stepping away from an anchor is refused;
  an already-unpaid branch does not freeze the board.
- **Anchor grade** (≈5) — territory grade through trail; stack grade; dormant
  headless trail; grade is undirected; re-attachment promotes a fragment.
- **Purity** (≈2) — no mutation; equal inputs, equal outputs.

## The gap this packet reported, which was not one

**SPEC §11 item 34, opened while writing this doc and closed the same day: §7's
closure clause was wrong, not silent.**

It granted "the enclosed tiles and everything inside them — enemy heads
(converted) and **special tiles**". §11 item 16 calls the minimal closure — a
lattice triangle, three arrows around one vertex — "the minimum enclosable
territory". Those do not compose: the triangle's three arrows **are** the path, so
it encloses **zero tiles**, and the cheapest closure in the game would get nothing
at its centre.

The answer was already in §7, three subsections down: *"Ownership is fractional,
in thirds. Each of the 3 bordering arrows carries one share"* and *"the vertex
never needs to be enclosed."* The triangle holds all three bordering arrows, so it
holds the whole spawner — and the phrase "special tiles" contradicted §7's own
next subsection, which exists to say a special is not a tile. §7 is corrected;
no rule was added.

**The lesson is worth more than the item.** This spec is dense and
cross-referential by design, and the question was asked against one subsection and
answered by another. Check three sections away before opening a §11 item — the
`code-to-green` skill says exactly this and it applies to phase 1 just as much.

Nothing in this packet reads a vertex, so it was never blocked either way. The one
real seam this half leaves is **D8's**.

## Settled before phase 1

§11 items 21–24, 26 and 27 closed every structural question this half asks;
D1–D9 are representation and seam calls. Two things phase 1 should press on
rather than translate:

- **D6's exact trigger.** The prose admits three readings and only one avoids a
  deadlock. Phase 1's job is to make the surviving one executable, with the
  damage-created-unanchored-branch case as a named scenario, because that is the
  case that distinguishes the readings.
- **D3 against the closure seam.** *trail → own territory marks nothing* is
  correct here and incomplete until P05b. The scenario must say so, or a reader
  will take it for the whole rule.

## Definition of done — met

- [x] `pnpm verify` green. — 583 tests, 19 files; typecheck 0 errors; ESLint clean.
- [x] `packages/rules-core` still depends only on `@conquarrow/contracts`. — `fixtures`
      is a dev dependency, used by tests only.
- [x] No closure, fill, evaporation, conversion or economy behaviour. — nothing
      removes a trail arrow and nothing writes `territory`; the closure seam is the
      one branch of `markStep` that marks nothing, labelled there.
- [x] No `Date`, `Math.random`, or insertion-order dependence. — every list of trail
      arrows is read off the port and *filtered* by the set rather than iterated
      from it, and every trail set `apply` returns is rebuilt sorted on
      `compareArrows`. Rebuilt unconditionally: a state whose destination was already
      marked still gets a canonical set, because iteration order is observable.
- [x] Every scenario has a test; every EARS invariant has an assertion. — verified by
      name against all four `.feature` files. One scenario had none (see findings)
      and now does; the branch-toll invariants were rewritten to their operative
      form, since the creation half of §5's mandate is unfalsifiable — the movers
      always land on the arrow it charges.
- [x] The closure seam is documented where a reader will hit it. — `markStep`'s doc
      comment in `trails.ts`, on the branch that takes it.
- [x] No rule in this packet reads a vertex. — grep clean; the only two mentions of
      the word are the header comment saying so.

## Phase-4 findings, closed

**1 — The implementation priced a fork, and SPEC.md did not (blocker).**
`unpaidBranch` refused a step whenever the vacated arrow was *any* strand of a
branch, individually: per strand. Both readings charge the same to *build* a branch —
forming a crossover costs two heads either way, because the arriving strand pays — so
the difference only surfaces on a later move, when a lagging group or a reinforcement
reaches a strand already paid past and is pinned on arrival. §5's
mandate, §5's *one before, one after* and §6.1's price list all say **one per
branch**; only §5's *each mini-trail needs its own anchored end* says otherwise.
The pairing §5's wording reaches for is unrecoverable from a set (§6.1a, item 26),
so the standing rule is an existence test with a strip guard. Opened as **§11 item
35**, decided **per branch** with the human, and reimplemented: a sibling arm now
carries the toll for the whole junction.

Three properties pin it — a split's sibling arm, a join's sibling in-arrow, and an
enemy stack *not* paying the toll. Confirmed by mutation: reverting to per strand
fails exactly those three and nothing else, which is why two phases missed it.

**2 — The subtlest logic in the game ran on one board.**
`crossings.edge-cases.feature`'s *the verdict does not depend on which board
implementation answers* had no test, and all 26 crossings tests plus both predicate
sweeps used `minimal` only. The scenario asks for two isomorphic boards and there
are none, so the realizable form is the exhaustive sweep over **every point of both
fixtures** — 1,134 verdicts, still milliseconds. An engine that inferred a slot from
an arrow id now fails on the second board.

**3 — One clause was dead code with a wrong rationale.**
The strip guard compared the anchor pool before and after, and the comment claimed
that comparison was what stopped the mandate freezing the board. Neither held: the
vacated arrow is in the pool by construction and `moversFor` has already established
heads stand on it, so `before` was never zero. **Locality** is the real mechanism —
only the branches the departing arrow itself belongs to are examined. Clause removed,
rationale corrected.

**4 — Three test setups did not build their own scenario** (found in phase 3, listed
here for the record): a group standing on the join it was meant to avoid, an arrow
picked only for being outside a branch on a board where everything touches everything,
and a trail chord on two adjacent slots — which interleaves with nothing, so the
turning half of its scenario had nothing to assert.

**Noted, not closed:** the golden replay's snapshot covers `groups`, `activePlayer`
and `players`, so **no replay pins trail or territory**. P10's harness owns that, and
it stays invisible until it drifts.
