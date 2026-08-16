# P32 — Match summary telemetry (steps / closes / cuts)

> **Status:** in flight. **Depends on:** P11, P29 (HUD match-over), P10 (log shape).
> Playtest: after a match, reviewers want a one-line count of what happened —
> steps, end-turns, closes, cuts — without opening the downloaded JSON.
> Adapter-only. Do **not** edit SPEC.md, `rules-core`, contracts DTOs, or ADR 0002.

## Intent

The match log already stores setup + ordered moves (P10 shape). It does not
summarise them. A reviewer finishing a hot-seat or vs-bot game has to replay
the JSON to learn whether anyone closed or cut.

This packet folds lightweight counters on each logged apply and shows one
line under "Moves logged" **only when the match is over**.

PR #14 started this and left `App.tsx` truncated (`App restore incomplete`).
This packet restores the app, tightens the cut heuristic, and lands the
missing spec → tests.

## BSSN (locked here)

- **Adapter reading, not a rules event.** `closes` / `cuts` are playtest
  proxies from before/after `GameState` maps. They are **not** SPEC §7
  closure events or §6 cut events. Do not add fields to `GameState`.
- **Close** = some player's territory *count* increased
  (`|{ arrows | territory[arrow] = p }|` grew). Includes land bridges,
  enclosures, and conversion that nets that player tiles. Owner-swap that
  grows B is a close even if A shrank.
- **Cut** = some player's trail *size* decreased **and that same player
  did not gain territory in the same batch**. Claiming your own trail on
  a close is therefore **not** a cut. An enemy whose trail evaporated
  without gaining territory is a cut. Close + enemy evaporation in one
  batch increments both.
- **Steps / end-turns / skips** count move kinds in the logged batch
  (`step` / `endTurn` / `skip`). Unknown kinds are ignored (none exist).
- **`firstCloseAt`** = index into `log.moves` of the **first move of the
  batch** that first grew anyone's territory (`movesLoggedBefore`). Unset
  until then; sticky after. Not the index of a particular step inside a
  multi-move batch.
- **Empty batch** (`moves.length === 0`) is a no-op: log and summary
  unchanged.
- **Format (locked):**
  `{steps} steps · {endTurns} end-turns[ · {skips} skips] · {closes} closes · {cuts} cuts[ · first close @ move {i}]`
  Skips appear only when `skips > 0`. First-close suffix only when set.
- **HUD:** `matchSummaryLine(over, summary)` is the formatted string iff
  `over` is true and `summary` is defined; otherwise `undefined`. Hud
  renders `<p className="meta match-summary">Summary: …</p>` only when
  the prop is defined. In play the line is absent even if counters are
  non-zero.
- **Load:** missing `summary` on an older stored log → `emptyMatchSummary()`.
  Malformed JSON → `undefined`. Do **not** reconstruct counters from
  moves (the states are gone).
- **Fold is pure.** One scan of `territory` per state, one pass over
  trail maps. No `Date.now`, no `Math.random`. Equal before/after/moves
  → equal summary.
- **App restore.** `packages/web/src/App.tsx` is the full P31 shell plus
  this wiring — not a stub. `record` takes `beforeState` and uses
  `appendMovesWithSummary` when it is present. Both local `commitApplied`
  and the online submit path pass `before`. Delete `AppMain.tsx` (shim;
  `main.tsx` already imports `./App`).
- **Keep `appendMoves`.** It appends moves and does **not** fold. App
  must not use it for play.

## Out of scope

- Changing apply, victory, evaporation, or fill.
- Online protocol / match-log schema on the wire.
- New FX.
- Reconstructing summary from a moves-only log.
- Per-player breakdown on the HUD (download JSON is enough).
- SPEC.md, `rules-core`, contracts, ADR 0002.

## Scenario inventory

- New log starts at zero counters
- Step / endTurn / skip increment their fields
- Territory gain is a close
- Enemy trail shrink without that player gaining territory is a cut
- firstCloseAt is the batch-start index
- Format is the locked one-line string
- Empty list is a no-op
- Match over shows the summary line
- In play the summary line is unset
- Own-trail claim on close is not a cut
- Close + enemy cut in one batch counts both
- Owner-swap that grows B is a close
- New trail (size 0 → n) is not a cut
- firstCloseAt is sticky
- Zero skips omitted from format; positive skips included
- Load missing summary → empty counters
- Load malformed JSON → undefined
- Serialize includes summary
- App still mounts Board and Hud (not the restore stub)
- Online record folds when before is known
- Equal fold inputs yield equal summaries
- Fold helper has no clock / random
- rules-core is unchanged
