# docs/spec — executable specs, one directory per feature

Phase-1 output of `/spec-to-ship`. Each directory holds three files:

- `<name>.md` — overview, terms, mermaid, and the `## Invariants` EARS list
- `<name>.core.feature` — happy path
- `<name>.edge-cases.feature` — boundaries, interactions, degeneracies

`write-failing-tests` turns these scenarios into tests, `code-to-green` makes
them pass, and `review-changes` checks the code back against them. **If a
behaviour is not here, it will not be built.**

## Index

| Feature | Packet | SPEC | Scenarios | Deferred | Invariants |
|---|---|---|---|---|---|
| [geometry-port](./geometry-port/geometry-port.md) | P01 | §2, §7 | 32 | — | 16 |
| [chord-test](./chord-test/chord-test.md) | P01 | §2 | 18 | — | 9 |
| [rational](./rational/rational.md) | P01 | §7 | 19 | 2 | 8 |
| [move](./move/move.md) | P01 | §3, §4, §5 | 25 | — | 12 |
| [tiling](./tiling/tiling.md) | P03 | §2 | 34 | — | 12 |
| [layout](./layout/layout.md) | P03 | §2 | 24 | — | 12 |
| [fixtures](./fixtures/fixtures.md) | P02 | §2, §7 | 18 | — | 13 |
| [movement](./movement/movement.md) | P04 | §3, §4, §2 | 30 | — | 16 |
| [trails](./trails/trails.md) | P05 | §5, §6.1a, §6.1 | 34 | — | 19 |
| [crossings](./crossings/crossings.md) | P05 | §2, §6.1a | 24 | — | 11 |

258 scenarios. **94 are in scope for P01**, 2 are tagged `@deferred-P08`,
**58 belong to P03**, **18 to P02**, **30 to P04**, and **58 to P05**. 344 concrete
cases once `Examples` rows are expanded, 128 invariants.

A `@deferred-<packet>` tag means the behaviour is decided and specified here, but
its seam falls in another packet — an accumulator that knows its owner is not a
`Rational`. It is not a `@wip`. **A scenario with neither a test nor this tag is a
defect**, and eleven of them once were.

> **These counts moved when SPEC §11 item 4 made the board unbounded.**
> `geometry-port` grew (windows need their own contract), `tiling` grew despite
> *losing* the whole seam and board-floor surface (unboundedness needs asserting,
> and so does the symmetry that setup may use), and one `@deferred-P02` scenario —
> *a board too small to be conformant is rejected* — was deleted outright, because
> there is no board size to be below.

## Reading order for P01

`geometry-port` and `rational` are shape and arithmetic — they assert facts, and
an implementation either has them or does not.

**`chord-test` is different and deserves more attention than its size suggests.**
It is the only file in P01 that encodes a *rule*, it is the subtlest logic in the
game, and it is the one place where a wrong-but-plausible implementation would
pass a casual reading. It is also totally specifiable — 225 ordered pairs over
the 15 chords six slots admit, of which a layout realizes 81 — so there is no
excuse for leaving any of it to inference.

`move` is a DTO, and its job is mostly to make illegal shapes unrepresentable.
Its edge cases carry more weight than its core.

## Reading order for P03

`tiling` is the first real `GeometryPort`, so most of what it must satisfy is
already written — the 37-assertion conformance suite. Its own scenarios cover what
the suite cannot: unboundedness in every direction, window degeneracies,
determinism, and which lattice symmetries setup is allowed to use.

**`layout` looks cosmetic and is not.** SPEC §2's out-directions have to sum to
zero *and* sit 120° apart; a set doing only the first is an isomorphic graph that
passes every conformance assertion and renders skewed. Layout holds the only
executable check on that, and on the up/down twist parity — a mistake there still
tiles the plane perfectly and just quietly deletes the arrowhead. Both failure
modes are invisible to every other test in the repo.

## Reading order for P02

`fixtures` is the *second* real `GeometryPort`, so like `tiling` it inherits the
whole 37-assertion conformance suite unedited — passing it against a board built a
different way is the packet's main claim. Its own scenarios cover what is peculiar
to *authoring* a board: construction-time validation that names the offending
point or arrow, vertices derived from cycles rather than authored, and finite-board
windows.

**The one scenario to read first is `Every straight-ahead ray closes on itself`.**
It is the finite-board limit made executable, and it is the reason `fixtures`
carries no closure, fill or encirclement scenarios — those are structurally
impossible on any finite board (SPEC §11 item 4) and test against the tiling
instead. A reader who misses it will think the packet forgot half the port.

## Reading order for P04

`movement` is the first rules behaviour. Read it after `move` (the DTO) and
`fixtures` (the board the scenarios run on). Trails, combat and territory are
deliberately absent — a step relocates heads on an occupancy map, and an
enemy-occupied destination is refused rather than resolved.

**The merge-cost scenarios are the ones to read first.** Minority / equal /
majority arrivals, and the "later small arrival cannot un-bar" case, are where a
plausible-but-wrong implementation most often invents a rule. The conveyor
scenario is the same arithmetic in costume.

The subtlest of them is not a scenario at all but the invariant that the override
**rides with the heads** (SPEC §11 item 33). Its only witness is a property test,
because the rejected reading — the override as a fact about the arrow the merge
happened on — passes every scenario here and lets one ordinary step refund the
whole merge price.

## Reading order for P05

Two directories, because trail bookkeeping and the crossing predicate fail in
different ways. Read `trails` first — `crossings` asks questions of the state
`trails` defines.

**In `trails`, the rule to read first is the branch-anchor mandate**, and the
overview's table of three readings is the reason. §5 states it in one sentence
that is grammatically ambiguous about *when* it bites, and two of the three
readings freeze the board the first time damage legally empties a fork. The
scenario that tells them apart — *an already-unanchored branch does not freeze the
board* — is in the edge cases and is the most load-bearing line in the packet.

That sentence turned out to be ambiguous about *how much* it charges as well, which
P05's review caught and **§11 item 35** settled: **one head per branch, not one per
strand**, so a sibling arm carries the toll for a whole junction. No scenario
discriminates the two readings — each puts heads on at most one strand per side —
so the three properties in `trails.invariants` are the only thing holding the
decision. Read them next.

**In `crossings`, read the `i × o` table first.** A point presents one chord per
(in, out) pair and an implementation that tests only the first passes every spine
and quietly fails every knot. The two predicates are the other trap: `chordsCross`
for an enemy trail, `chordsInterleave` for your own, differing exactly by
coincidence — and §7 needs the narrow one.

Neither directory resolves anything. A crossing is *reported*; what it destroys is
P06 and what it claims is P05b.

## What is deliberately not here

A `Then` step that asserts a behaviour its packet does not own has leaked.

- **P01** owned shapes, not legality — whether an exit is really an out-arrow, or
  a crossing is won, lived in later packets.
- **P04** owns movement legality, not combat or territory — an enemy-occupied
  destination is refused here; resolving it is P06. Closure, fill, spawners and
  victory are later still.
- **P05** owns what a trail *is* and whether a traversal crossed it, not what
  either causes. A step landing on your own territory marks nothing and claims
  nothing (P05b owns closure); a crossing is a verdict with no consequence (P06
  owns evaporation and combat); no scenario reads a vertex (§11 item 34 — a
  special is owned in thirds by its bordering arrows, so ownership is a reading of
  tile ownership and this packet owns no tiles).
