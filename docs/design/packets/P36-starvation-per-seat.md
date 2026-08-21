# P36 — Losing conditions, per seat, and the losing seat vanishes

> **Status:** ready. **Depends on:** P09 (victory), P08 (accrual).
> Touches `rules-core`, `contracts` (GameState), **SPEC.md §9 and §11**.
> Rule set decided by the human 2026-08-20; this packet does not invent it.
> Found in a 6-player hot-seat log:
> `conquarrow-match-2026-08-19T224701-274Z` — a seat with no territory kept
> taking turns for the rest of the match.

## What the log shows, and what is actually wrong

The reported symptom — a player who has plainly lost still moving — is
**spec-compliant today**. §9 says *"Elimination. Lose your last head and you
are out."* Elimination is measured in heads, not territory, and
`applyElimination` (`packages/rules-core/src/victory.ts`) implements exactly
that. A seat with heads and no territory is alive.

But §8 already knows that position is terminal:

> Under Splix closure (§7) every claim must depart from and land on your own
> territory, so a player holding none can never claim anything, ever.
> "Start with a head on bare ground and carve your way up" isn't hard, it's
> unplayable.

§8 guards it **at setup only** (Appendix A, prerequisite 3). Reaching zero
territory mid-match is the same unplayable position with no rule attached.

Underneath that, a sharper defect. `tickDomination` is 2-player logic:

- **`if (destitute.length !== 1) return clearStarvation(state)`** — the clock
  only advances when *exactly one* living player is destitute. Two broke
  seats cancel each other's clocks, indefinitely. In a 6-player game that is
  the common case, not the corner.
- **The terminal branch ends the whole match**:
  `state.players.find((p) => p !== victim && headsOf(...) > 0)` — the winner
  is the first surviving seat in **array order**. A 6-player match can be
  handed to whoever sits earliest in `state.players` while four players are
  still contesting it.

Both follow from §9's prose, which is 2-player throughout (*"the other living
seat wins"*). §11 item 32 resolved starvation in those terms and 3+ was never
revisited, though §8 accepts 3+ hot seat explicitly.

## The decided rule set

Three axes — territory *T*, spawner shares *S*, heads *H*. A share **is**
territory on a spawner-border arrow (§9), so `S > 0 ⟹ T > 0` and the cases
below are exhaustive and disjoint.

| *T* | *S* | *H* | Outcome |
|---|---|---|---|
| 0 | — | — | **immediate loss** — can never claim again (§8) |
| >0 | 0 | >0 | **starvation clock** — the flee case, *N* full rounds (§9) |
| >0 | 0 | 0 | **immediate loss** — no production and no units; nothing can ever change |
| >0 | >0 | 0 | **alive**, passed over until a spawner yields a head |
| >0 | >0 | >0 | normal play |

**A losing seat vanishes.** Its heads and trail marks are removed. Its
territory (reachable only in the *T>0, S=0, H=0* case) reverts to **unowned**
— bare, reclaimable ground — and accumulators on those arrows reset as on
capture (§7, `resetAccumulatorsOnCapture`). A dead player's territory must not
become a permanent no-go region nobody can ever claim.

**The match ends when one seat remains.** That is the only victory condition
left; "last player with any heads" is replaced by "last seat not lost".

### This repeals §9's headline rule

*"Elimination. Lose your last head and you are out."* is **withdrawn**: zero
heads is survivable while you own production. Strike it through in place per
the SPEC.md convention and point at the table above. §9's surrounding
rationale leans on it (*"This makes heads the life force rather than merely
units"*) and must be revised, not left to contradict the new rule — heads
remain what you risk and what conversion steals, but they stop being lives.
The comeback vector §9 prizes is strengthened, not lost.

## BSSN (locked here)

- **Every not-yet-lost seat stays in `state.players`, and so does every lost
  one.** Accrual fires only when `endTurn` hands the seat back to
  `players[0]` (`packages/rules-core/src/movement.ts:312`). Removing a seat
  from the rotation — or reordering the array — can move or destroy that
  boundary marker, and if the removed seat *is* `players[0]`, accrual stops
  forever and a headless-but-paid seat can never be revived. Same trap when
  every remaining seat is headless at once. So the array is never mutated;
  loss is recorded as state, and a seat with no legal moves is **auto-passed**.
- **`accrueRound` needs no heads.** It reads only `state.territory.get(arrow)`
  (`packages/rules-core/src/economy.ts:118`), so the *T>0, S>0, H=0* seat is
  paid on schedule with nothing on the board. This is what makes condition 3
  implementable at all; do not add a liveness guard to accrual.
- **Starvation state becomes per player.** The single
  `dominationHolder` / `dominationStreak` pair cannot express two broke seats.
  `dominationN` stays as the threshold name — it is setup data and is already
  documented as a misnomer in `packages/contracts/src/match-config.ts`.
- **Loss is evaluated at the round boundary only** — not after a convert, and
  not inside a step. Phase 1 changed this from the packet's first reading. Three
  reasons, in the spec: a turn stays atomic with respect to removals (the
  existing post-convert `applyElimination` only sets a winner, it never deletes
  pieces); the boundary is where accrual and the starvation tick already run;
  and mid-step evaluation couples the loss rule to every movement fixture —
  measured, 8 of 39 `rules-core` test files author no territory at all, so every
  player in them would be lost on the first `apply`. Resolved in `state.players`
  order, never by map iteration.
- **`lost` is derived, not stored.** `territoryCount(p) === 0 || (shares(p) === 0
  && heads(p) === 0)` is exactly the two immediate rows and is idempotent once
  the pieces are gone, so no flag joins the DTO — which matters, because
  `GameState` is read by 14 files across four packages. What *is* stored is the
  per-seat streak, because a streak is history.
- **`nextPlayer` does not skip anyone**; auto-pass is the mechanism, not
  skipping. `firstAlive` is **gone** — it claimed the boundary was the first
  *living* player while `applyEndTurn` compares against `players[0]` whether
  or not that seat is still playing. There is one story: the array is never
  rewritten, and `players[0]` is the round marker.

## Out of scope

- Retuning *N* (default 5). Tuning belongs with the spawner table (§11 item 11).
- Kingmaking under 3+ play. §8 accepts it for playtest.
- Any change to how territory or shares are won or lost.
- Adapter presentation of a vanished seat beyond not stalling on its turn.
  **P39 owns flicker-then-fade.**

## Scenario inventory (for phase 1 to expand)

Timing below is the **round boundary** (BSSN above), not mid-turn. "Immediate"
means no *N*-round clock, not a claim about sub-turn evaluation.

- A seat whose last territory is carved away is lost when that round closes,
  with no starvation clock — on the enemy closure that took it, they still
  finish the round; they do not take a turn in the next one.
- Its heads and trail marks are gone from the state after that boundary; no
  other seat's trail or territory changes.
- Two simultaneously destitute seats: both clocks advance independently;
  neither clears the other's.
- A destitute seat regaining a share before *N* clears only its own clock.
- At *N* the seat vanishes and the match continues; no `winner` while two or
  more seats remain.
- A seat at *T>0, S>0, H=0* is not lost, takes no action, and is auto-passed;
  it receives a head at the round boundary the accumulator crosses, and
  resumes.
- Every remaining seat headless at once: rounds still close, accrual still
  runs, the first seat paid resumes play. No deadlock.
- A seat at *T>0, S=0, H=0* loses immediately without waiting for *N*; its
  territory reverts to unowned and those accumulators reset.
- A 6-player match never sets `winner` to a seat chosen by array order.
- Replay determinism: the same move list loses the same seats in the same
  order, and `state.players` is byte-identical throughout.
