# P39 — Flicker-then-fade when a seat vanishes

> **Status:** ready. **Depends on:** P36 (vanish clears), P37 (loss on the move),
> P38 (celebration waits for overlays), event-legibility (resolve/present).
> **Resolves SPEC §11 item 45.** Adapter only — `packages/web` FX and the P32
> cut proxy. Do not edit `rules-core`, contracts DTOs, or §6.1.

The human asked for **flicker-then-fade** when a seat vanishes. Item 45 asked
whether that should be a new §6.1 evaporation trigger. It is not.

## The decision

**The engine still clears.** Evaporation remains the destruction a cut causes
(§6.1). A lost seat's trail, heads and leftover territory are removed by
`vanishSeat` as P36 wrote them. Inventing a non-cut evaporation trigger is out
of bounds; this packet does not.

**The adapter no longer treats that clearance as a cut, and no longer lets it
pop.** Today's event layer names every trail drop that is not a self-claim as
`trailCut`, so a vanishing seat's remnants play `cutSnap` + `evaporate` — the
metaphor players were taught for *someone crossed this trail*. Territory that
reverts to unowned plays `lossRetract`. Heads that simply disappear name
nothing. Three wrong readings of one event.

Instead:

1. Name a **`seatVanished`** event from the before → after diff.
2. Present it as a **`seatVanish`** overlay: the remnants **flicker, then fade**,
   all at once.
3. Do not emit `trailCut` / `evaporate` / `cutSnap` for that seat on that step.
4. Do not count that trail drop as a P32 **cut**.

## Why a new metaphor, against the "ten metaphors" rule

`present.ts` says a new event picks an existing metaphor or it does not ship.
Reusing **evaporate** would teach vanish as a cut — the exact lie item 45 exists
to stop. Reusing **lossRetract** teaches "this ground changed hands", which is
false of leftover land that becomes unowned and says nothing about trail or
heads. The human named the reading: flicker-then-fade. One new metaphor, one
event.

The visual distinction from a cut is load-bearing: **evaporate staggers along
the trail from the cut arrow; vanish flickers every remnant cell together, then
fades them together.** No per-cell stagger.

## BSSN (locked here)

- **Diff, not `isLost`.** A player vanished on the step when they had at least
  one piece in `before` (a group they own, a trail arrow, or a territory arrow)
  and have none in `after`. The event layer does not re-run the §9 table.
- **Remnant cells** are the union of that player's dropped trail, territory
  arrows that became unowned, and groups that disappeared (not converted),
  excluding any arrow that `after` still holds as someone's territory or group.
  Captured land and converted stacks keep their own metaphors.
- **Empty remnant:** still emit `seatVanished`; `present` yields no overlay.
  The capture of last land already showed those arrows leaving.
- **Several seats:** one event each, in `state.players` order.
- **Already gone:** a seat with no pieces in `before` is not named again.
- **Timing:** offset 360 ms (after conversion at 300 and loss-retract at 260),
  duration 520 ms, no stagger. The 0 % keyframe is a visible ghost, so the delay
  holds the remnants rather than popping them. Do not retune any other `FX_MS`.
- **Tier 1.** Sound: one falling sine cue (392 → 147 Hz, 260 ms). Not
  `cutSnap`'s sawtooth snap.
- **P32:** a vanished player's trail shrink is not a cut. A living player's
  still is.
- **P38:** the vanish overlay joins the deciding move's queue; the celebration
  already waits for settle. Measured on a headline closure, vanish settles at
  880 ms, still under `captureFresh` at 1200. No retune of that ceiling.
- **`rules-core` is untouched.** Trails still clear. No new §6.1 trigger.

## Out of scope

- Any change to who is lost, when, or what `vanishSeat` removes.
- Retuning *N*, band radii, or any other `FX_MS` value.
- Drawing stack numerals on the ghost; a fill + chord in the seat's colour is
  the remnant.
- Online protocol / ADR 0002.

## Scenario inventory (for phase 1 to expand)

- Last territory taken: loser is `seatVanished`, remaining trail is not a cut.
- Captured arrows stay capture; converted stacks stay conversion.
- Starvation `endTurn` names vanish, not a cut attributed to the active seat.
- Mid-match vanish (seats remain) still flickers; `winner` stays unset.
- Two seats vanish: both named, `players` order.
- Genuine cut of a living player is still evaporate.
- P32 cuts do not increment on a vanish trail drop, and still do on a live cut.
- Equal diffs → equal events and overlay cell order.
