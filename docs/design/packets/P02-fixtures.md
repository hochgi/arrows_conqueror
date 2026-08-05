# P02 — Fixture geometry

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §2 (the formal definition, the orientation pattern), §7
> (specials live on vertices), §11 items 4 and 29.
> **Depends on:** P01. **Unblocks:** the fixture half of P04, P06 and P08.

## What this packet is now for

P02 was scheduled to prove the `GeometryPort` conformance suite and to give the
rules packets a small, readable board. **P03 already discharged the first half**
(37 assertions, green, unedited), so what is left is the second half plus the one
claim the repo has made and never tested: *any implementation satisfying the suite
is interchangeable*. One implementation cannot demonstrate that. A second one is
the whole point.

Two measurements below narrow the packet sharply, and the second one narrows it in
a way no amount of authoring can widen.

## Measured, not proposed

### 1 — The smallest conformant board is 7 points, and it is a familiar object

A board with no rim must answer 3-in/3-out **everywhere**, so its undirected
degree is 6 and, with no parallel arrows, it needs at least **7 points**. Seven is
attained, and the attaining board is not arbitrary:

```
0 → 1  2  4        arrow i → j exists iff j − i is a square mod 7
1 → 2  3  5        21 arrows, 14 vertices, girth 3, every point on 6 triangles
2 → 3  4  6        undirected graph = K₇  (the Paley tournament QR(7))
3 → 4  5  0
4 → 5  6  1
5 → 6  0  2
6 → 0  1  3
```

Enumerated by brute force over every quotient of the oriented lattice up to 30
points, checking each of the suite's conditions: **nothing below 7 passes**, and at
7 two sublattices do — `⟨(7,0),(2,1)⟩` and `⟨(7,0),(4,1)⟩` — which turn out to
yield the *same* graph rather than a pair. Up to isomorphism the smallest
conformant board is unique. That it is also a lattice quotient is worth knowing and
is *not* how it should be authored; see D1.

**§11 item 29 says "a floor near 6 points and 18 arrows".** That was a counting
estimate and it is one point short — 6 points cannot carry degree 6. The exact
floor is **7 points, 21 arrows, 14 vertices**. Correcting it is a phase-1 edit.

One consequence to design around rather than discover: the 7-point board is `K₇`,
so **every point is adjacent to every other**. "Two steps away" and "not adjacent"
are inexpressible on it. See D3.

### 2 — No finite board can host even-odd fill. This is not an authoring choice

Fill (SPEC §7) casts a ray and counts trail crossings mod 2. Through this port a
ray is well defined and needs no coordinates: arrive at a point on slot `s`, leave
on slot `s + 3`. In-slots and out-slots alternate (§11 item 29), so `s + 3` is
always an out-slot — and on the real tiling it is exactly "carry straight on":
`IN_SLOT = [3,5,1]` and `OUT_SLOT = [0,2,4]`, so `IN_SLOT[d] + 3 ≡ OUT_SLOT[d]` for
every direction `d` (`packages/geometry-tiling/src/tiling.ts:50`).

That map — arrow to next-arrow-straight-ahead — is a **bijection on arrows**. On a
finite board, every orbit of a bijection is a cycle, so **every ray is a closed
loop and every mod-2 crossing count is zero.** Fill reports *outside* for every
cell of every enclosure.

This is §11 item 4's argument with the torus taken out of it. Item 4 read as being
about wrapping; it was never about wrapping, it was about **finiteness**. The
torus was merely the finite board we happened to be holding.

So:

| Rules packet | Can a fixture host it? |
|---|---|
| P04 movement, stacks, turn loop | **yes** — every rule is local |
| P05 crossings, the chord test, branch anchors | **yes** — slots are local |
| P05 **closure and fill** | **no**, and no fixture can be authored that does |
| P06 cuts, evaporation, combat | **yes** — fronts propagate arrow by arrow |
| P07 **encirclement and conversion** | **no** — it is fill wearing a different hat |
| P08 spawner accrual, shares, blockades | **yes** — adjacency and arithmetic |

That is most of the rules surface, and it is not all of it. **P05's closure half
and P07 test against the tiling**, which is correct there anyway — the plane is
where fill is defined. What they lose is readable failure output, and D4 proposes
paying that back directly instead of pretending a fixture can cover it.

## In scope

- `packages/geometry-fixtures` — a `GeometryPort` over an authored finite digraph,
  plus the boards themselves.
- Construction-time validation: a malformed board description fails loudly where
  it is written, not three packets later as a mysterious rules failure.
- Running `runGeometryPortConformance` against each shipped board, **unchanged**.
  If the suite needs editing, the port leaked something concrete and that is the
  finding — the same discipline P03 was held to.

## Out of scope

- Any rule. This packet answers *what is adjacent to what*.
- Layout. An abstract board has no coordinates (§11 item 29, P03 D3). Nothing here
  returns a position, and the fixture package must not depend on
  `geometry-tiling`.
- Fill, closure, encirclement — see measurement 2. Not deferred: **impossible**.
- Replay fixtures. Same word, unrelated thing (P10).

## Decisions this packet fixes

**D1 — A board is authored as a rotation system, and everything else is derived.**

The authored data is one line per point: its six arrows in cyclic slot order.

```
'0': ['0>1', '6>0', '0>4', '3>0', '0>2', '5>0']    // out, in, out, in, out, in
```

From that, `outArrows`, `inArrows`, `origin`, `target` and `slotOf` all follow.
What must **not** be authored is the vertex lattice: on any conformant board each
arrow lies in exactly two minimal directed cycles, and each cycle has exactly one
arrow-triple in common — so `flankVertices` and `borderArrows` are **derived** by
enumerating minimal cycles and minting one vertex per cycle. Authoring them would
be 14 more lines of chances to be wrong, and it would hide the fact that §7's
vertex lattice is a *consequence* of the arrow graph rather than a second input.

The cyclic order is the part that cannot be derived, and it is the part that
matters: alternation fixes the pattern in/out/in/out/in/out and leaves **which**
in-arrow sits between which out-arrows free. That choice is precisely what the
chord test reads (§2), so a fixture is a graph *plus a rotation system*, and the
rotation system is rules data, not presentation.

**Not** authored as a lattice quotient, even though the 7-point board is one.
Writing `⟨(7,0),(2,1)⟩` would make the fixture a second copy of P03's arithmetic —
the two implementations would share a mistake, and the suite would stop being
evidence of anything.

**D2 — The validator is the deliverable, as much as the boards are.**
Construction rejects, with `ContractViolation`:

- a point whose rotation is not six arrows, or whose in/out do not alternate
- an arrow named in a rotation of a point that is not one of its endpoints
- an arrow, or a point, named in one place and not declared in another
- a self-loop, a parallel pair, or a 2-cycle
- a point not on exactly six minimal cycles, or an arrow not on exactly two — the
  point-side and arrow-side of §2's 3:1:2 incidence, which co-occur on any
  realizable board, so the validator names **every** incidence fault, not the first

Every one of those is a condition the conformance suite would also catch, and
catching it at construction is worth the duplication: the suite says *this board is
not conformant*, the validator says *line 4 of `spacious` has three consecutive
in-slots*. The second is the one that gets fixed in a minute.

**D3 — Two boards, `minimal` and `spacious`.**

- **`minimal`** — the 7-point board above. The conformance witness, and the board
  for anything about a single point's neighbourhood.
- **`spacious`** — the **8-point** board `⟨(4,0),(1,2)⟩`, undirected diameter 2.
  `minimal` is `K₇` — every point adjacent to every other — so on it no test can
  say "not adjacent", "outside the window", or "out of range". `spacious` is the
  smallest conformant board that breaks total adjacency: each point has 6 distinct
  neighbours out of the other 7, so a radius-1 window is a *proper* part of the
  board and the one remaining point is genuinely "outside" it.

  **Not the 14-point diameter-3 board**, though it exists: distance 3 exercises
  nothing a *local* rule cares about — movement, the chord test, cuts and accrual
  all live in a point's immediate neighbourhood — and the whole justification for a
  fixture is that it is small enough to read. Smaller wins on the only axis that
  matters here. If a later packet ever needs a strict-minority window, 14 is on
  record and one line to add.

Boards get names, not sizes. The names in the skills today (`single-pinwheel`,
`two-pinwheels`, `micro-board`) predate §11 item 29 making fixtures conformant — a
single pinwheel is three arrows and cannot give any point three in-arrows — so they
are replaced by `minimal` / `spacious` wherever they appear.

**D4 — The window printer is P05's, not this packet's.**
The justification for P02 has always been *a failure you can read*. Measurement 2
takes fill-dependent packets away from the fixture entirely, so for P05 and P07 the
readable thing has to be produced from the tiling instead: a text rendering of a
window — points, their six slots, what is in each — that a failing test prints.

That belongs in `contracts/testing` beside the conformance suite (both port
implementations want it, neither should own it), but it is **deferred to P05**,
where the first consumer lives. Building it now means guessing the output format
against no failing test; building it in P05 means designing it against real
debugging pain. The risk of deferring — that it gets written ad hoc inside one P05
test file — is answered by naming its home here in advance.

**D5 — Precomputation is allowed here, and that makes ADR 0001 live.**
P03 could be stateless because the board was unbounded, so nothing *could* be
precomputed. A fixture is finite and must enumerate its cycles to derive vertices,
so it has exactly the collection ADR 0001 names as the realistic determinism
failure: iteration order feeding an ordered decision.

Every derived id therefore comes from a **canonical key** — a minimal cycle is
named by its three arrow names, sorted — and every returned sequence is ordered by
that key or by the authored order, never by insertion into a `Map`. This is the
one purity risk in the packet and it is not theoretical; the conformance suite's
own `cycleKey` exists because an earlier version of it triple-counted.

## Invariants (EARS candidates)

The 37 in `runGeometryPortConformance` carry the graph properties. New to P02:

- The system shall reject a board whose in-arrows and out-arrows do not alternate
  at some point.
- The system shall reject a board naming an arrow whose origin or target is not a
  declared point.
- The system shall reject a board in which an arrow appears in the rotation of a
  point that is not one of its endpoints.
- The system shall derive exactly one vertex per minimal directed cycle, and no
  vertex from anything else.
- The system shall name every derived vertex from a canonical key over its arrows,
  so that two boards from the same description mint identical ids.
- The system shall reject an identifier minted against any other board, including
  another fixture.
- The system shall return the whole board as a window at any radius at least the
  board's diameter.
- The system shall order every returned sequence by authored or canonical order,
  never by insertion.
- The system shall expose no board extent, size or diameter on `GeometryPort`.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Construction and validation** (≈9) — one per rejected malformation in D2, each
  naming what was wrong.
- **Derived vertices** (≈4) — one per minimal cycle; exactly two flanks per arrow;
  flank and border mutually inverse; identical ids from two builds.
- **Conformance** (2) — the suite, green and unchanged, once per shipped board.
- **Windows on a finite board** (≈4) — radius 0; radius at the diameter yielding
  everything; radius past the diameter yielding the same thing again; a window
  that *is* the board still satisfying fringe closure.
- **Foreign identifiers** (≈3) — a tiling id, another fixture's id, and a
  well-formed id for a point this board does not have.
- **Interchangeability** (≈2) — a port-level query answered identically in shape by
  fixture and tiling; the fixture satisfying the suite at the same radius.
- **What a fixture cannot do** (≈1) — every ray closes on itself, which is
  measurement 2 as an executable statement rather than a comment. This is the one
  scenario that documents a limit instead of a behaviour, and it is worth having
  because the limit is invisible and expensive.

## Settled before phase 1

The three shape questions this packet opened were low-level (which board, where a
test helper lives, what to call things), so they are decided here rather than
carried into the spec session: **`spacious` is the 8-point board** (D3), the
**window printer is deferred to P05** (D4), and the boards are named
**`minimal` / `spacious`** (D3). None was a rule question.

The one thing in this packet that *touches* SPEC.md is the item 29 floor
correction — 6 points → 7 — and that is a measurement, not a decision, so it is
applied directly rather than debated.

There is **nothing left for phase 1 to ask the human about.** The spec session's
job here is pure translation: turn these decisions and the conformance contract
into Gherkin + EARS. If it uncovers a genuine mechanics gap, that is a §11 kickback
like anywhere else — but the packet does not anticipate one.

## Definition of done — met

- [x] `pnpm verify` green.
- [x] `runGeometryPortConformance` passing against every shipped board, **unedited**
      — 74 assertions, two boards, and the phase-3 commit touches nothing under
      `packages/contracts`.
- [x] A malformed board named in a test fails at construction with a message
      naming the point or arrow at fault.
- [x] No `Date`, `Math.random` or insertion-order dependence; every derived id from
      a canonical key.
- [x] `packages/geometry-fixtures` importing `@arrows/contracts` and nothing else —
      `geometry-tiling` appears only in comments saying it is deliberately absent.
- [x] SPEC §11 item 29's floor corrected to 7 points / 21 arrows, and the reason
      recorded.
- [x] The obsolete fixture names replaced in `.claude/skills/write-failing-tests`,
      `.claude/skills/rules-invariants` and `.claude/agents/test-author.md`.

## How it landed — all four phases complete

Four commits: the phase-1 spec at `docs/spec/fixtures/` (18 scenarios, 13 EARS
invariants) with the §11 item 29 floor correction; the red suite at **106 failed /
1 passed**, every failure an unimplemented stub; the implementation; and the §11
finiteness record. The one test green while the suite was red is *the board exposes
no extent* — structural, satisfied by the port surface alone, and there to fail the
day someone adds a size accessor.

P04 is the first packet to run its rules tests on these boards, and did so without
touching them.

### What phase 3 built

`makeFixture(description): GeometryPort` in `src/fixture.ts`. Three pieces:

1. **The validator**, run at construction. Every fault in D2, each raising
   `ContractViolation` with a message that *names the offending point or arrow* —
   the tests assert on the message, not just the type.
2. **Derived vertices** — enumerate minimal directed 3-cycles, mint one vertex per
   cycle from a **canonical key** (its three arrow names, sorted). This was the
   packet's one real purity risk: the ids must not depend on map-insertion order,
   and a test compares ids across two independent builds specifically to catch it.
3. **`window(centre, radius)`** — BFS ball over both arrow directions, with a fixed
   neighbour order.

Phase 2's stubs threw a plain `Error` on purpose, and phase 3 replaced them rather
than retyping them: the rejection tests assert `toThrow(ContractViolation)`, so a
stub throwing *that* type would have gone falsely green.

### The one finding phase 2 surfaced, already resolved in the spec

Edge case *"a board whose incidence does not close at 3:1:2"* was originally worded
as "a cycle sharing other than one vertex", which is vacuous under D1's derivation —
if you mint one vertex per cycle, every cycle trivially has one. It is now grounded
in **SPEC §2's arrow-side incidence: an edge borders exactly two triangles.**

Phase 2 verified exhaustively that the point-side fault (a point off six cycles)
and the arrow-side fault (an arrow off two) **co-occur on every realizable small
board** — no single or double degree-preserving edit of `spacious` separates them.
So the validator must report **every** incidence fault it finds, not only the
first, or one of the two scenarios cannot pass. That is D2 read strictly, not a new
rule.
