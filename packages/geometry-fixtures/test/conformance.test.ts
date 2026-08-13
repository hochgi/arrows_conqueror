/**
 * The GeometryPort conformance suite, run against each shipped fixture board.
 *
 * Covers fixtures.core.feature:
 *   - "The minimal board passes the conformance suite"
 *   - "The spacious board passes the conformance suite"
 *
 * This is the interchangeability claim made concrete (P02): the identical suite
 * the tiling passes (37 assertions) passes here too, against boards built a
 * completely different way — authored, not generated — with **not one assertion
 * changed**. The suite is imported, never copied; if it ever needed editing, the
 * port leaked something concrete and that is the finding to report, not a fix
 * (P02 scope).
 *
 * The radius each board runs at is its undirected diameter, so the window the
 * suite asserts over *is the whole board*: `minimal` is `K₇` (diameter 1),
 * `spacious` is `⟨(4,0),(1,2)⟩` (diameter 2). See the `ConformanceOptions.radius`
 * note — a finite board wants a radius at least its own diameter.
 */

import { runGeometryPortConformance } from '@conquarrow/contracts/testing';
import { MINIMAL, SPACIOUS, makeFixture } from '../src/index';

runGeometryPortConformance('fixture minimal (P02)', () => makeFixture(MINIMAL), { radius: 1 });
runGeometryPortConformance('fixture spacious (P02)', () => makeFixture(SPACIOUS), { radius: 2 });
