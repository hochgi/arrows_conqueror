/**
 * `@arrows/geometry-tiling` — the generated board and its drawable shapes.
 *
 * Two independent stateless factories (P03 D6):
 *
 * ```
 * makeTiling(): GeometryPort                        // no arguments at all
 * makeLayout(params): TilingLayout
 * ```
 *
 * Keeping them separate means retuning `twist` does not rebuild a board, and
 * the composition root hands the rules core only the `GeometryPort`. They share
 * the private codec in `cells`, which is how layout gets a triangle's parity
 * without the port exposing a coordinate.
 *
 * The coordinate helpers below are this package's own surface, for the renderer
 * (P11) and match setup (P09). **The rules core must not import them** — it
 * receives ids from the port and passes them back.
 */

export { makeTiling } from './tiling';
export {
  MEASURED_SILHOUETTE,
  TILE_AREA,
  makeLayout,
  type Point2,
  type SilhouetteParams,
  type TilingLayout,
  type TwistParity,
} from './layout';
export {
  DIRECTIONS,
  OUT_DIRECTIONS,
  PARITIES,
  TRIANGLE_OFFSET,
  cellArrow,
  cellPoint,
  cellVertex,
  type Direction,
  type LatticeVector,
  type TriangleParity,
} from './cells';
