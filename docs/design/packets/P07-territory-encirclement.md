# P07 — Territory & encirclement

> **Phase-1 input.** This doc fixes scope, decisions, invariants and a scenario
> inventory. The spec-author session turns it into Gherkin + EARS with the human
> in the loop. It does not itself contain the scenarios in final form.
>
> **SPEC coverage:** §6.3 (encirclement / conversion), §6.1 (two grades of
> anchor — territory vs stack), §7 (closure grants enclosed heads — the P05b
> seam), §11 items 9, 28.
> **Depends on:** P05b, P06. **Unblocks:** P08 (spawner economy), P09 (victory).

## What this packet is for

P05b claims tiles and leaves enemy heads standing. P06 demotes trail to stack
grade and evaporates regions. This packet is where those states finally cost
heads:

> **An enemy head inside your territory with no [territory-grade] anchored trail
> is encircled, and converts.** (§6.3)

Conversion is a **state predicate**, not a move kind. Closing around a garrison
is the common case; a cut that demotes a raider already inside enemy ground is
the other. Stacks convert **intact** (§11 item 9).

## In scope

- **`packages/contracts`** — grow `RulesPort` if a pure query helps (e.g.
  `encircled` / `convert`), otherwise conversion lives inside `apply`.
- **`packages/rules-core`** — after territory / trail / occupancy mutations in
  `apply`, flip ownership of every group that satisfies the predicate.
- Tests against the **generated tiling** (P03). Same reason as P05b: the
  condition is about being *inside territory*, and fixtures have no infinity /
  no real fill (§11 item 29). Local demotion→convert cases that do not need a
  fresh enclosure may still use fixtures where the authored territory is enough.

## Out of scope

- **Closure / fill / land bridges** — already P05b. This packet consumes the
  seam P05b left open (enemy heads still standing on claimed tiles).
- **Cuts / combat** — P06. Conversion reads the grades P06 leaves; it does not
  re-implement evaporation.
- **Accumulators** — P08. A converted arrow's owner change is the event P08
  will reset on; do not grow a placeholder counter here.
- **Victory / elimination** — P09. Conversion moves the head pool; it does not
  declare a winner.
- **No vertex enumeration.**

## Decisions this packet fixes (from SPEC)

**D1 — Conversion is a state predicate, not an event.**

§6.3: triggers on state. After any `apply` that can change territory, trails, or
occupancy, every group that is (a) standing on an arrow owned by another player
as territory and (b) lacking a **territory-grade** trail for its owner, converts
to that territory's owner.

Skip that does not change state is a no-op; `endTurn` still runs the check
(demotion / authored setups can leave a convertible group sitting).

**D2 — "Anchored trail" means territory grade.**

§6.3 + §11 item 28: stack-grade and dormant do **not** protect. Sentries on a
raider's fragment do not save it. A trail that still reaches the owner's own
territory does protect — that is the grade rule, not a carve-out.

**D3 — Stacks convert intact.**

§11 item 9: a 3-stack becomes a 3-stack of the converter. Not three singles, not
a token survivor.

**D4 — Neutral stranded ≠ enemy stranded.**

Stack-grade on **neutral** (no territory owner) ground is recoverable (§6.1).
Stack-grade (or no trail) on **enemy** territory is capture. The arrow's
`territory` entry is what discriminates.

**D5 — Order inside `apply`: combat → cut → closure → conversion.**

Closure creates the common case; cut demotion creates the raider case. Conversion
runs last so both are visible in one step. (Combat can leave a bounced attacker
on their own tip — not inside enemy land — and does not itself convert.)

**D6 — Head conservation.**

Conversion moves heads between players; it destroys none. Σ heads before =
Σ heads after for every conversion pass. (Combat losses are a different packet
and already applied earlier in the step.)

**D7 — Enemy trail on claimed tiles is not auto-stripped by P05b.**

P05b's `commit` clears only the **mover's** trail from taken arrows. An enemy
trail that still reaches their home keeps territory grade and **blocks**
conversion — matching "heads on a territory-grade trail are not encircled."
Capturing a blockader therefore needs a **cut** (or an enclosure that leaves them
with no territory-grade path), which is exactly §7's blockade failure mode.

## Open precision questions (human) — resolved

**Q1 — `spent` and `speedOverride` on a converted group.** → **reset**
(`spent: 0`, drop override). §11 item 40.

**Q2 — Trail cleanup when a group converts.** → **moot.** You cannot encircle a
victim who still has a territory-grade trail; a cut must evaporate up to their
anchor first. Conversion does not strip trail.

**Q3 — Merging with an existing friendly group.** → **unreachable.** Converts
come from territory-claim encirclement; encircled arrows are claimed and the
converted units sit on that territory. Co-location with a pre-existing friendly
group does not arise.

## Invariants (EARS candidates)

- When a group stands on another player's territory and its trail is not
  territory-grade for its owner, the system shall convert that group to the
  territory owner with the same head count.
- The system shall not convert a group whose trail is territory-grade for its
  owner.
- The system shall not convert a group standing on neutral ground or on its own
  territory.
- The system shall not let stack-grade or dormant trail protect against
  conversion inside enemy territory.
- When conversion runs, the system shall conserve the total number of heads on
  the board attributable to that pass (no destruction, no duplication).
- The system shall run conversion after combat, cut, and closure within one
  `apply`.
- The system shall not mutate the input state, and shall return equal outputs
  for equal inputs.
- The system shall enumerate no vertex.

## Scenario inventory

- **Common case** (≈4) — closure encloses a 1-stack; encloses a 3-stack intact;
  garrison with no trail converts; heads on claimed path convert when grade is
  not territory.
- **Grade shield** (≈3) — territory-grade trail into enemy land does not
  convert; stack-grade raider inside enemy land converts; dormant fragment
  inside enemy land converts.
- **Cut then convert** (≈2) — cut demotes a raider already inside enemy
  territory → converts on the same step; cut that leaves territory-grade
  elsewhere does not convert protected stacks.
- **Neutral vs enemy** (≈2) — stack-grade on neutral ground survives;
  same stack on enemy territory converts.
- **Conservation / purity** (≈3) — Σ heads unchanged by conversion alone;
  no input mutation; equal inputs → equal outputs.
- **Non-triggers** (≈2) — skip beside an encircled setup does not convert
  until a state-changing apply (or does, if authored state already matches —
  pin whichever D1 settles); own heads on own territory never convert.

## Definition of done

- [ ] `pnpm verify` green.
- [ ] P05b's "enemy head still standing" seam scenarios now convert.
- [ ] P06 demotion→capture scenarios owned here, not by inventing cut side-effects.
- [ ] No accumulator, no victory declaration.
- [ ] No `Date` / `Math.random` / insertion-order dependence.
- [ ] Every approved scenario has a test; every EARS invariant has an assertion.
- [ ] Q1–Q3 answered in SPEC §11 (or struck as unreachable) before code. **Done — item 40.**
