# P31 — Quieter selection chrome (reach, cost, path, selected)

> **Status:** in flight. **Depends on:** P11.
> Playtest: reachable-destination marks are too strong — six bright cyan
> tiles plus a min-count numeral on each overloads the board. Not a
> game-rule change. Do **not** edit SPEC.md, `rules-core`, or contracts DTOs.

## Intent

After picking a stack, every legal destination currently paints a solid cyan
wash and, when the trip costs more than one head, a white numeral. The
selected stack only pulses. Opening the portion slider still leaves every
other destination lit.

This packet quiets the reach marks, hides the cost until hover (desktop) or
the dest tap that opens a dialog (touch), lights **only the path** while a
send dialog is open, and makes the selected stack read without relying on
pulse. Unique-portion trips that today auto-apply without a dialog get a
**confirm** (no slider) when the unique count is greater than 1 — the
`2^k` stack travelling `k+1` arrows case.

## BSSN (locked here)

- **Quiet reach wash.** Source phase still marks every reachable dest, but
  the wash peaks at `reachOpacity(1) = 0.22` and floors at `0.08` (was
  `0.62` / `0.16`). Fade with distance stays monotone. Stroke is a thin
  cyan rim, not a second solid fill.
- **No min-count numerals at rest.** `minCount` is not drawn on reach dests
  in the source phase. A dest whose `minCount` is 1 never shows a numeral
  (adjacency already says so).
- **Fine pointer (mouse):** hover a reach dest with `minCount > 1` → show
  that dest's numeral only. Leave hover → hide it. Hover path pulse is
  unchanged (P11).
- **Coarse pointer (touch):** no numerals while browsing dests. After the
  dest tap that opens a commit dialog, show `minCount` on that dest if
  `> 1`. That is the "on tap, before / as the slider opens" reveal.
- **Path-only while a send dialog is open.** Portion or confirm: paint
  selected + path (and the dest as part of the path). Do **not** paint
  other reach washes. Hovering another dest does not restore them.
- **Commit kind from the allowed set, not from a new input phase.** Keep
  `phase.kind === 'portion'` for both skins.
  - unique allowed portion `=== 1` → **auto-apply** (scout step; no dialog)
  - unique allowed portion `> 1` → **confirm** dialog (Cancel / Send N,
    no range). Example: stack of `2^k` to distance `k+1`
  - two or more allowed portions → **slider** (unchanged)
- **Same dialog shell.** Confirm reuses `PortionSlider` chrome (backdrop,
  400ms ghost-tap grace, Escape/Enter). Hide the range and min/max scale
  when `allowed.length === 1`.
- **Selected stack: static halo, not pulse-only.** Cream outer stroke
  `#f4efe4` at width `4.8`, plus a warm wash `rgba(255, 236, 180, 0.30)`.
  Keep the existing pulse as extra. `prefers-reduced-motion` still kills
  the pulse; the halo and wash stay. Movable gold outline is not this.
- **One pure helper** (`packages/web/src/selectionChrome.ts`). Board / Hud
  / Galcon consume it. Equal phase + highlights + hover + pointer kind →
  equal paint. No `Date.now`, no `Math.random`.
- **Pointer kind is an input**, not a media-query inside the helper. App
  passes `'coarse'` when the last board pointer was `touch` or `pen`,
  else `'fine'`.
- **P28 refused wash and P29 match-over** stay as they are. Refused still
  paints in source phase. Match-over still drops play highlights.
- **Source is not a Galcon dest.** `select()` strips the source arrow from
  the reach map (`withoutSource`). A 4-head stack can simulate a loop onto
  its own tile, but a click on the source already deselects. `selectionPaint`
  also omits `selected` from `reachWash`. Keep the dest-map filter so
  `targets` / `reach` match the click: source is halo, never a send dest.

## Out of scope

- Changing `speed(N)`, reach simulation, or what is legal to send.
- HoMM input mode (removed; Galcon is the only mode).
- Auto-apply of 1-head trips (kept).
- Changing cancel to restore the source selection (still `reset()` → idle).
- SPEC.md, `rules-core`, contracts, online-api, ADR 0002.
- Screenshots / visual regression.

## Scenario inventory

- Source phase: quiet reach, no min-count numerals
- Fine hover on a priced dest shows that dest's min-count
- Fine hover on a minCount=1 dest shows no numeral
- Unique 1-head trip auto-applies
- Unique priced trip opens confirm, not slider, not pending
- Confirm Send applies the unique portion
- Multi-portion dest opens slider
- Commit dialog open → only path + selected washed
- Selected stack uses halo emphasis, not merely movable gold
- Cancel confirm/slider applies nothing
- Coarse source phase shows no min-count
- Coarse after dest tap shows min-count on dest if > 1
- Leave hover hides the numeral
- Hover a non-reach arrow shows no numeral
- During commit, hovering another dest does not restore reach wash
- `2^k` stack to distance 1 opens slider
- `2^k` stack to distance `k+1` confirms
- Confirm skin when `allowed.length === 1`
- Slider skin when `allowed.length` ≥ 2
- Equal snapshots paint equal min-count sets
- 1-head never opens confirm
- Quiet reach peak is 0.22; fade monotone; floor 0.08
- P28 refused wash still in source phase
- Match-over still drops this chrome (P29)
