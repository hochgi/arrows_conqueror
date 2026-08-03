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
| [geometry-port](./geometry-port/geometry-port.md) | P01 | §2, §7 | 24 | 1 | 11 |
| [chord-test](./chord-test/chord-test.md) | P01 | §2 | 18 | — | 8 |
| [rational](./rational/rational.md) | P01 | §7 | 19 | 2 | 8 |
| [move](./move/move.md) | P01 | §3, §4, §5 | 25 | — | 12 |

86 scenarios, of which **83 are in scope for P01** and 3 are tagged
`@deferred-P02` / `@deferred-P08`. 117 concrete cases once `Examples` rows are
expanded, 39 invariants.

A `@deferred-<packet>` tag means the behaviour is decided and specified here, but
its seam falls in another packet — a board constructor is not on the port, and an
accumulator that knows its owner is not a `Rational`. It is not a `@wip`. **A
scenario with neither a test nor this tag is a defect**, and eleven of them once
were.

## Reading order for P01

`geometry-port` and `rational` are shape and arithmetic — they assert facts, and
an implementation either has them or does not.

**`chord-test` is different and deserves more attention than its size suggests.**
It is the only file in P01 that encodes a *rule*, it is the subtlest logic in the
game, and it is the one place where a wrong-but-plausible implementation would
pass a casual reading. It is also totally specifiable — 81 ordered pairs — so
there is no excuse for leaving any of it to inference.

`move` is a DTO, and its job is mostly to make illegal shapes unrepresentable.
Its edge cases carry more weight than its core.

## What is deliberately not here

Legality. Whether an exit is really an out-arrow of the source's target point,
whether a mover has allowance left, whether a crossing is won — all of that is
P04 and later. A `Then` step in this directory that mentions a rule outcome
rather than a shape has leaked, and should be moved.
