/**
 * The authored fixture boards.
 *
 * SPEC §2 (the arrow graph, the alternating orientation), §7 (specials live on
 * vertices). P02 D1 and D3.
 *
 * A board is authored as a **rotation system** and nothing else: one line per
 * point, its six arrows in cyclic slot order, alternating out / in / out / in /
 * out / in. From that alone the port derives `outArrows`, `inArrows`, `origin`,
 * `target`, `slotOf`, and — by enumerating minimal directed 3-cycles — the
 * entire spawner-vertex lattice (`flankVertices`, `borderArrows`). The vertices
 * are **never authored** (P02 D1): §7's lattice is a consequence of the arrow
 * graph, not a second input, and authoring it would be fourteen more lines of
 * chances to be wrong.
 *
 * Each arrow is written `from>to`. The **phase** — that out-arrows take the even
 * slots here — is this package's own convention and nothing may depend on it
 * (§11 item 29; SPEC §2 "the lattice picks that phase"). What is *not* free, and
 * is the whole reason a rotation system rather than a plain adjacency list is
 * authored, is which in-arrow sits between which out-arrows: that cyclic order
 * is exactly what the chord test reads.
 *
 * Neither board is authored as a lattice quotient, though both happen to be one
 * (P02 D1): writing `⟨(4,0),(1,2)⟩` would make the fixture a second copy of the
 * tiling's arithmetic, and the two implementations would then share any mistake.
 */

/**
 * A board authored as a rotation system.
 *
 * `name` namespaces every id the board mints, so no two boards' ids collide.
 * `rotations` maps each point's label to its six arrows in cyclic slot order.
 */
export interface BoardDescription {
  readonly name: string;
  readonly rotations: Readonly<Record<string, readonly string[]>>;
}

/**
 * `minimal` — the 7-point board, the tournament on ℤ/7 (`i → j` iff `j − i` is a
 * square mod 7). 21 arrows, 14 derived vertices, girth 3, undirected diameter 1.
 *
 * The smallest conformant board, unique up to isomorphism (P02 measurement 1),
 * and the conformance witness. Because its undirected graph is `K₇` — every
 * point adjacent to every other — no test on it can express "not adjacent" or
 * "outside the window"; that is what `spacious` is for. Run its conformance at
 * **radius 1**, its diameter, so the window is the whole board.
 */
export const MINIMAL: BoardDescription = {
  name: 'minimal',
  rotations: {
    '0': ['0>1', '3>0', '0>4', '5>0', '0>2', '6>0'],
    '1': ['1>2', '0>1', '1>5', '4>1', '1>3', '6>1'],
    '2': ['2>3', '0>2', '2>6', '1>2', '2>4', '5>2'],
    '3': ['3>4', '1>3', '3>0', '2>3', '3>5', '6>3'],
    '4': ['4>5', '0>4', '4>1', '2>4', '4>6', '3>4'],
    '5': ['5>6', '1>5', '5>2', '3>5', '5>0', '4>5'],
    '6': ['6>0', '2>6', '6>3', '4>6', '6>1', '5>6'],
  },
};

/**
 * `spacious` — the 8-point board `⟨(4,0),(1,2)⟩`. 24 arrows, 16 derived
 * vertices, girth 3, undirected **diameter 2**.
 *
 * The smallest conformant board that breaks total adjacency (P02 D3): each point
 * has 6 distinct neighbours out of the other 7, so a radius-1 window is a
 * *proper* part of the board and the one remaining point is genuinely outside
 * it. That is the single thing `minimal` cannot express. Run its conformance at
 * **radius 2**, its diameter.
 */
export const SPACIOUS: BoardDescription = {
  name: 'spacious',
  rotations: {
    '0': ['0>1', '3>0', '0>7', '4>0', '0>5', '6>0'],
    '1': ['1>2', '0>1', '1>4', '5>1', '1>6', '7>1'],
    '2': ['2>3', '1>2', '2>5', '4>2', '2>7', '6>2'],
    '3': ['3>0', '2>3', '3>6', '5>3', '3>4', '7>3'],
    '4': ['4>5', '1>4', '4>2', '3>4', '4>0', '7>4'],
    '5': ['5>6', '0>5', '5>3', '2>5', '5>1', '4>5'],
    '6': ['6>7', '1>6', '6>0', '3>6', '6>2', '5>6'],
    '7': ['7>4', '0>7', '7>1', '2>7', '7>3', '6>7'],
  },
};
