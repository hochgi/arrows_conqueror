/**
 * The fixture id codec.
 *
 * Every identifier a fixture mints is **namespaced by its board** so that two
 * boards in one test run — `minimal`, `spacious`, and the generated tiling —
 * can never have an id from one silently resolve against another (P02 D5, and
 * the "foreign identifier" edge cases). The shapes are:
 *
 * ```
 * fixtures:<board>:p:<label>          a point
 * fixtures:<board>:a:<from>-<to>      an arrow, by its endpoint labels
 * fixtures:<board>:v:<canonical-key>  a derived vertex, by its cycle's key
 * ```
 *
 * Ids are **opaque** (P01 D1): the rules core receives them from the port and
 * passes them back, never parsing them, and a test must not assert on the string
 * either — that would be testing the codec, not the geometry. These helpers
 * exist only so a test can *name* an entity to hand to the port (as
 * `geometry-tiling`'s `cellPoint` does), and so a port can mint its own board.
 *
 * Only the encode side lives here. Decoding — recognising and resolving an id
 * against a specific board — is the port's job and belongs to `makeFixture`
 * (P02 phase 3). Minting is pure string assembly and carries no logic under
 * test, so it is authored now; resolution is behaviour and is not.
 */

import { mintArrowId, mintPointId, mintVertexId } from '@arrows/contracts';
import type { ArrowId, PointId, VertexId } from '@arrows/contracts';
import type { BoardDescription } from './boards';

/** The namespace prefix every fixture id carries, marking it as neither tiling nor foreign. */
export const FIXTURE_NAMESPACE = 'fixtures';

/**
 * `fixtures:<board>:p:<label>`.
 *
 * Not validated — a well-formed id for an absent point is legal to *mint*, so a
 * test can hand one to the port and watch the port refuse it (an edge case).
 */
export const fixturePoint = (board: BoardDescription, label: string): PointId =>
  mintPointId(`${FIXTURE_NAMESPACE}:${board.name}:p:${label}`);

/** `fixtures:<board>:a:<from>-<to>`, an arrow named by its endpoint labels. */
export const fixtureArrow = (board: BoardDescription, from: string, to: string): ArrowId =>
  mintArrowId(`${FIXTURE_NAMESPACE}:${board.name}:a:${from}-${to}`);

/**
 * `fixtures:<board>:v:<canonical-key>`.
 *
 * The canonical key is a minimal cycle's three arrow specs, **sorted** and
 * joined — the sort is what makes two independent builds mint an identical id
 * regardless of the order their cycle enumeration happened to visit (P02 D5,
 * and the `cycleKey` note in the conformance suite). Vertices are derived, so no
 * test mints one directly; this is the port's own helper.
 */
export const fixtureVertex = (board: BoardDescription, canonicalKey: string): VertexId =>
  mintVertexId(`${FIXTURE_NAMESPACE}:${board.name}:v:${canonicalKey}`);
