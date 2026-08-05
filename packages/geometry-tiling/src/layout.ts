/**
 * The arrow tiling as drawable polygons — SKELETON.
 *
 * SPEC §2 (the chevron is a decoration of a directed edge). P03 decisions D3
 * and D5.
 *
 * **Not on `GeometryPort`, and not for tidiness.** §11 item 29 made fixture
 * boards abstract digraphs, and an abstract board has no positions at all — a
 * layout port would be unimplementable for P02. The renderer imports this
 * directly; the core never sees it.
 *
 * **It is also the only executable check on a constant no rule can see.** SPEC
 * §2's out-directions must sum to zero *and* sit 120° apart. A set doing only
 * the first is an isomorphic graph that passes every conformance assertion and
 * renders skewed.
 *
 * Phase 2: signatures only. Every method throws.
 */

import type { ArrowId, PointId, VertexId } from '@arrows/contracts';

const notImplemented = (method: string): never => {
  throw new Error(`geometry-tiling: layout ${method} is not implemented (P03 phase 3)`);
};

/** A position in **lattice space**. The renderer owns pan, zoom and culling. */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Whether the two triangles flanking an arrow twist against each other.
 *
 * `'opposite'` is the artwork. `'same'` is **wrong** and is representable
 * anyway, because it is the one mistake no other test can see: same-direction
 * twisting still tiles the plane exactly, with the same vertex count and the
 * same per-tile area, and merely makes the tile centrally symmetric — two
 * identical points and no arrowhead. A value that cannot be constructed cannot
 * be proven different.
 */
export type TwistParity = 'opposite' | 'same';

/**
 * The chevron silhouette, as data.
 *
 * POC-grade by explicit decision and expected to be retuned. Held as named
 * parameters that nothing branches on — the same discipline SPEC §7 imposes on
 * spawner force. Note what is **absent**: no scale, no offset, no viewport, no
 * bounds. Layout returns lattice space and clips nothing.
 */
export interface SilhouetteParams {
  /** How far a spoke is rotated about its triangle's centre. 0 leaves rhombi. */
  readonly twistDegrees: number;
  /** How far along the spoke the rotation applies, in the open interval (0, 1). */
  readonly bendFraction: number;
  /** Defaults to `'opposite'`, which is the artwork. */
  readonly twistParity?: TwistParity;
}

/** Measured off the reference artwork and confirmed by overlay. */
export const MEASURED_SILHOUETTE: SilhouetteParams = {
  twistDegrees: 87,
  bendFraction: 0.36,
  twistParity: 'opposite',
};

/** Every tile has exactly this area, at any twist and any bend. */
export const TILE_AREA = Math.sqrt(3) / 6;

export interface TilingLayout {
  /** The parameters this layout was built with, resolved. */
  readonly params: Required<SilhouetteParams>;

  /** The 8-vertex chevron for an arrow, in order, not repeating the first. */
  polygon(arrow: ArrowId): readonly Point2[];

  /** Where a movement junction sits. */
  pointPosition(point: PointId): Point2;

  /** Where a spawner vertex sits — the centre of its triangle. */
  vertexPosition(vertex: VertexId): Point2;
}

/**
 * @throws ContractViolation if `bendFraction` is outside the open interval
 *   `(0, 1)`: at 0 the spoke collapses to the triangle centre, at 1 onto the
 *   corner, and past 1 tiles self-intersect.
 */
export const makeLayout = (_params: SilhouetteParams = MEASURED_SILHOUETTE): TilingLayout => ({
  get params(): Required<SilhouetteParams> {
    return notImplemented('params');
  },
  polygon: (_arrow: ArrowId): readonly Point2[] => notImplemented('polygon'),
  pointPosition: (_point: PointId): Point2 => notImplemented('pointPosition'),
  vertexPosition: (_vertex: VertexId): Point2 => notImplemented('vertexPosition'),
});
