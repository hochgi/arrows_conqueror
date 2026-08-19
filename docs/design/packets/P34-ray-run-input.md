# P34 — Ray-run route input (draft the trail, then send)

> **Status:** ready. **Depends on:** P11, P31.
> Playtest: a stack big enough to walk 3+ steps has several equally short
> routes to the same arrow, and the adapter silently picks one — so the
> player commits to a trail they did not author. This packet replaces
> destination-picking with **route-drafting**, which removes the category
> rather than disambiguating it.
> **Not a game-rule change.** `rules-core`, contracts DTOs and the `Move`
> shape are untouched: a move is still one portion, one step, one arrow.
> **One SPEC.md prose edit is in scope** (§5's last line — see below).

## Why the ambiguity exists (the maths this packet leans on)

`OUT_DIRECTIONS` gives each point three out-arrows, 120° apart, summing to
zero. So a route is a **word over three letters**, and:

- Because the three vectors sum to zero, walking all three letters returns to
  the same point — that is the girth-3 cycle. A shortest route's **prefix**
  therefore uses at most two distinct letters.
- A destination is an **arrow**, i.e. (origin point, grain). The destination
  fixes the word's **last** letter; the prefix's letters may be in any order.

> **Routes to a destination = orderings of the route word's prefix**, so the
> count is `C(n−1, a)`.

Measured on the generated tiling, this predicts every observed number exactly:
distance 2 → 1 route (never ambiguous), 3 → up to 2, 4 → up to 3, 5 → up to 6,
6 → up to 10. Ambiguity begins at **distance 3** (a 4-stack), not at 8 heads.

The consequence the input model is built on, verified against 138 destinations
to depth 6 with zero disagreement:

> **A destination has exactly one route iff its route is "straight along one
> grain for any number of steps, then optionally one turn at the end."**

There are exactly **9** such destinations at every distance ≥ 2 (3 grains × 3
final turns). Two corollaries the implementation should not re-derive:

- Everything within **2 steps** is unique-route (its word is `d·e`, prefix of
  length 1, one ordering). This is why the last hop never needs constraining.
- Clicking along rays is **run-length encoding of the route word**. Click count
  = number of runs, so straight is one click, a dogleg is two, and exotic
  interleavings cost what they are worth. Of the three routes to a given
  distance-4 arrow — `ddee`, `dede`, `edde` — the costs are 2, 4 and 3 clicks.
  The common intent is the cheapest.

Rays are geometrically straight: `pointPosition` is `world(i, j)`, linear in
the lattice, so a constant-grain walk is exactly collinear on screen and the
three rays sit 120° apart. The affordance is a real line, not an approximation.

## Intent

Selecting a stack today paints every reachable arrow; clicking one opens a
portion dialog and the adapter walks a route it chose by `outArrows` iteration
order. This packet replaces that with drafting:

Pick a stack → the three **rays** light up → click along a ray to append a
**run** to a drafted route → repeat from the new tip → **Send**. Nothing
touches the board until Send. Every arrow in the drafted route was named by a
click, so no route is ever chosen by the engine.

## Vocabulary (this packet)

| Term | Means |
|---|---|
| **run** | one straight leg of a route: `k` steps along a single grain |
| **ray** | the straight line of arrows reachable from the tip along one grain, truncated by allowance and by the engine |
| **turn arrow** | a one-step turn off a ray arrow — the "optionally one turn" of the unique-route rule |
| **tip** | the last arrow of the drafted route, or the source arrow when the draft is empty |
| **carry** | how many heads travel from the tip; the rest stay as a sentry (§5) |
| **draft** | the route so far — an ordered list of moves, applied to nothing |

## BSSN (locked here)

### The `route` input phase replaces `portion`

- `InputPhase` gains `route` and **loses `portion`**. A destination click no
  longer opens a modal.
- `route` carries: `from` (the original source), the ordered `draft` moves, the
  current `tip`, the current `carry`, `tipHeads`, and the built `offer`. It does
  **not** carry a `remaining` step count — the ray's painted length is the
  display, so no numeral can disagree with the rays.
- Selecting an own stack enters `route` with an empty draft, `tip = from`, and
  `carry = ` all heads on `from`.
- `Send` emits the draft as `pending` — a batch of `step` moves, exactly as a
  multi-step trip does today. `Cancel` (and background click, and Escape)
  discards the draft and returns to `idle`. Nothing is applied before Send.
- With an **empty** draft, clicking the source arrow deselects (today's idiom,
  unchanged).

### What is clickable

- The clickable set from the tip is exactly the **unique-route set**: for each
  grain `d`, the ray arrows the engine accepts hops for; and off every ray arrow
  but the last, its two turn arrows (the third is the ray's own continuation).
  Equivalently: `d^m` and `d^m·e`.
- **No two-steps-left special case.** The unique-route set already covers
  everything reachable within 2 steps, so the general rule subsumes it. Do not
  write the special case.
- Clicking a clickable arrow appends that run (plus the final turn, if any) to
  the draft and moves the tip there.
- Clicking an arrow **already in the draft** pops the draft back to it — that
  arrow becomes the tip and everything after it is discarded. Popping to the
  source leaves an empty draft, still in `route`.
- Everything else refuses with a reason, through the existing `RefusalReason`
  path (P11 Event 11). A click beyond a truncated ray is `out-of-reach`.

### Rays are truncated by the engine, never by `speed()`

- Ray and turn-arrow enumeration is **measured by walking `rules.apply` on a
  scratch state**, exactly as `reach.ts` already does. `speed(carry)` only
  bounds the search.
- A ray stops at the first hop the engine **refuses**: enemy territory without
  territory-grade protection (§6.3), a P28 refused self-convert exit, allowance
  running out, a revisit, and an attack that would empty the tip.
- **The stay-behind rule bounds attacks** (corrected after phase 2 measured it).
  §6.2 / §11 item 38: an attack may not empty the arrow it comes from. A run
  carries the whole carry, so past its first hop the tip holds exactly the carry
  and a mid-route attack is always refused — a ray therefore ends **before** an
  enemy-held arrow at distance ≥ 2. An adjacent enemy arrow is offerable only
  while `carry ≤ tipHeads − 1`, which makes the carry control also the way an
  attack is armed. New `RefusalReason` `needs-stay-behind` says so when that is
  the only obstacle.
- A ray also stops at a **terminal step** — one the engine *accepts* but whose
  effect an un-applied draft cannot show: a merge into the player's own group
  (§3), a closure claiming ground (§7), or combat resolving (§6.2). A terminal
  tip offers nothing further; Send or pop. Detected by comparing the scratch
  state before and after the hop, never from engine internals. The closure case
  is this feature's own rule, not a consequence of refusal — phase 2 measured
  that the engine *accepts* the hop after a closure lands.
- A painted ray must never extend past its truncation point. This is the
  defect that would recreate the original complaint.

### Carry lives on the tip, inline

- A control anchored at the tip sets `carry`, defaulting to **every head
  standing on the tip**. Heads not carried stay put — that is the sentry, and
  §5 wants that decision available at every step rather than at authored
  moments.
- Changing `carry` **repaints the rays live**: fewer heads, shorter rays. That
  repaint is how the player learns that distance is bought with heads (§3).
- `carry` is chosen **at the tip, forward only**. It never applies
  retroactively to an earlier run, so a carry change can never invalidate an
  already-drafted leg. (Retroactive splits would: 8 heads that walked 2 steps
  and then drop to 4 have `speed(4) = 3` and 2 spent, so 1 step left, not 2 —
  silently trimming a drawn tail.) Any split pattern is still expressible,
  because it is expressible in walk order.
- Allowed carries are the ones that **arrive**, measured by simulation, exactly
  as `reach.ts` measures `minCount` / `maxCount` today. Offering a carry that
  cannot move is the fastest way to make a correct rule look broken.
- The modal `PortionSlider` is **retired from this flow** — a modal backdrop
  over the board you are drawing on is the wrong shape. If nothing else
  references the component after the change, delete it; check the online path
  before doing so.

### Paint (three tiers, quietest first)

- **Full reach**, faintest: every arrow the carry could reach this turn, from
  `reach.ts`, at P31's quiet-wash floor. Present so a shrunken *clickable* set
  never reads as a shrunken *reach*.
- **Rays**, primary: a continuous lit spine along each of the three grains.
  Turn arrows are a subordinate mark off the ray, not full ray weight.
- **Draft**, strongest: the route committed so far, reading as the trail it will
  become.
- Hovering a clickable arrow (fine pointer) previews the set that would be
  clickable **from there** — recursively the same rays-plus-one-turn shape.
  Coarse pointer gets no hover preview; the model needs none, because every
  clickable arrow is unambiguous.
- P28's refused wash, P29's match-over drop, and P31's selected halo stay as
  they are.

### Performance

- Build the walk tree **once per selection / carry change** and index it;
  a bound of 6 gives `3^6 = 729` walks. Do **not** recompute reach
  per hovered arrow — hover lag is what would make this model feel broken.

### Purity and determinism

- One pure helper module (`packages/web/src/route.ts`): equal state + tip +
  carry → equal rays, turn arrows and draft. No `Date.now`, no `Math.random`.
  The draft state machine stays in `input/modes.ts`.
- `reach.ts` stays, as the faint full-reach tier and as the simulation
  precedent. Its `plans` map — the thing that used to pick a route — is no
  longer consulted for route choice.

### SPEC.md

- §5's last line currently reads: *"The interaction model is Galcon-like: pick
  a source arrow, pick a destination, send a portion."* Replace it with the
  drafting model, and say that a move is still one portion / one step so the
  rules model is unchanged. Two sections disagreeing is worse than either being
  wrong.
- No §11 item is opened or closed by this packet. If phase 1 finds a game-rule
  gap, escalate rather than deciding.

## Found in the browser pass, deferred (not defects)

The first playable pass on the generated board confirmed the model: three
collinear rays 120° apart, 12 clickable arrows at `speed 2` (6 ray + 6 turn),
drafting logging zero moves, pop restoring the tip and its allowance, Send
applying as one batch, and the carry stepper live-shortening the rays. Two
notes came out of it:

- **The tip panel overlaps clickable arrows.** `.route-tip` sits just below the
  tip, which is where one of the three rays points, so at `speed 2` four of the
  twelve clickable arrows are painted under it. Clicks still land — the panel is
  `pointer-events: none` except on its own widgets, and no arrow centre sits
  under a button — so this is legibility, not function. It gets worse with
  longer rays at higher carries. Follow-on: place the panel away from the lit
  rays, or off the board entirely.
- **The finished-draft hint was a lie and is fixed here**, not deferred: the
  drafted hint said "click to extend" at a tip with an empty clickable set.
  `ROUTE_HINT_FINISHED` and its scenario landed in this packet.

Not verified in the browser: the stay-behind offer and the terminal tips. The
opening board has no adjacent enemy and building one takes many turns, so both
are measured headlessly instead — 9/9 stay-behind refusals and 18/18 ray-ends
in the invariants suite, plus all three terminal effects.

## Out of scope

- `rules-core`, contracts, `Move`, `speed(N)`, legality — any of it changing is
  a signal to kick back, not to edit around.
- **In-turn undo.** Drafting makes a mis-click free, which is why undo is not
  needed here. It remains worth having on its own (it would also let a
  *sent* route be taken back) — follow-on, and it has to reconcile with the
  match log and with online play, where a burst is already PUT to a server.
- Numeric price ruler along the ray (`1 · 2 · 4 · 8`). The live ray repaint on
  carry change teaches the same fact with less ink — revisit after playtest.
- Bots: `findings`, `opponent`, `byokBot`, `targets` generate moves through the
  rules directly and are unaffected.
- P30 playback pacing. A human's sent route applies as a batch today and keeps
  doing so; whether a 4-step route wants step pacing is a separate question.
- Board pan/zoom gestures, drag-to-draw, keyboard route entry. All plausible
  follow-ons on top of this model; none of them is this packet.
- Screenshots / visual regression.

## Scenario inventory

Route drafting

- Selecting an own stack enters `route` with an empty draft and the tip on the source
- The three rays are painted from the tip, 120° apart
- Clicking a ray arrow at distance `k` appends a `k`-step run to the draft
- The tip moves to the clicked arrow and its head count is read from the state after the draft
- A second ray click from the new tip appends a second run
- A straight route of any length is one click
- A dogleg route is two clicks
- Nothing is applied to the board until Send
- Send emits the draft as an ordered batch of `step` moves
- Cancel discards the draft and applies nothing
- Background click and Escape both cancel
- Clicking the source with an empty draft deselects

The clickable set

- Every arrow within 2 steps of the tip is clickable
- A ray arrow at distance 3+ is clickable
- A "straight then one turn" arrow at distance 3+ is clickable
- An arrow at distance 3+ needing two runs is **not** clickable
- Exactly 9 unique-route destinations exist at each distance ≥ 2
- Every clickable arrow has exactly one route
- No two-steps-left branch exists in the clickable-set computation
- Clicking a non-clickable reachable arrow refuses with `out-of-reach`
- Clicking an enemy stack with nothing selected refuses with `not-yours`

Popping

- Clicking a drafted arrow pops the draft back to it
- Popping rebuilds the offer for the shorter draft
- Popping to the source leaves an empty draft, not `idle`
- After a pop, rays repaint from the restored tip

Truncation and terminal steps

- A ray ends before an enemy-held arrow two or more steps out
- An adjacent enemy arrow is offered only while the carry leaves a sentry
- The refusal names `needs-stay-behind` when that is the only obstacle
- A terminal tip (merge / closure / combat) offers nothing further
- A terminal tip can still be sent and still be popped
- Popping off a terminal tip restores a live tip
- A ray stops at an arrow holding own heads (merge ends the run)
- A ray stops where a closure lands mid-path
- A ray stops at enemy territory without territory-grade protection
- A ray stops at a P28 refused self-convert exit
- A truncated ray paints no arrow past its stop
- Clicking past a truncation refuses rather than sending a short run

Carry

- Carry defaults to every head on the tip
- Lowering the carry shortens the rays
- Raising the carry lengthens the rays
- Heads not carried stay on the tip after Send
- Only carries that arrive are offerable
- A carry change never trims an already-drafted leg
- Carry on a new tip defaults to every head arriving there

Paint

- Full reach paints faintest, rays primary, draft strongest
- Turn arrows paint subordinate to their ray
- Fine-pointer hover on a clickable arrow previews the set clickable from there
- Coarse pointer shows no hover preview
- P28 refused wash still paints
- P31 selected halo still paints
- P29 match-over still drops this chrome

Purity

- Equal state + tip + carry produce equal rays and turn arrows
- No clock or RNG in `route.ts`
- Rays are measured through `rules.apply`, not from `speed()` alone
- The walk tree is built once per selection, not per hover
