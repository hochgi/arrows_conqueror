/**
 * The GeometryPort conformance suite, run against the real tiling.
 *
 * This is the debt P01 left behind a `describe.skip`, and discharging it is
 * P03's headline deliverable. **The suite must go green unedited.** If it needs
 * a change, the port leaked something concrete and that is the finding to
 * report, not a fix to apply.
 *
 * Radius 4 — 61 points, 366 arrows — is a fair sample of an unbounded board and
 * still runs in milliseconds. Nothing in the suite is global, so a larger window
 * would assert the same facts more slowly.
 */

import { runGeometryPortConformance } from '@arrows/contracts/testing';
import { makeTiling } from '../src/index';

runGeometryPortConformance('generated tiling (P03)', makeTiling, { radius: 4 });
