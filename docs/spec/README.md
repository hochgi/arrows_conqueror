# docs/spec — executable specs, one directory per feature

Phase-1 output of `/spec-to-ship`. Each directory holds three files:

- `<name>.md` — overview, terms, mermaid, and the `## Invariants` EARS list
- `<name>.core.feature` — happy path
- `<name>.edge-cases.feature` — boundaries, interactions, degeneracies

`write-failing-tests` turns these scenarios into tests, `code-to-green` makes
them pass, and `review-changes` checks the code back against them. **If a
behaviour is not here, it will not be built.**

## Index

| Feature | Packet | SPEC | Scenarios | Deferred | Invariants |
|---|---|---|---|---|---|
| [geometry-port](./geometry-port/geometry-port.md) | P01 | §2, §7 | 32 | — | 16 |
| [chord-test](./chord-test/chord-test.md) | P01 | §2 | 18 | — | 9 |
| [rational](./rational/rational.md) | P01 | §7 | 19 | 2 | 8 |
| [move](./move/move.md) | P01 | §3, §4, §5 | 25 | — | 12 |
| [tiling](./tiling/tiling.md) | P03 | §2 | 34 | — | 12 |
| [layout](./layout/layout.md) | P03 | §2 | 24 | — | 12 |

152 scenarios. **94 are in scope for P01**, 2 are tagged `@deferred-P08`, and
**58 belong to P03**. 217 concrete cases once `Examples` rows are expanded,
69 invariants.

A `@deferred-<packet>` tag means the behaviour is decided and specified here, but
its seam falls in another packet — an accumulator that knows its owner is not a
`Rational`. It is not a `@wip`. **A scenario with neither a test nor this tag is a
defect**, and eleven of them once were.

> **These counts moved when SPEC §11 item 4 made the board unbounded.**
> `geometry-port` grew (windows need their own contract), `tiling` grew despite
> *losing* the whole seam and board-floor surface (unboundedness needs asserting,
> and so does the symmetry that setup may use), and one `@deferred-P02` scenario —
> *a board too small to be conformant is rejected* — was deleted outright, because
> there is no board size to be below.

## Reading order for P01

`geometry-port` and `rational` are shape and arithmetic — they assert facts, and
an implementation either has them or does not.

**`chord-test` is different and deserves more attention than its size suggests.**
It is the only file in P01 that encodes a *rule*, it is the subtlest logic in the
game, and it is the one place where a wrong-but-plausible implementation would
pass a casual reading. It is also totally specifiable — 225 ordered pairs over
the 15 chords six slots admit, of which a layout realizes 81 — so there is no
excuse for leaving any of it to inference.

`move` is a DTO, and its job is mostly to make illegal shapes unrepresentable.
Its edge cases carry more weight than its core.

## Reading order for P03

`tiling` is the first real `GeometryPort`, so most of what it must satisfy is
already written — the 37-assertion conformance suite. Its own scenarios cover what
the suite cannot: unboundedness in every direction, window degeneracies,
determinism, and which lattice symmetries setup is allowed to use.

**`layout` looks cosmetic and is not.** SPEC §2's out-directions have to sum to
zero *and* sit 120° apart; a set doing only the first is an isomorphic graph that
passes every conformance assertion and renders skewed. Layout holds the only
executable check on that, and on the up/down twist parity — a mistake there still
tiles the plane perfectly and just quietly deletes the arrowhead. Both failure
modes are invisible to every other test in the repo.

## What is deliberately not here

Legality. Whether an exit is really an out-arrow of the source's target point,
whether a mover has allowance left, whether a crossing is won — all of that is
P04 and later. A `Then` step in this directory that mentions a rule outcome
rather than a shape has leaked, and should be moved.
