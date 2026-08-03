# P01 — Contracts: ports & DTOs

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §2 (board), §3 (units, speed, rationals), §4 (turn
> structure), §5 (trails, sentries), §6 (combat), §7 (territory, economy).
> **Depends on:** nothing. **Unblocks:** everything.

## Why this is first

Every other packet imports these types. Getting them wrong is not a refactor, it
is a rewrite of the test suite as well as the code — the tests are written
against the ports by design (AGENTS.md, testing posture).

The packet is deliberately *shapes only*. No rule is implemented here. The
temptation to "just make it work" while the types are fresh is the failure mode
to watch for.

## In scope

- `packages/contracts` — the entire package.
- Identity types, `Rational`, the state and move DTOs.
- `GeometryPort`, `RulesPort`, `EconomyPort`.
- The EARS invariant list below, as prose that phase 2 turns into assertions.
- A **conformance suite skeleton** — see "Deliverable shape".

## Out of scope

- Any implementation. Fixture geometry is P02; the generator is P03; rules are
  P04 onward.
- Renderer types (P11).
- Persistence, netcode, AI. Not MVP (§1), and ADR 0001 keeps all three outside
  the core by construction, so no port is needed for them now.

## Deliverable shape

Types plus a **parameterized conformance suite** that any `GeometryPort`
implementation can be run against:

```
runGeometryPortConformance(makePort: () => GeometryPort): void
```

P01 lands it as compiling skeletons with one pending test per scenario. **P02 is
where it first goes green.** That split is deliberate — it is what makes "any
implementation satisfies the same tests" a fact about the repo rather than an
aspiration, and it is the pipeline's own red→green grain applied across two
packets instead of within one.

## Decisions this packet fixes

**D1 — Ids are opaque and branded, not lattice coordinates.**
`ArrowId`, `PointId`, `VertexId`, `PlayerId`. Geometry is pluggable (ADR 0001)
and fixture boards have no lattice coordinates to expose. A structured id would
leak the generator's representation through the port and quietly make P02
impossible.

**There is no `UnitId`.** §5 settled units as *counts on arrows*, not entities —
a stack is `(player, count)` occupying an arrow, and a sentry is just heads that
stayed. Introducing a unit identity would be modelling a shape the spec does not
have, and would immediately raise questions the rules never ask: which unit is
the survivor after attrition, which one carries the bank, which one a converted
stack becomes.

**D2 — `Rational` is integer numerator/denominator, normalized, totally ordered.**
Required by §3 (harmonic banking) and §7 (accumulators). Never `number`. The
total ordering matters as much as the arithmetic: comparisons feed ordered
decisions, and a partial or identity-based order is a determinism bug (ADR 0001).

**D3 — `Move` is `{ from: ArrowId, exit: ArrowId, count: number }`**, plus `skip`
and `endTurn` (§4, §5; §11 items 19 and 21). Three fields and no unit reference.

Splitting, merging, forking and sentry-dropping are all *the same move* with a
different `count` — which is why there is no drop action, no pickup action, and
no fork action. Any move type beyond these three is a signal that a mechanic has
been invented rather than expressed.

**D4 — Torus wrap is not on the port.** Wrap is internal to the geometry
implementation; the port only ever returns already-correct neighbours (§2). A
`wrap()` method would be a concretion leak and would give the rules code a reason
to know the board is a torus, which it must not.

**D5 — State is immutable; `apply` returns a new state** and never mutates its
input (ADR 0001).

**D6 — The port exposes enumeration.** `allPoints()`, `allArrows()`,
`allVertices()`. Even-odd fill (§7) needs to sweep the board, and it must do so
without knowing the geometry.

## Invariants (EARS candidates)

Geometry — these become the conformance suite:

- **G1** THE SYSTEM SHALL, for every point `p`, return exactly 3 in-arrows and
  exactly 3 out-arrows. (§2)
- **G2** THE SYSTEM SHALL, for every arrow `a`, satisfy
  `a ∈ outArrows(origin(a))` and `a ∈ inArrows(target(a))`. (§2)
- **G3** THE SYSTEM SHALL, for every vertex `v`, return exactly 3 bordering
  arrows. (§7)
- **G4** THE SYSTEM SHALL, for every arrow `a`, return exactly 2 flank vertices,
  and `a` SHALL border each of them. (§2 — an arrow touches exactly 4 interesting
  points; 2 spawner vertices is a hard limit, triple-fed is impossible)
- **G5** THE SYSTEM SHALL satisfy `|arrows| = 3·|points|` and
  `|vertices| = 2·|points|`. (§2, the incidence counts)
- **G6** THE SYSTEM SHALL be strongly connected. (§2 — balanced ⇒ Eulerian ⇒
  strongly connected)
- **G7** THE SYSTEM SHALL have girth 3. (§2)
- **G8** WHEN given two chords at a point, THE SYSTEM SHALL return the same
  crossing verdict regardless of argument order. (§2 — interleave and coincide
  are both symmetric relations)

Purity — these apply to every port, and are the reason P10 exists:

- **P1** WHEN `apply` is called, THE SYSTEM SHALL NOT mutate its input state.
- **P2** WHEN `apply` is called twice with equal inputs, THE SYSTEM SHALL return
  deeply equal outputs.
- **P3** THE SYSTEM SHALL NOT reference wall-clock time, randomness, or I/O
  anywhere in `packages/rules-core` or `packages/contracts`.

## Scenario inventory

**Phase 1 is done.** The specs live in [`docs/spec/`](../../spec/README.md):
[geometry-port](../../spec/geometry-port/geometry-port.md),
[chord-test](../../spec/chord-test/chord-test.md),
[rational](../../spec/rational/rational.md),
[move](../../spec/move/move.md). 80 scenarios, 33 EARS invariants.

The inventory below is the sketch those were written from, kept for the record.

| Feature | Scenarios |
|---|---|
| `geometry-adjacency` | 3-in/3-out at every point; in/out agree with origin/target; enumeration is complete and duplicate-free |
| `geometry-vertices` | every vertex borders 3 arrows; every arrow flanks exactly 2 vertices; the two relations agree |
| `geometry-counts` | the 3:1:2 ratio holds for any board the port yields |
| `geometry-connectivity` | every point reaches every other point; girth is 3 |
| `geometry-chord-test` | interleaving chords cross; coinciding chords cross; a chord turning aside does not; the verdict is order-symmetric |
| `rational-arithmetic` | `1/9 + 1/12 = 7/36` exactly; normalization; total ordering including equal-value-different-representation |
| `move-dto` | a step names a source arrow, an exit arrow and a count; `count` = whole stack, partial, and the zero/overdraw rejections; skip and end-turn are representable; a turn is an ordered list |

Note that the chord-test scenarios are the only ones here that encode a *rule*
rather than a shape — they are the port surface of §2's crossing definition, and
they are worth writing with more care than their size suggests.

## Questions for phase 1

1. Does `GeometryPort` expose the six arrow-slot ordering at a point directly, or
   only the `crosses(a, b)` verdict? Exposing the ordering makes the chord test
   testable in isolation and makes §2's 81-entry lookup table a real
   implementation option; hiding it keeps the port smaller. Recommend exposing
   it — the table is the thing most likely to be wrong, and an opaque verdict is
   the hardest possible thing to debug.
2. Do `RulesPort` and `EconomyPort` land in full here, or only `GeometryPort`
   plus the DTOs, with the rules ports growing packet by packet? Recommend the
   latter: P01 cannot know the shape of closure resolution (§7) without having
   built P05, and a speculative signature is a rule invented in type form.

## Definition of done

- [x] Toolchain landed — pnpm workspace, TypeScript strict, Vitest, ESLint with
      the purity guard. `pnpm verify` runs.
- [x] `packages/contracts` builds and typechecks under strict TypeScript.
- [x] Every invariant appears as a named test, and **every in-scope scenario has
      one**: 83 of 86 scenarios, the other 3 tagged `@deferred-P02` / `-P08`
      because they need a board constructor or an owned accumulator that a
      GeometryPort and a Rational respectively do not have. **Phase 2: 87
      failing, 4 passing, 27 pending** — every failure individually checked to be
      a missing behaviour rather than a setup problem.

      The first pass through this checkbox was wrong. It audited failure
      *reasons* and never audited *coverage*, and 11 scenarios turned out to
      have no test at all. Two different audits; only one had been run. Both are
      required before this box is honest.
- [x] No file in `packages/contracts` imports from any other workspace package.
- [x] `Move` has exactly three variants, asserted.
- [x] Phase 3 — green. **91 passing, 0 failing, 27 pending**; `pnpm verify` clean.
      No test was weakened, no scenario deleted, and no rule kicked back — SPEC
      answered every question the implementation raised.

## Phase 2 notes worth carrying into phase 3

**Three tests are green on purpose.** `the port surface is exactly these ten
methods`, `Move admits exactly three variants`, and `the chord test never asks
which slots are in-slots` constrain shape that already exists. They are guards
against a method, a variant or a parameter being added later, and they should
fail loudly when that happens — the third in particular, because a chord test
that grows an orientation argument means §11 item 1 leaked into P01.

**`chordsCross` split into two predicates.** §7's even-odd fill needs
`chordsInterleave` alone: coincidence cannot invert an enclosure, because fill
reads the trail's arrow set (§6.1a invariant 2) and re-traversing an arrow the
trail already holds leaves that set unchanged. `chordsCross` stays as interleave
OR coincide for §6.1's cut check. Phase 3 must implement them so that
`chordsCross ≡ chordsInterleave ∨ coincide` — asserted across all 225 pairs, so
they cannot drift apart.

**`@deferred-<packet>` is the tag for a scenario specified here but owned
elsewhere.** Three carry it. It is not a `@wip` — the behaviour is decided, the
seam just falls in another packet. A scenario without a test and without this
tag is a phase-2 defect.

**`ContractViolation` exists because of a false green.** The rejection tests
originally asserted a bare `.toThrow()` and passed against empty skeletons —
they would have stayed green through phase 3 whether or not the validation was
ever written. They now assert the specific error type. Any new rejection test
must do the same.

**The geometry conformance suite is pending, not red.** It is wrapped in a
`describe.skip` naming P02. Left running it would keep `pnpm verify` failing for
the whole gap between the two packets, and a permanently-failing verify is how
people stop reading verify. Skipped is the honest state — neither green nor red,
every test still named in the report. P02 deletes the wrapper, points the factory
at a fixture board, and the suite must go green *unchanged*; if it needs editing,
the port leaked something concrete.

**Movement allowance left `rational` for `move`.** §3 replaced the harmonic curve
with `speed(N) = 1 + floor(log₂ N)` — whole steps, nothing banked — so allowance
needs no rational arithmetic and is a pure function of one integer.
`Rational` now serves only the spawner economy (§7), which does carry. Note
`wholeSteps` and `spendStep` still carry movement-flavoured names while doing
accumulator work; renaming them is worth doing when P08 lands, not now.

**Phase 3 must not implement `speed` with `Math.log2`.** It is float arithmetic,
it would pass every value in the table, and it is exactly the determinism failure
ADR 0001 calls the realistic one — invisible in unit tests, visible as replay
drift in P10. *Done: halve-and-count, integer only.*

## Phase 3 notes for the reviewer

**Four guards exist that no scenario specifies.** Each is DTO well-formedness of
the same class the approved scenarios already cover, but none is under test, so
they are the places to look for an invented rule:

- `chord` rejects a degenerate chord (both ends the same slot), by parallel with
  `step` rejecting a matching source and exit. A transit enters on an in-arrow and
  leaves on an out-arrow, so its ends cannot coincide.
- `chord` normalizes to lower-slot-first, which is how the interface's stated
  "unordered" becomes true rather than asserted — structural equality depends on it.
- `spendStep` now enforces the precondition its doc comment already stated.
- `isSatisfiableBy` returns `true` for a skip and an end-turn: neither names a
  portion, so nothing about the board can make it unsatisfiable. This is the one of
  the four that is closest to a judgement call.

**Six skipped tests place a requirement on P02.** The foreign-identifier cases in
the conformance suite assert `ContractViolation`, so a fixture board must reject an
id it did not mint rather than returning a plausible-looking answer. They are
pending, so nothing enforces this until P02 unwraps the suite.

**Denominators are bounded by construction, not by a cap.** `add` normalizes via
gcd on every call, so a denominator never exceeds the lcm of its inputs — 36 for
the 1/9 and 1/12 forces §7 expects. There is no overflow guard because there is no
growth to guard against; if P08 introduces forces with large coprime denominators,
that assumption is the thing to re-check.
