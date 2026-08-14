# P30 — Local AI move playback (gap between moves)

> **Status:** shipping. **Depends on:** P11, P12-as-heuristic (web `opponent.ts`), P15.
> Playtest: when the AI moves, it happens too fast — the **order of operations**
> is the thing you need to see (a cut, then the evaporation, then the next
> step). Not a game-rule change. Do **not** edit SPEC.md, `rules-core`, or the
> P18 online heuristic burst.

## Intent

`playBotTurn` / `playLlmBotTurn` already plan a **whole turn** as an ordered
move list. `App` then `commitApplied(moves, next)` once, so the board jumps
start-of-turn → end-of-turn. The existing `setTimeout(..., 30)` is only a
think pause before that burst.

This packet **plays the planned list back** one `apply` at a time with a short
gap between moves, so evaporation FX and occupancy can follow the sequence.

## BSSN (locked here)

- **Local heuristic + BYOK only.** Online heuristic stays one Lambda put + one
  WS `stateChanged` (P18). Do not stagger online AI on the client.
- **Plan once, play back.** Do not re-run `playBotTurn` / `playLlmBotTurn` per
  step (BYOK cost; also a different search at each occupancy).
- **Gap 400ms** (`BOT_PLAYBACK_GAP_MS`) between consecutive playback steps.
  No sleep after the last move. The existing ~30ms think pause before planning
  stays; it is not an extra gap before the first step.
- **Per-move `commitApplied([move], after)`** so evaporation FX diffs
  consecutive states, not the whole turn.
- **Inject `sleep`.** The helper does not call `Date.now`, `Math.random`, or
  `setTimeout`. Tests pass a recording stub.
- **Do not restart playback when occupancy changes.** The effect starts when
  the active chair becomes a local AI seat (`localAiChairKey`). Cleanup still
  cancels on lobby / unmount / chair change / winner.
- **BYOK stats** attach on the **last** `commitApplied` of the playback, not
  per step.
- **Skip** in the middle still takes the gap — order of operations includes
  “this stack skipped.”
- **`botBusy` stays true** for the whole playback so input stays locked.

## Out of scope

- Changing `chooseMove` / `playBotTurn` search (still one burst plan).
- Online P18 burst, WS, Lambda.
- Human auto-pass (`passIfExhausted` at 0ms).
- `prefers-reduced-motion` shortening the gap (this delay is comprehension,
  not decoration).
- SPEC.md game rules. `packages/rules-core`.

## Scenario inventory

- Planned moves apply in listed order
- Sleep between consecutive moves, not after the last
- First move applies before any inter-move sleep
- Empty list is a no-op
- Single-move turn does not sleep
- Local AI chair key is the active AI player
- Occupancy change does not change the chair key
- Playback of a planned turn matches folding `apply` (replay)
- Cancel before first apply leaves start unchanged
- Cancel during a gap does not apply later moves
- Skip in the middle still waits the gap
- Online / winner / human have no local AI chair
- Sleep is injected; helper does not call a clock
- Equal start+moves yield equal intermediate states
