# P03 — Tiling generator

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §2 (the board, the formal definition, the orientation
> pattern, *the board is unbounded*, map symmetry), §7 (specials live on
> vertices), §11 items 1, 4, 5, 16, 29.
> **Depends on:** P01. **Unblocks:** a visible board, and P11.

## Why this is next, ahead of P02

The packet plan lists P02 first and P03 in parallel, so this is a choice inside
the plan rather than a reorder. Two reasons to take it now:

**It is the only thing between the repo and pixels.** A board *viewer* needs the
generator and nothing else — no rules, no movement, no economy, no match
lifecycle. P11's dependency on P09 is for the hot-seat *game* adapter, which is a
different deliverable.

**It discharges the conformance debt against the real board.** P01 left
`runGeometryPortConformance` behind a `describe.skip` with 37 pending assertions,
and the plan originally assigned that debt to P02. Proving the suite green against
the *actual* tiling is worth more than proving it against a hand-authored fixture,
and it leaves P02 matching a suite already known to be satisfiable.

## Already validated

Unusually for a phase-1 input, the maths here is **measured, not proposed**. A
throwaway generator plus canvas viewer was built first, ran the conformance
assertions in-page (**14/14 pass** at the time), and was checked against the
reference artwork. What follows is the output of that, not a design sketch.

That is also why this packet is smaller than it looks: the risk was the geometry,
and the geometry is now known.

**What changed since that viewer was built:** SPEC §11 item 4 made the board the
unbounded plane rather than a torus. That *simplifies* this packet rather than
invalidating it — the generator's arithmetic is the same modulo dropping the
`mod (n, m)` step, and the 4×4 floor and the whole seam surface disappear with it.
The viewer's numbers still stand; they were computed on a 14×14 torus, and every
property they confirmed is local.

## In scope

- `packages/geometry-tiling` — a `GeometryPort` implementation over the unbounded
  oriented triangular lattice.
- The **layout** the renderer needs: a polygon per arrow. Same package, *not* on
  `GeometryPort` — see D3.
- Deleting the `describe.skip` wrapper and making all 37 conformance assertions
  pass **unchanged**. If the suite needs editing, the port leaked something
  concrete and that is the finding.

## Out of scope

- Fixture geometry (P02). Different package, same suite.
- Any rule. This packet answers *what is adjacent to what*, never *what may move*.
- The renderer itself (P11). P03 supplies polygons; it draws nothing, and in
  particular it does not decide which polygons are on screen.
- Spawner placement, force, band radii and the cutoff radius *R* — §11 items 11
  and 12, owned by P09. The generator has no opinion about any of them and must
  never read one.

## Decisions this packet fixes

**D1 — The out-directions are `{(1,0), (-1,1), (0,-1)}` in lattice coordinates.**
Basis `u = (1,0)`, `v = (½, √3⁄2)`. These sum to zero **and** sit 120° apart, and
both conditions are load-bearing: summing to zero closes the directed 3-cycle
(girth 3), and the 120° spacing is what makes the board mirror-symmetric rather
than skewed.

This is worth stating because it is easy to get half right. `{(1,0), (0,1),
(-1,-1)}` also sums to zero, produces an isomorphic *graph* — it is the same set
under an `SL₂(ℤ)` change of basis — and passes every combinatorial assertion in
the suite. It sits at 0°/60°/210°, so it renders skewed. **The conformance suite
cannot catch this**, which makes it a comment-worthy constant rather than an
obvious one.

**D2 — A point's two triangles are at `+(⅓,⅓)` and `+(⅔,⅔)`.** One "up", one
"down"; these are its two spawner vertices. An arrow's two flanking triangles are
always **one up and one down**, never two of a kind — so §7's cap of two feed
slots per arrow is a consequence of the geometry rather than a rule that has to be
enforced.

**D3 — Layout is not on `GeometryPort`.** The port has no coordinates by
construction (P01 D1, and the port doc forbids naming a lattice coordinate), so a
renderer cannot get drawing geometry from it. It goes on this package's own
interface instead, which the renderer imports directly and the core never sees.

The reason is not tidiness. **§11 item 29 made fixture boards abstract digraphs,
and an abstract board has no positions at all** — a layout port would be
unimplementable for it. Recomputing positions in the renderer is the alternative
and it is worse: the lattice maths would live in two packages that can silently
disagree.

**D4 — Slots alternate, and the phase is an accident.** With the labelling above,
in-arrows land on the **odd** slots. §11 item 29 fixed alternation as a
conformance requirement and deliberately left the phase free; this packet is where
that pays, because the lattice picks a phase and no caller may depend on it.

**D5 — The chevron silhouette is two numbers, and they are configurable.**
Each lattice triangle is split into three pieces, one per edge, by a path from its
centre to each corner. Straight paths make each tile a rhombus; bending them makes
the chevron. Two parameters, currently `twist = 87°` and `bend = 36%` of the way
out, measured off the artwork and confirmed by overlay.

Two structural facts about that construction, both learned by getting them wrong:

- **The bend belongs to the (triangle, corner) pair, not to the tile.** Both tiles
  meeting along a spoke must use the identical bent path, or the plane stops being
  tiled. Bending a tile's two ends independently leaves gaps.
- **Up and down triangles must twist in opposite directions.** Twisting them the
  same way still tiles, but forces the tile to be centrally symmetric about its
  edge midpoint — two identical points and no arrowhead. Opposite twists break
  that symmetry into a head and a tail. So **the layout needs a triangle's parity,
  not just its centre.**

Silhouette values are POC-grade by explicit decision and expected to be retuned.
They must stay two named constants that nothing branches on — the same discipline
§7 imposes on spawner force.

**D6 — Two stateless factories, no board object.** This answers the shape question
phase 1 had left open, and §11 item 4 answered it for us:

```
makeTiling(): GeometryPort                        // no arguments at all
makeLayout(params: SilhouetteParams): TilingLayout
```

The board is unbounded, so there is no size, no modulus and **nothing to
precompute**. Every answer is arithmetic on the identifier handed in. That makes
both factories pure functions with no state, which is worth more than it sounds:
the realistic determinism failure in this repo is iteration order over a
precomputed collection (ADR 0001), and a generator that precomputes nothing cannot
have one. Keeping the two factories independent means retuning `twist` does not
rebuild a board, and the composition root hands the core only the `GeometryPort`.

They share a private id codec, which is how layout gets a triangle's parity
without the port exposing a coordinate.

## Invariants (EARS candidates)

The 37 already in `runGeometryPortConformance` carry most of this. New to P03:

- The system shall answer adjacency for every cell in ℤ², with none rejected for
  distance from the origin.
- The system shall report exactly `3r² + 3r + 1` points in a window of radius `r`.
- The system shall reject a window radius that is negative or not an integer.
- The system shall assign in-arrows and out-arrows to alternating slots.
- The system shall report exactly one up-triangle and one down-triangle as an
  arrow's flanks.
- The system shall place every point on exactly 6 minimal directed cycles.
- The system shall hold no mutable state and precompute no collection.
- The system shall return a closed polygon of 8 vertices for every arrow.
- The system shall give every tile an area of exactly `√3⁄6`, at any twist and
  bend.
- The system shall give the three tiles around a vertex a common corner at that
  vertex's centre.
- The system shall produce congruent tiles for the same direction at any two
  cells.

## What the unbounded board removed

The previous version of this packet carried a **4×4 board-size floor** and a table
of the ways smaller tori broke *girth-3 encloses exactly one vertex*. All of it is
gone with §11 item 4: the floor was an artifact of the wrap, and on the unbounded
lattice both girth-3 and the one-vertex correspondence are local properties that
hold everywhere without a condition.

Also gone: every seam scenario. There is no wrap, so there is nothing to hide, no
"is this arrow wrapped" to refuse to answer, and no question about whether layout
returns clipped polygons at the boundary — the question phase 1 had flagged as *a
genuine fork*. It resolved by disappearing.

What replaced the board size is the spawner cutoff radius *R* (§7, *the radial
gradient*), and it is **not this packet's**. P09 owns it as setup data.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Generation** (≈5) — window point counts at several radii; radius rejection;
  two generators agreeing exactly; statelessness.
- **Adjacency** (≈8) — in/out sets; origin and target; far-off cells being
  ordinary; flank and border mutually inverse; up-and-down flank parity.
- **Unboundedness** (≈3) — long walks in each direction; the zigzag identity; no
  method reporting an extent.
- **Slots** (≈4) — six distinct; alternation; the phase being consistent within a
  board; `slotOf` rejecting an arrow not at that point.
- **Symmetry** (≈3) — 120° preserves the grain, 180° reverses it, the reflection
  is the usable involution.
- **Conformance** (1) — the suite, green, unchanged.
- **Layout** (≈7) — 8-vertex polygons; per-tile area `√3⁄6`; three tiles sharing a
  vertex centre; rhombus at twist 0; up/down parity changing the silhouette;
  translation invariance; no clipping.
- **Foreign ids** (≈2) — an id from another board failing loudly.

## Questions for phase 1

1. Should the layout expose polygons in **lattice space** and let the renderer
   transform, or in a pixel space it is told about? Lattice space keeps the
   package free of viewport concerns; the renderer then owns pan, zoom and
   culling — which on an unbounded board is its central job.
2. ~~Does the layout return wrapped polygons for arrows crossing the seam?~~ —
   **moot.** §11 item 4 removed the seam.
3. ~~Is `n ≥ 4, m ≥ 4` enforced as a contract violation?~~ — **moot.** There is no
   board size. The equivalent question is now the window radius, and D6 answers
   it: reject, like every other constructor in `contracts`.

None of these is a rule question — no `SPEC.md` behaviour depends on the answers.
They are shape decisions, which is what phase 1 is for.

## Definition of done

- `pnpm verify` green.
- All 37 conformance assertions **passing rather than pending**, and unedited.
- A board rendering as the arrow tiling, tiles lighting on hover, pannable in any
  direction without running out of board.
- No `Date`, `Math.random` or iteration-order dependence anywhere in the package —
  and no precomputed collection to iterate in the first place.
- `SPEC.md` §11 items 1, 4, 5, 16 and 29 still marked resolved and still accurate.
