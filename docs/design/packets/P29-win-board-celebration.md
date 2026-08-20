# P29 — Win board celebration (no splash)

> **Status:** shipping. **Depends on:** P09, P11, P08.
> Playtest asked to shine the winner's land with the yield-soon clip. Celebrate
> **on the board**: dim the rest, shine winner **shares**, pulse winner
> **stacks**. No splash. Not a game-rule change — do **not** edit SPEC.md §9,
> `packages/rules-core/src/victory.ts`, or contracts DTOs.
>
> **P36 supersedes the banner's *how* clause.** The locked string is now
> `{label} wins` with no mechanism; `VictoryHow` is retired. See
> `docs/spec/losing-conditions/losing-conditions.md` and the struck-through
> lines in `docs/spec/win-board-celebration/win-board-celebration.md`. P36 *did*
> rewrite `packages/rules-core/src/victory.ts` — for per-seat losing, not for
> this celebration.

## Intent

A win today is `{label} wins` in the HUD and a frozen SVG. End turn is
disabled; Skip group is not; `phaseHint` still talks about gold-outlined
stacks. This packet makes match-over readable on the board without lying
(yield-soon is a taught signal; spreading it across an empire is a lie) and
without covering the board the player just built.

## BSSN (locked here)

- **No splash.** SVG stays the surface. No overlay, no 0.66 backdrop, no extra
  dialog. Lobby / Download log already exist.
- **Celebrate shares and stacks, not land.** Victory shine = winner-owned
  **share** arrows (`geometry.borderArrows` of each `state.spawners` vertex
  where `territory.get(arrow) == winner`). Victory pulse = arrows holding a
  winner **group**. Winner territory that is not a share stays full chroma and
  does **not** shine. Include blockaded shares. Exclude unclaimed and
  loser-owned borders.
- **Same shine clip, winner-tinted.** Reuse `yield-shine-sweep` /
  `.yield-shine-band` / `YieldShine` clip-to-polygon. Peak colour is
  `styleFor(winner).fill` (not white). Full strength only — half-shine is
  yield-soon, not victory.
- **Suppress yield-soon while over.** Do not paint `yieldSoonByArrow` when
  `winner` is set. In play, yield-soon is unchanged.
- **Dim the rest at opacity 0.4.** While over, every arrow that is not
  (winner territory ∨ winner trail ∨ winner group) is dimmed. Loser numerals
  travel with the tile. Spawner marks keep current `spawnerProminence`.
- **How, from frozen state, no new fields.** `winner` unset → playing.
  `winner` set and exactly one player with heads > 0 → **elimination**.
  `winner` set and two or more players with heads > 0 → **starvation**. Do
  **not** use `dominationStreak >= dominationN` as the banner test.
- **Banner copy (locked):** `{label} wins — last head` /
  `{label} wins — starvation`. `label` is `styleFor(winner).label`. Em dash.
  Do not show the in-play starvation clock on this banner.
- **Hint while over (locked):** `Match over — pan to look around`. Pan/zoom
  stay live. Move input stays locked (already).
- **Skip group** is disabled when `winner` is set (End turn already is).
- **Drop play highlights while over.** Selected / reach / path / movable /
  preview washes SHALL NOT render. Victory pulse replaces selected-pulse.
  Evaporation bursts already on screen may finish; do not start new ones.
- **One pure helper** (`packages/web/src/fx/victory.ts`). Board and Hud
  consume it. Equal `GameState` + geometry → equal sets. Iterate spawners /
  arrows in the same stable id order as `yieldSoonByArrow`. No `Date.now`, no
  `Math.random`.
- **Local and online share it.** Both already render `GameState.winner`
  through the same Board / Hud. No online-api, ADR, or shell change.

## Out of scope

- Changing elimination / starvation / *N* / share counting in rules-core.
- SPEC.md §9 edits.
- Auto-pan, audio, confetti, particle systems.
- Viewport-wide second wash.
- Shining all winner territory or all winner-occupied arrows.
- First-person “You win” vs opponent copy.
- New HUD buttons. Replay viewer (P20). A reasons-enum on `RulesPort`.

## Scenario inventory

- Elimination banner `Player A wins — last head`
- Starvation banner `Player A wins — starvation`
- In play: no win banner, turn banner unchanged
- Winner shares shine; non-share territory does not
- Winner stacks pulse; loser stacks do not
- Yield-soon suppressed when over; still works in play
- Non-winner arrows dim; winner territory does not
- Hint `Match over — pan to look around`; Skip and End turn disabled
- Elimination with no shares: empty shine, pulse surviving stacks
- Blockaded winner share still shines
- Winner open trail is not dimmed
- Leftover starvation clock does not rename elimination
- Unset winner never dims / never pulses
- Play highlights vanish only when over
- Equal states (Map insertion order) list the same shine set
- Online finished boards use the same helper (GameState-only)
- No splash / modal / portion-backdrop
- Tests import no `applyElimination` / `tickDomination`
