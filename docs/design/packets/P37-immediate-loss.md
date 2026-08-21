# P37 — A loss resolves when it happens, not at the next boundary

> **Status:** ready. **Depends on:** P36. Touches `rules-core` and **SPEC.md §9, §11 item 44**.
> Playtest report, 2026-08-20, 6-player hot seat, seat D:
> `conquarrow-match-2026-08-20T142811-462Z`. Reproduced by replay against
> `main` @ `253a359`.

## The report, and the measurement

> "After encirclement of last enemy territory, game did not end with a win. I
> could still move unit stacks and only after clicking end turn the game ended
> and I won."

Replayed against current `main`, seat E is the last enemy and the timeline is
exact:

| move | seat | what |
|---|---|---|
| 1240–1242 | **D** | a three-step run. **At 1242, E reaches zero territory — the match is decided here.** |
| 1243 | D | ends turn |
| **1244** | **E** | **already lost, takes a turn and moves a head** |
| 1245 | E | ends turn |
| 1246 | F | ends turn → rotation reaches `players[0]` → boundary → losses resolve → `winner = D` |

Four moves and three end-turns between the winning move and the win, with a dead
opponent moving in between. `winner` is first set at move 1246 of 1247, matching
the `winner: "D"` the log itself recorded — so this is current behaviour, not an
older build.

## This is P36's phase-1 decision, not an implementation defect

The human's rule said **"no territory at all ⇒ immediate loss"**. P36's phase 1
reinterpreted *immediate* as "no grace period, resolved at the round boundary",
on three grounds: turn atomicity with respect to removals, the boundary being
where accrual and the starvation tick already run, and mid-step evaluation
coupling the loss rule to every movement fixture. It even predicted this exact
symptom in `losing-conditions.md`:

> a seat that loses its last territory may still take the remaining turns of that
> round.

The playtest says the reading was wrong. From the player's seat you make the
winning move and the game refuses to acknowledge it, which is the one moment a
turn-based game must not be vague about.

**The fixture argument now cuts the other way.** 8 of 39 `rules-core` test files
(all of `movement.*`, `combat.*`, `crossings.*`) author players with heads and no
territory. §8 says a player holding no territory is an *unplayable position that
setup must prevent* — so those fixtures have been authoring illegal states all
along. Giving them territory fixes the fixtures rather than working around the
rule.

## The change

**Resolve losses after every applied move**, not only at the full-round boundary.

- `apply` ends with `resolveLosses` for every move kind.
- The boundary keeps its order: accrue → tick streaks → resolve losses. Streaks
  still advance only at a boundary, because a streak counts *rounds*; only the
  resolution moves.
- Consequences, all wanted: the match ends on the move that decides it; a seat
  that can never claim again never takes another turn; and `winner` can now be
  set mid-turn, which the adapter already handles (`controlsLocked` reads
  `winner`).

Turn atomicity is given up deliberately. A step that costs another seat its last
territory now changes the board mid-turn — which is the honest reading: the
board should show the consequence of the move that caused it.

## §11 item 44 — resolved by dissolution

The human's argument, verified: **no path can un-own a spawner share**, so at
least one seat is always alive and the zero-survivor state is unreachable.

The chain, each link checked against the code:

1. Every seat opens owning **3 shares and 3 territory arrows** — the opening
   3-stack loop *is* the home spawner's triangle (measured at `playerCount`
   2, 3 and 6).
2. `closure.ts` only ever does `territory.set(arrow, mover)`. Territory changes
   hands; it is never cleared there.
3. `vanishSeat` is the **only** path that removes territory entries, and by
   invariant 22 a vanishing seat never owned a share — so a vacated arrow is
   never a share.
4. Therefore some seat always owns a share, and `S > 0` places a player in an
   alive row of the §9 table, so that seat is never lost.

**Mark it resolved by dissolution and pin the chain**, rather than deleting it.
Link 3 was introduced by P36; if a later packet makes territory revert to unowned
somewhere else, or setup stops granting the home triangle, the state becomes
reachable again and the failure mode is the unbounded auto-pass spin item 44
already documents. An invariant makes that a red test instead of a hang.

## BSSN (locked here)

- New invariant: **some player always owns a spawner share**, hence **at least
  one seat is never lost**. Quantified over the opening state and over every
  state a replay passes through.
- Loss resolution stays deterministic and ordered by `state.players`; resolving
  more often must not change *which* seats are lost, only *when*.
- `resolveLosses` runs per move now, so it should read each player's territory,
  share and head counts in **one pass** rather than per-player scans. Measure
  the replay of the attached 1247-move log before and after; report it.
- No change to the four-case table, to the starvation threshold, or to what a
  share is.

## Out of scope

- SPEC §11 item 45 (flicker-then-fade on vanish) — **resolved by P39.**
  Adapter-only; this packet does not present it.
- Retuning `dominationN`.
- Any change to closure, cuts, conversion or accrual.

## Scenario inventory (for phase 1 to expand)

- A closure that takes the last enemy territory sets `winner` on that step.
- The losing seat's heads and trail are gone in the state that step returns.
- No seat takes a turn after the move that lost it.
- A seat that loses its last territory mid-way through an enemy turn does not
  act again, and the enemy's remaining allowance is unaffected.
- A seat reaching the starvation threshold is still lost at the boundary, since
  the streak ticks there.
- Some player owns a spawner share in every state of a replay.
- At least one seat is not lost in every state of a replay.
- The attached 1247-move log replays to `winner = D`, set on move **1242**, not
  1246.
- The 8 fixture files that authored no territory now author a home triangle, and
  their assertions are otherwise unchanged.
