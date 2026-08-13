# P04 — Movement, stacks & the turn loop

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §3 (heads, stacks, speed, merge cost, allowance), §4 (turn
> structure), §2 (movement follows the grain — via `GeometryPort` only).
> **Depends on:** P01, P02. **Unblocks:** P05, and thereby the rest of the rules
> chain. P10 can start once this turn loop exists.

## What this packet is for

The first rules packet. Everything before it answered *what is adjacent to what*.
This one answers *how heads move*: allowance, splitting and merging mid-turn, and
the ordered per-step turn model §4 chose so that no within-turn resolution order
had to be invented (§11 item 19).

It is also where `packages/rules-core` and the first slice of `RulesPort` appear.
P01 deliberately deferred both (P01 Q2): a speculative `apply` signature that
pretended to know closure resolution would have been a rule invented in type
form. P04 knows enough to land the seam for movement; later packets grow it.

## In scope

- `packages/contracts` — the **game-state DTO** and the **P04 slice of
  `RulesPort`** (`legalMoves`, `apply`). No economy methods, no closure.
- `packages/rules-core` — the pure engine behind that slice.
  `apply(state, move) -> state`. No I/O, no clocks, no randomness.
- Speed, spent, split inheritance, merge speed overrides, automatic merge on
  contact, skip, end-turn, player alternation.
- Tests against the P02 fixture boards (`minimal`, `spacious`) — every rule here
  is local, so a fixture hosts them (P02 measurement 2).

## Out of scope

- **Trails, sentries-as-garrisons, branch anchors** — P05 (§5). A step in P04
  relocates heads; it does not lay or cut a trail. The board under test is an
  occupancy map over a `GeometryPort`, nothing more.
- **Crossings, cuts, evaporation, combat** — P06 (§6). Stepping onto an
  enemy-occupied arrow is **not legal in this packet**; contested resolution is
  a later rule, not a movement one.
- **Territory, closure, fill, encirclement** — P05 / P07 (§7).
- **Spawners, accumulators** — P08 (§7). Spawn-at-turn-boundary merging (§11
  item 20) is therefore also out: there is nothing to spawn.
- **Match setup, placement, victory** — P09. Tests hand-author an initial
  occupancy; they do not run a draft.
- **Replay harness** — P10. This packet produces the turn loop P10 will replay;
  it does not land the harness.
- **Renderer / input** — P11.

## Decisions this packet fixes

**D1 — Occupancy is `(player, heads)` on an arrow, at most one owner.**
A stack is the count of one player's heads on one arrow (§3, §5). Two of the
same player ending a move on the same arrow merge automatically. An arrow held
by the opponent is enemy-occupied; an empty arrow is empty. There is no
"contested occupancy" shape in P04 — that arrives with combat (P06) and
blockades (P08).

**D2 — A step is legal only when all of these hold.**

1. It is the named player's turn.
2. `from` holds at least `count` of that player's heads.
3. `exit` is one of `outArrows(target(from))` — movement follows the grain (§2).
4. The group on `from` still has allowance: `spent < effectiveSpeed(group)`.
5. `exit` is empty or already held by the same player (merge). **Not** held by
   the opponent — that is P06.

`effectiveSpeed` is `speed(size)` unless a merge override applies (D4).

**D3 — Spent and size are per group, and composition changes have fixed rules.**
A **group** is the heads of one player on one arrow (§3).

- **On a split** (step with `count < heads`): both parts inherit `spent`. Only
  the moving portion pays `+1` spent for the step. The remainder may still act
  (§3, §11 item 22).
- **On a merge** (step onto own heads): arrivals' spent is discarded; the
  destination's spent is kept; speed is overridden per D4.
- **Spent does not survive the turn boundary.** End-turn zeroes every group's
  spent and clears every merge override.

**D4 — Merge costs the turn, exactly as §3 states.**

> A stack that merged this turn has speed 1 for that turn, and **speed 0 if any
> group that arrived was larger than what it joined.**

*Any* is load-bearing: once barred (speed 0), a later small arrival cannot
un-bar it. Equal counts still move (speed 1). Stated as a speed override, so
allowance arithmetic (`spent < effectiveSpeed`) needs no special case.

**D5 — Skip is a no-op on occupancy and does not consume spent.**
It names an arrow the current player occupies and declines to move (§4). It is
recorded (replay will care — P10) and is legal only for a group the player
controls. It does not bank (§11 item 20) and does not spend.

**D6 — The turn ends only via `endTurn`, and exhaustion makes that the only legal move.**
§4 says the turn ends when the player ends it, **or** when no unit has a whole
step left. Both readings share one port shape:

- `endTurn` is always an explicit move in the turn list (the DTO already
  requires it — P01).
- When no group of the active player has `spent < effectiveSpeed`, `legalMoves`
  returns **only** `endTurn`. The player (or a hot-seat adapter) still sends it.
- `apply(endTurn)` advances the active player, zeroes spent, clears merge
  overrides. It does **not** require that allowance was exhausted — ending with
  unused steps is legal (§4: skipping is normal).

This keeps "ended explicitly" true in the move list (what P10 replays) while
honouring exhaustion as a legality constraint rather than a hidden state
transition inside `apply(step)`.

**D7 — `RulesPort` grows; P04 lands the movement slice only.**

```
legalMoves(state): readonly Move[]
apply(state, move): GameState   // throws ContractViolation on illegal
```

No `resolveClosure`, no economy. Later packets extend the same port (or the
same `apply`) rather than inventing a second one. State is immutable; `apply`
returns a new state and never mutates its input (ADR 0001, P01 D5).

**D8 — Hand-authored fixture states, not a match setup.**
Tests build a `GameState` over `makeFixture(MINIMAL)` or `SPACIOUS` by placing
heads on named arrows. There is no "start of match" constructor in this packet.
P09 owns that.

**D9 — Foreign / absent identifiers fail loudly.**
Same discipline as geometry: an arrow id the board does not have, or a move
naming the wrong player's stack, is a `ContractViolation`, not a plausible
no-op.

## Invariants (EARS candidates)

- The system shall move heads only along the grain: `exit ∈ outArrows(target(from))`.
- The system shall refuse a step whose count exceeds the heads on `from`.
- The system shall refuse a step when `spent ≥ effectiveSpeed` for the group.
- The system shall give a fresh group of size `N` exactly `speed(N) = 1 + floor(log₂ N)` steps per turn, with nothing carried between turns.
- When a group splits, the system shall give both parts the parent's `spent`, and shall charge only the moving part for the step.
- When a group merges as a minority or equal arrival, the system shall set the merged group's effective speed to 1 for the rest of the turn.
- When any arriving group outnumbers what it joined, the system shall set the merged group's effective speed to 0 for the rest of the turn.
- Once a group's effective speed is 0 for the turn, the system shall not restore it on a later merge the same turn.
- The system shall merge two of the same player's groups on the same arrow automatically, with no extra move.
- The system shall refuse a step onto an opponent-occupied arrow (P04 scope; combat is P06).
- The system shall treat skip as legal for an owned group and shall not change occupancy or spent when it is applied.
- When no owned group has a whole step left, the system shall offer only `endTurn` as a legal move.
- When `endTurn` is applied, the system shall advance the active player and clear every spent counter and merge override.
- The system shall not mutate the input state of `apply`.
- The system shall return equal outputs from equal `(state, move)` inputs.

## Scenario inventory

Counts are a target for phase 1, not a contract.

- **Stepping along the grain** (≈4) — legal out-arrow; refuse a non-out; refuse
  over-count; refuse empty/foreign source.
- **Allowance** (≈5) — fresh speed table samples; refuse when spent out; multi-step
  by one stack; interleaved steps by two stacks; unused steps discarded on
  end-turn.
- **Split** (≈3) — partial step leaves remainder; both inherit spent; remainder
  can still act; post-move split cannot refresh spent.
- **Merge** (≈5) — automatic on contact; minority arrival → speed 1; majority →
  speed 0; equal → speed 1; later small arrival does not un-bar a barred stack;
  destination spent kept, arrivals' discarded.
- **Conveyor sketch** (≈1) — a short equal-link chain stops after one hop
  (speed-0), witnessing the §3 pricing without needing the five-link geometric
  case.
- **Skip** (≈2) — legal no-op; refuse skip of an arrow you do not hold.
- **Turn loop** (≈4) — end-turn advances player; exhaustion ⇒ only end-turn
  legal; end with leftover allowance is legal; after end-turn, spent and
  overrides are gone.
- **Enemy occupancy** (≈1) — step onto opponent heads refused (scope cut to P06).
- **Purity / determinism** (≈2) — `apply` does not mutate input; two equal applies
  agree.

## Settled before / during phase 1

§11 items 19–22 already closed every structural move/allowance question. D1–D9
are port and scope calls. **Q1 (exhaustion → only `endTurn`) is confirmed.**
Nothing remains for phase 1 to ask; the Gherkin session is pure translation.

## Definition of done — met

- [x] `pnpm verify` green. 466 tests, none skipped.
- [x] `packages/rules-core` depends only on `@conquarrow/contracts` — `geometry-fixtures`
      is a devDependency, for the boards the tests run on.
- [x] No trail, combat, territory or economy behaviour in the implementation. The
      whole engine is 269 lines and the only board question it asks is the grain.
- [x] No `Date`, `Math.random` or insertion-order dependence: `legalMoves` sorts on
      arrow id with a total comparator, and a property test replays a state authored
      in reverse to prove it.
- [x] Every scenario in the approved spec has a test; every EARS invariant has an
      assertion — including item 33's, added closing the phase-4 review.
- [x] Enemy-step refusal documented as a P06 seam, in the refusal message itself:
      "contact is P06, not movement".

## Phase-4 findings, closed

The review came back **clean with nits**. Both nits were real and both are now
shut, which is what took P04 from reviewed to landed.

**1 — §11 item 33 was resolved in the spec but unpinned by any test.** The engine
carried the merge override with the heads, correctly, and nothing would have
noticed if it had not. Six property cases now discriminate: a merged group that
steps onto empty ground, and one that splits, keep effective speed 1 in every
part. Verified by *breaking* the implementation to the rejected "override belongs
to the arrow" reading — exactly those six fail and nothing else does, so the
suite had genuinely been blind to it. Under that reading one ordinary step
refunds the whole merge price, which is the free mid-turn upgrade §3 exists to
close.

**2 — the golden replay recorded a skip that `legalMoves` would not have offered.**
`apply` accepts a skip of an exhausted group (a skip spends nothing, so it has no
allowance to check) and `legalMoves` does not offer one. The record leaned on the
gap. Rather than widen or narrow either half, the asymmetry is now stated —
**everything `legalMoves` offers, `apply` accepts, and a record follows
`legalMoves`** (movement.md, "the narrower half of the port") — the record skips
an untouched garrison instead of a spent rearguard, and a new guard asserts every
recorded move was on the menu when it was played. That guard, not the edited
record, is what keeps P10 honest.
