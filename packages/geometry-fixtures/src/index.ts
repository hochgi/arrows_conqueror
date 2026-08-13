/**
 * `@conquarrow/geometry-fixtures` — hand-authored finite boards behind `GeometryPort`.
 *
 * The sibling of `@conquarrow/geometry-tiling`: same port, same conformance suite
 * (P02). Two boards ship, `minimal` and `spacious`, authored as rotation systems
 * with their vertex lattices derived (P02 D1). A fixture exists to demonstrate
 * the port is interchangeable and to give a rules failure a board it can print —
 * so it depends on `@conquarrow/contracts` and nothing else (P02 DoD).
 *
 * ```
 * makeFixture(MINIMAL): GeometryPort
 * fixturePoint(MINIMAL, '0'): PointId          // to name an entity for the port
 * ```
 *
 * The id helpers are this package's own surface, for tests that must name a
 * specific point or arrow (as `geometry-tiling`'s `cellPoint` is). The rules
 * core must not call them — it receives ids from the port and passes them back.
 */

export { makeFixture } from './fixture';
export { MINIMAL, SPACIOUS, type BoardDescription } from './boards';
export { FIXTURE_NAMESPACE, fixtureArrow, fixturePoint, fixtureVertex } from './ids';
