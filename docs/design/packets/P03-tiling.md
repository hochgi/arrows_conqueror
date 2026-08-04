# P03 — Tiling generator & torus wrap

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §2 (the board, the formal definition, the orientation
> pattern), §7 (specials live on vertices), §11 items 1, 5, 16, 29.
> **Depends on:** P01. **Unblocks:** a visible board, and P11.

## Why this is next, ahead of P02

The packet plan lists P02 first and P03 in parallel, so this is a choice inside
the plan rather than a reorder. Two reasons to take it now:

**It is the only thing between the repo and pixels.** A board *viewer* needs the
generator and nothing else — no rules, no movement, no economy, no match
lifecycle. P11's dependency on P09 is for the hot-seat *game* adapter, which is a
different deliverable.

**It discharges the conformance debt against the real board.** P01 left
`runGeometryPortConformance` behind a `describe.skip` with 28 pending assertions,
and the plan assigned that debt to P02. Proving the suite green against the
*actual* tiling is worth more than proving it against a hand-authored fixture,
and it leaves P02 matching a suite already known to be satisfiable.

## Already validated

Unusually for a phase-1 input, the maths here is **measured, not proposed**. A
throwaway generator plus canvas viewer was built first, ran the conformance
assertions in-page against a 14×14 torus (**14/14 pass**), and was checked against
the reference artwork. What follows is the output of that, not a design sketch.

That is also why this packet is smaller than it looks: the risk was the geometry,
and the geometry is now known.

## In scope

- `packages/geometry-tiling` — a `GeometryPort` implementation generated from
  `(n, m)`.
- The **layout** the renderer needs: a polygon per arrow. Same package, *not* on
  `GeometryPort` — see D3.
- Deleting the `describe.skip` wrapper and making all 28 conformance assertions
  pass **unchanged**. If the suite needs editing, the port leaked something
  concrete and that is the finding.

## Out of scope

- Fixture geometry (P02). Different package, same suite.
- Any rule. This packet answers *what is adjacent to what*, never *what may move*.
- The renderer itself (P11). P03 supplies polygons; it draws nothing.
- Board size and spawner placement — §11 items 11 and 12, owned by P09. P03 takes
  `(n, m)` as an argument and has no opinion about it.

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
"down"; these are its two spawner vertices, giving `2nm`. An arrow's two flanking
triangles are always **one up and one down**, never two of a kind — so §7's cap of
two feed slots per arrow is a consequence of the geometry rather than a rule that
has to be enforced.

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

## Invariants (EARS candidates)

The 28 already in `runGeometryPortConformance` carry most of this. New to P03:

- The system shall generate a board for any `(n, m)` with `n ≥ 4` and `m ≥ 4`.
- The system shall reject a board size smaller than the smallest conformant torus
  rather than emitting a board that fails conformance.
- The system shall place `nm` points, `3nm` arrows and `2nm` vertices.
- The system shall resolve every adjacency query across the torus seam without
  exposing where the seam is.
- The system shall return byte-identical enumerations for two generators built
  from the same `(n, m)`.
- The system shall assign in-arrows and out-arrows to alternating slots.
- The system shall report exactly one up-triangle and one down-triangle as an
  arrow's flanks.
- The system shall return a closed polygon of 8 vertices for every arrow.
- The system shall produce polygons that tile without gap or overlap, so that the
  summed polygon area equals the board area.
- The system shall give the three tiles around a vertex a common corner at that
  vertex's centre.

## The board-size floor is a real constraint

**The smallest conformant torus is 4×4** — 16 points, 48 arrows, 32 vertices.
Measured, not estimated. Smaller boards fail on *girth-3 encloses exactly one
vertex*:

| size | why it fails |
|---|---|
| 1×m, m×1 | self-loops and multiple arrows between one ordered pair |
| 2×2 | wrap collapses the triangle count — 4 triangles against 8 vertices |
| 3×3 | 27 triangles against 18 vertices; at any `n = 3`, three steps of one out-vector wrap to zero and manufacture a straight-line "triangle" enclosing nothing |
| 4×4 | conformant |

This bounds §11 item 11 from below and is why P02's fixtures are abstract
digraphs — those have no wrap, and bottom out near 6 points and 18 arrows.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Generation** (≈6) — counts for several `(n, m)`; rejection below the floor;
  two generators agreeing exactly.
- **Adjacency** (≈8) — in/out sets; origin and target; the seam resolving
  invisibly; flank and border mutually inverse; up-and-down flank parity.
- **Slots** (≈4) — six distinct; alternation; the phase being consistent within a
  board; `slotOf` rejecting an arrow not at that point.
- **Conformance** (1) — the suite, green, unchanged.
- **Layout** (≈5) — 8-vertex polygons; area summing to the board; three tiles
  sharing a vertex centre; rhombus at twist 0; up/down parity changing the
  silhouette.
- **Foreign ids** (≈2) — an id from another board failing loudly.

## Questions for phase 1

1. Should the layout expose polygons in **lattice space** and let the renderer
   transform, or in a pixel space it is told about? Lattice space keeps the
   package free of viewport concerns; the renderer then owns pan and zoom.
2. Does the layout return **wrapped** polygons for arrows crossing the seam — one
   arrow, two polygons — or unwrapped ones, leaving the renderer to draw copies?
   This is the only place the torus becomes visible, and it is a genuine fork.
3. Is `n ≥ 4, m ≥ 4` enforced as a **contract violation**, or does the generator
   accept smaller and let the conformance suite fail? Rejecting is friendlier;
   accepting keeps the port honest about being a pure function of `(n, m)`.

None of these is a rule question — no `SPEC.md` behaviour depends on the answers.
They are shape decisions, which is what phase 1 is for.

## Definition of done

- `pnpm verify` green.
- All 28 conformance assertions **passing rather than pending**, and unedited.
- A `(n, m)` board rendering as the arrow tiling, tiles lighting on hover.
- No `Date`, `Math.random` or iteration-order dependence anywhere in the package.
- `SPEC.md` §11 items 1, 5, 16 and 29 still marked resolved and still accurate.
