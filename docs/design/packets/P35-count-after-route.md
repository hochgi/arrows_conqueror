# P35 — Ask the count after the route, and off the board

> **Status:** draft. **Depends on:** P34 (route drafting), P31 (selection chrome).
> Mobile playtest of P34. Adapter-only: this is an input-order and layout
> change. Do **not** edit SPEC.md game rules, `rules-core`, or contracts DTOs.

## Intent

P34 shipped the route drafting model and was only ever driven with a mouse on
a desktop viewport. On a 375 px phone it reads badly, for three reasons that
are all the same mistake — the carry (how many heads travel) is asked for
**before** the route it has to pay for.

Observed on `games.hochgi.com/conquarrow`, 6-player hot seat, seat D, a
1-head stack:

1. **A control appears with nothing in it to decide.** `RouteTip` renders on
   `phase.kind === 'route'` with no further guard
   (`packages/web/src/App.tsx:1131`), so selecting a 1-head stack shows a
   stepper reading `1 / 1 · no sentry` whose `−` and `+` are both inert, over
   a Cancel/Send pair for a move with exactly one legal shape. **This is a
   P34 regression of a P31 rule** — P31 gave the unique-portion trip a
   confirm only "when the unique count is greater than 1", so count-1 trips
   used to apply on the destination click.
2. **It covers the offer it is asking about.** The panel is anchored on the
   tip in stage pixels. On a phone it lands on top of the rays, hiding part
   of the very set of arrows the player is choosing from. (Already measured
   during P34: it overlaps 4 of the 12 clickable arrows at desktop width.)
3. **It is asked twice, and the first time is too early.** The same panel
   shows at the source with an empty draft *and* at each new tip. The first
   appearance asks the player to plan a head budget before they have said
   where they are going — but distance is bought with heads (§3), so the
   legal floor on the carry is not knowable until the route is.

## The inversion

Ask **where** first, **how many** second:

- Rays are always painted at the player's **full** reach — the carry no
  longer shrinks the offer before a destination exists.
- Clicking names the route (unchanged from P34).
- *Then* the carry control appears, floored at the least count the engine
  accepts for **that** route and capped at the heads on the source.
- Send applies. Cancel discards.

The floor is not derived from `speed(N) = 1 + floor(log2 N)`; it is the least
count for which the whole drafted route validates under `rules.apply` on the
scratch state — the machinery `offerableCarries` in
`packages/web/src/route.ts` already has. Deriving it twice is how the two
copies come to disagree.

## BSSN (locked here)

- **Auto-apply when there is nothing to decide.** If the drafted route has
  exactly one offerable carry **and** the tip offers nothing clickable, the
  destination click applies the route immediately — no control, no Send.
  Restores the P31 rule. The 1-head stack is the canonical case: one
  offerable carry, and speed 1 leaves nothing to extend.
- **Dock the control, do not float it.** The carry stepper, Send and Cancel
  move off the board into a fixed strip **below** the board (thumb reach on a
  phone, one code path on desktop). The tip arrow keeps its halo for the
  spatial link. This retires the occlusion class of defect rather than
  nudging the rectangle out of the way.
- **No control before a destination.** With an empty draft the route phase
  paints rays and the hint only. `ROUTE_HINT_EMPTY` already says the right
  thing.
- **Tapping a walked arrow still pops the draft back to it.** P34 behaviour is
  kept in preference to the "re-tap a waypoint to split there" idea: with
  auto-apply in play, undo is worth more than a second meaning for that tap.
  **Nothing is lost by this** — P34 already gave each run its own count, so
  lowering the second run's count leaves a sentry at the junction. Mid-route
  splitting is a property of the per-run model, not a gesture that needs
  inventing. (The first draft of this packet expected to defer it; that was
  wrong, and the spec records the corrected reading.)
- **The count edits the run behind the click, not the run ahead of it.** That
  is the whole inversion: `extend` drafts at full strength and `setCarry`
  rewrites the last run. `RoutePhase` gains `runLengths` to name the run
  boundaries, because a flat `Move[]` does not record where a click ended and a
  single trailing length cannot survive a pop to an earlier boundary.
- **Full reach means the largest count that walks the run**, not "every head".
  §6.2's stay-behind refuses `count = heads` for an attack, so under "every
  head" an adjacent enemy is never clickable and attacking leaves the input
  model entirely. An arrow is clickable iff *some* count ≤ the tip's heads
  reaches it, and the run drafts at the largest such count — which makes the
  count control the thing that arms an attack, now that lowering the carry
  before the click is gone.

## Out of scope

- In-turn undo of an applied move. Auto-apply makes a mistapped 1-head move
  unrecoverable, which is a real cost accepted here; the fix is its own
  packet. Selecting the stack stays a separate, free, reversible tap.
- Hover preview. Already gated on `pointer: fine`, so it is absent on touch
  and nothing is regressed; a touch equivalent is not in scope.
- Any change to what a route may legally be.

## Scenario inventory (for phase 1 to expand)

- A 1-head stack: click stack, click adjacent arrow, move applies, no chrome.
- A 2-head stack one step out: two offerable carries, so the control shows.
- A `2^k` stack walking exactly `k+1` steps: `speed(2^k) = k+1`, so the
  allowance is exactly spent, the count is forced and nothing is clickable —
  **auto-applies**. (An earlier draft of this line said the control shows; the
  spec's *Auto-apply — the exact test* is the contract and the tests follow it.)
- Rays at full reach do not shorten as the carry is lowered *after* drafting;
  only the floor moves.
- The floor equals the least count `rules.apply` accepts for the drafted
  route, at distances 1..5.
- Lowering the carry below the floor is not offerable.
- The docked strip overlaps no clickable arrow at 375 px, 768 px, 1280 px.
- Empty draft paints no control.
- Cancel from the docked strip discards; the game state is untouched.
- Skip / end turn / match over interact with the docked strip as P34
  specified for the tip panel.
