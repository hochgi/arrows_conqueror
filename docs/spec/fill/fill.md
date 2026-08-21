# fill — the pockets your own ground rings

**Packet:** [P05b — Closure, fill & land bridges](../../design/packets/P05b-closure-fill.md)
**SPEC:** §7 (*the fill needs a plane*, self-crossings claim what they ring), §2 (the
chord test), §6.1a invariant 3, §11 items 4, 16, 30, **36**
**Features:** [core](./fill.core.feature) · [edge cases](./fill.edge-cases.feature)
**Sibling:** [closure](../closure/closure.md) — which arrows get claimed first

## Purpose

**This is the subtlest logic in the game**, and the one place where a
wrong-but-plausible implementation produces a wrong answer rather than a crash
(§6.1a). It is also, after §11 item 36, much simpler than it was:

> **A pocket that cannot reach infinity past the player's own ground is enclosed.**

[closure](../closure/closure.md) claims the walked path first. This file then asks
one question of the board: *what did that leave surrounded?*

## Not even-odd — and the correction matters

§7 used to say *even-odd fill*, and item 36 records why that was wrong twice over.

Even-odd needs a **closed curve**. A claim is not one: it is bounded by the trail on
one side and by the player's existing territory on the other, so a probe cast from an
enclosed arrow can escape through the territory side having crossed the trail **zero**
times, and every enclosure reads empty. Adding territory to the boundary does not
repair it, because territory is a thick **region** — a probe that enters and leaves
crosses twice.

So the curve is removed rather than closed. The wall is the player's **ground**, and
the test is **reachability**:

| | even-odd (withdrawn) | reachability (chosen) |
|---|---|---|
| the wall | a curve through the trail's chords | the player's territory, after the path is claimed |
| the test | parity of crossings along a probe | can any walk escape to infinity? |
| degenerate probe | needs perturbing, and there are no coordinates to perturb | does not arise |
| two separate rings around one region | core is **outside** — two crossings, even | core is **yours** — plainly surrounded |

The last row is what made this a rules question rather than a discretization choice.
Re-walking one ring cannot produce that shape — a trail is a set and re-traversal adds
nothing (§6.1a invariant 2) — so it takes two distinct loops, and reachability gives
the answer a player would predict.

## The plane is still load-bearing

*Enclosed* means **cannot reach infinity**, so there has to be an infinity to fail to
reach. On a torus there is no escaping and no outside, so the notion is not merely
wrong there but **undefined** — which is the argument that made the board the
unbounded plane (§11 items 4 and 30), now in a cleaner form than the ray parity it
replaces.

It also still means **this suite cannot run on a fixture board.** A fixture is
finite, so nothing on it can fail to escape for the right reason, and the theorem
P02 measured — *straight-ahead is a bijection on a finite board* — is the same fact
seen from the other side.

## A pocket does not leak at a point

Reachability is over arrows: a walk steps between two arrows that share a point. Two
of the player's arrows meeting at a single point form a **barrier**, even though no
tile sits in the gap. That is §2's chord test, and it is the one piece of the old
formulation that survives intact:

> Two arrows touching at a single point do not form a barrier — that is the
> diagonal-leak problem from flood fill, and under a "did you land on a trail tile"
> rule an enemy could thread through the gap between two trail arrows without
> touching either, **making every enclosure in the game leak**.

So a step from arrow `X` to arrow `Y` through point `P` is blocked when the chord
`(X, Y)` **interleaves** with a chord the player's ground presents at `P`. Coincidence
cannot arise: `X` and `Y` are both non-territory, so they share no slot with a
territory chord — which is why `chordsInterleave` and `chordsCross` agree here and the
narrow one is used for consistency with §7's other caller.

## Bounded by the ground that rings, never by the board

§7: *fill is bounded by the ground doing the ringing, not by the board.* A closed run
of *L* arrows cannot surround more than `O(L²)`, so the sweep needs a `window()` sized
from that run — and there is no board extent to read instead (§11 item 4).

**The run, not the freshly walked path.** Existing territory is part of the wall, so a
one-arrow closure across the mouth of a C-shaped holding rings everything that holding
curls around. And the other way about: a second holding elsewhere on the board rings
nothing here, so it must not size or centre the sweep. Both follow from taking the
wall a pocket is *actually* ringed by — a run of the player's arrows that touch —
rather than the ground set entire.

The derivation lives in **one** place with its bound stated. A window one step too
small does not crash; it reports a pocket as escaping. That is this file's whole
failure mode, and the reason the bound is an invariant rather than a comment.

## Invariants

- The system shall report an arrow enclosed when no walk from it over arrows that are
  not the player's own escapes the claimed ground, and not enclosed when one does.
  Another player's territory walls nothing: it is walked over, and it is claimed
  (§7, *territory is contestable*).
- The system shall block a walk between two arrows sharing a point when their chord
  interleaves with a chord the player's ground presents at that point.
- The system shall report every arrow of an enclosed pocket enclosed, and no arrow of
  an escaping region.
- The system shall report the same verdict however the walk is routed.
- When the claimed ground rings a region with more than one loop, the system shall
  report the whole interior enclosed.
- The system shall report nothing enclosed for a claim that rings nothing.
- The system shall bound its sweep by the extent of the ground that does the ringing,
  and shall read no board extent. Ground that rings nothing shall not widen it.
- The system shall derive every chord through `slotOf`, and shall infer no slot from
  an arrow identifier.
- The system shall enumerate no vertex — **unchanged by P37.** Fill is measured on `enclosedBy` directly, which never reaches loss resolution, so this zero stays hard. Contrast `closure` and `cuts`, where the same sentence is measured across a whole `apply` and became a delta. See `docs/spec/immediate-loss/immediate-loss.md`.
- The system shall return equal results for equal inputs, whatever order the claim was
  built in, and shall change no state.

## What this file deliberately does not decide

- **Which arrows are claimed first** — [closure](../closure/closure.md). This file is
  asked only about ground that is already the player's.
- **What happens to what is inside** — closure claims the tiles, P07 converts the
  heads (§6.3).
- **How the sweep is implemented.** An outward flood from the window's fringe and a
  per-pocket escape search give the same answer; *the same verdict however the walk is
  routed* is the invariant that makes them interchangeable, and it is asserted.
