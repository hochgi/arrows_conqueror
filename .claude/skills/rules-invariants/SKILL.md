---
name: rules-invariants
description: >-
  How to test a deterministic rules engine — property tests for the invariants
  SPEC.md states, replay fixtures for turn flow, and fixture boards instead of
  the real tiling. Use when writing or reviewing tests for arrows-conqueror,
  when an EARS invariant needs encoding, when a bug reproduces only after many
  turns, or when checking that the core is genuinely deterministic.
---

# Rules invariants, properties & replays

Component tests cover *scenarios*. This skill covers the two layers that catch
what scenarios miss: **properties** (things true of every state) and **replays**
(things true across long sequences).

The payoff here is unusually high. `SPEC.md` came out of a design conversation
that produced an unusual number of hard, checkable, closed-form invariants — a
list most game specs simply do not have. They are nearly free to encode and each
one covers a whole category of rule bug.

## The three layers

| Layer | Catches | Cost |
|---|---|---|
| Component test per scenario | the behaviour you thought of | one per scenario |
| Property test per invariant | the state you didn't think of | one per invariant |
| Replay fixture | emergent breakage over many turns; nondeterminism | one per match |

## Layer 2 — properties from the spec

These are drawn straight from `SPEC.md` and should hold after **every** applied
move. Encode them as properties over generated move sequences, not as examples.

**Geometry** (§2) — properties of the `GeometryPort` implementation, so every
geometry gets them for free:

- Every point has exactly 3 in-arrows and 3 out-arrows. *Balance is what the
  connectivity proof rests on; if a generated board violates it at even one
  point, heads can become trapped.*
- The graph is strongly connected. (Implied by balance + weak connectivity, but
  assert it directly — it is cheap and it catches a broken torus wrap, which is
  exactly where balance fails.)
- Girth is 3: the shortest directed cycle is a pinwheel triangle.
- Every spawner vertex borders exactly 3 arrows, and no vertex is reachable as a
  movement node. *You cannot stand on a vertex — that is structural, not a rule.*

**Conservation** (§3, §6) — heads are lives, so miscounting them is a scoring bug
and a victory bug at once:

- Total heads change only by the accounted events: spawner emission (+1),
  cut (−1 per affected branch), encirclement (transfer, sum preserved).
- A stack's size equals the number of heads composing it, always.
- Encirclement conserves the global head count exactly — it moves, never mints.

**Trails & closure** (§6, §7):

- A trail is a tree rooted at territory, or it is unanchored. It is never a
  disconnected mess of both.
- Closure fill is even-odd correct: a region is claimed iff it cannot reach the
  outside without crossing the boundary set.
- An unanchored trail claims nothing, ever.
- Evaporation only ever removes arrows forward of the cut, along the grain.

**Economy** (§7):

- Accumulator arithmetic is exact and conservative: total accrued equals total
  emitted plus total carried plus total destroyed by capture. *Nothing leaks.*
- Force is a rational. Assert this at the type level if you can, and in a
  property if you cannot.

## Layer 3 — replay fixtures

A match is an initial state plus an ordered list of moves. Because the core is
pure, replaying it must produce a byte-identical final state.

```
replay(initialState, moves) === expectedFinalState
```

This is the highest-leverage test in the repo:

- One fixture exercises hundreds of rule interactions per line of test code.
- It is the **only** reliable detector of accidental nondeterminism. If a replay
  drifts after a refactor, you introduced an ordering dependency — find it.
  Do not re-record the golden. Re-recording a drifted golden is how a desync bug
  ships.
- It makes regressions legible: the diff points at the exact turn.

Keep a small library of fixtures covering the interactions that are hard to hit
by construction — a cut landing mid-pincer, a fork whose arms land on different
turns, an accumulator captured at 11/12, a closure that swallows enemy heads.

## Fixture boards, not the real tiling

Until SPEC §11 items 1/5/16 are measured, test against **small hand-authored
boards** with known adjacency:

- `single-pinwheel` — one triangle, one vertex. The minimum legal closure.
- `two-pinwheels` — the smallest board with a real crossing decision.
- `micro-torus` — smallest board that wraps, for the balance properties.

They make failures readable, they run instantly, and they keep passing unchanged
once generated geometry lands behind the same port. Reserve the extracted tiling
for the geometry package's own tests.

## Determinism checklist

Before calling anything done, confirm none of these are in the core:

- `Date.now()`, `new Date()`, `performance.now()`
- `Math.random()` or any PRNG without an explicit seeded, spec'd purpose
- iteration over a `Set`/`Map` whose insertion order depends on input order,
  feeding an ordered decision
- `Array.prototype.sort` without a **total** comparator (ties must break on a
  stable, meaningful key — arrow id, not object identity)
- floating-point accumulation where the spec says rational

The last two are the ones that survive review. Both show up as replay drift.
