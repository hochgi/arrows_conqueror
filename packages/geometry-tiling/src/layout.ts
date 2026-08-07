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

import { ContractViolation } from '@arrows/contracts';
import type { ArrowId, PointId, VertexId } from '@arrows/contracts';
import {
  OUT_DIRECTIONS,
  TRIANGLE_OFFSET,
  arrowCell,
  arrowFlanks,
  pointCell,
  vertexCell,
} from './cells';
import type { Cell, VertexCell } from './cells';

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

const ROOT3_OVER_2 = Math.sqrt(3) / 2;

/**
 * Lattice → drawable plane.
 *
 * Underlying basis is still `u = (1, 0)`, `v = (½, √3⁄2)` (SPEC §2). A fixed
 * **90° turn** then maps former east (direction 0) to screen-up: SVG's +y is
 * down, so the map is `(x, y) ↦ (y, −x)`. Graph topology is unchanged — only
 * which way the chevrons point on the monitor.
 */
export const world = (i: number, j: number): Point2 => {
  const x = i + j / 2;
  const y = j * ROOT3_OVER_2;
  return { x: y, y: -x };
};

/**
 * Inverse of {@link world}: drawable-plane coordinates → nearest lattice cell.
 *
 * Cull / hit must use this after the 90° layout turn — snapping with the raw
 * `u,v` basis centres the window on the wrong place and clips tiles at the
 * screen edge while panning.
 */
export const cellNearWorld = (x: number, y: number): Cell => {
  const j = Math.round(x / ROOT3_OVER_2);
  const i = Math.round(-y - j / 2);
  return { i, j };
};

const triangleCentre = ({ i, j, parity }: VertexCell): Point2 => {
  const f = TRIANGLE_OFFSET[parity];
  return world(i + f, j + f);
};

/**
 * The bend control point on the spoke from a triangle's centre `g` to one of
 * its corners.
 *
 * **The spoke belongs to the (triangle, corner) pair, not to a tile.** Both
 * tiles meeting along it must use the identical bent path or the plane stops
 * being tiled — the mistake that produced the first broken chevron, and the
 * reason `sign` is decided by the triangle's parity rather than by the arrow.
 */
const bend = (g: Point2, corner: Point2, twistRadians: number, depth: number): Point2 => {
  const dx = corner.x - g.x;
  const dy = corner.y - g.y;
  const cos = Math.cos(twistRadians);
  const sin = Math.sin(twistRadians);
  return {
    x: g.x + depth * (dx * cos - dy * sin),
    y: g.y + depth * (dx * sin + dy * cos),
  };
};

/**
 * @throws ContractViolation if `bendFraction` is outside the open interval
 *   `(0, 1)`: at 0 the spoke collapses to the triangle centre, at 1 onto the
 *   corner, and past 1 tiles self-intersect.
 */
export const makeLayout = (params: SilhouetteParams = MEASURED_SILHOUETTE): TilingLayout => {
  const { twistDegrees, bendFraction } = params;
  if (!(bendFraction > 0 && bendFraction < 1)) {
    throw new ContractViolation(
      `bend must lie strictly between 0 and 1, not ${String(bendFraction)}`,
    );
  }
  const resolved: Required<SilhouetteParams> = {
    twistDegrees,
    bendFraction,
    twistParity: params.twistParity ?? 'opposite',
  };
  const twist = (twistDegrees * Math.PI) / 180;

  /**
   * Up and down triangles twist **oppositely**.
   *
   * Twisting them the same way still tiles the plane exactly, with the same
   * vertex count and the same per-tile area — it merely makes the tile
   * centrally symmetric about its edge midpoint, giving two identical points
   * and no arrowhead. No area or gap test can see the difference, which is why
   * the wrong value stays representable and has a scenario of its own.
   */
  const signOf = (parity: VertexCell['parity']): number =>
    resolved.twistParity === 'same' || parity === 'up' ? 1 : -1;

  const positionOfPoint = (point: PointId): Point2 => {
    const { i, j }: Cell = pointCell(point);
    return world(i, j);
  };

  return {
    params: resolved,

    pointPosition: positionOfPoint,

    vertexPosition: (vertex: VertexId): Point2 => triangleCentre(vertexCell(vertex)),

    polygon: (arrow: ArrowId): readonly Point2[] => {
      const cell = arrowCell(arrow);
      const step = OUT_DIRECTIONS[cell.d];
      const a = world(cell.i, cell.j);
      const b = world(cell.i + step.di, cell.j + step.dj);
      const [flank1, flank2] = arrowFlanks(cell);
      const g1 = triangleCentre(flank1);
      const g2 = triangleCentre(flank2);
      const t1 = twist * signOf(flank1.parity);
      const t2 = twist * signOf(flank2.parity);
      const depth = bendFraction;

      // Round the tile: out along one triangle's two spokes, across to the far
      // point, back along the other triangle's two spokes. The arrow's own edge
      // is interior to the tile and never appears.
      return [
        a,
        bend(g1, a, t1, depth),
        g1,
        bend(g1, b, t1, depth),
        b,
        bend(g2, b, t2, depth),
        g2,
        bend(g2, a, t2, depth),
      ];
    },
  };
};
