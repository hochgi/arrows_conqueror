# P40 — Enemy birth on open trail is a cut

> **Status:** ready to ship. **Depends on:** P06 / P13 (cuts, `evaporateFromArrow`), P08 (spawner accrual), P22 (halt-at-first, dormant).
>
> Playtest: an enemy head spawned onto an arrow that was part of the observer’s
> open trail (bare marks, no garrison). Under current rules the birth is legal
> (bare trail is not “occupied”), no cut fires, and the enemy unit simply sits
> on the trail. That is the only remaining way an enemy can appear on open trail
> without paying the cut price.
>
> **SPEC coverage:** §6.1 (cuts & evaporation), §7 (spawner accrual / “nothing
> spawns into an enemy-occupied arrow”), §11 item 47. Re-uses existing
> `evaporateFromArrow` / halt-at-first machinery; does **not** invent a second
> cut path.

## Intent

When a spawner birth places a head onto an arrow that belongs to another
player’s **open trail**, treat that birth as a cut at the birth arrow and run
ordinary bidirectional evaporation.

You can only be hurt while growing. Leaving trail ungarrisoned already invites
a movement cut; the economy must not get a free bypass of the same surface.

## BSSN (locked here)

- **Trigger.** After a birth is applied (end of the full-round accrual step), if
  the destination arrow is a member of any other player’s trail set, that birth
  is a cut for every such trail owner.
- **Cut point.** The birth arrow itself. Primitive: `evaporateFromArrow` (same
  as combat wipe / convert wipe) — destroy that arrow in the victim’s trail,
  then fan both ways under halt-at-first.
- **Evaporation.** Identical to §6.1: fronts travel with and against the grain,
  destroy trail until they would enter an arrow occupied by the *victim’s*
  stack (or reach the victim’s territory). The newly born head is **not** the
  victim’s, so it is not a firebreak for the victim.
- **Heads survive.** Evaporation never kills; the newborn stays. Head count
  rises by the born heads only.
- **Bare marks only.** If the arrow already held a stack belonging to the trail
  owner, accrual was already halted and no birth occurs (existing blockade,
  item 15). This packet only covers the empty-arrow case.
- **Friendly birth.** A birth onto the territory owner’s *own* trail merges
  (P08) and is **not** a cut.
- **Deterministic order.** Complete all births in the tick first. Then, for
  each birth arrow in arrow-id order, for each victim whose trail still
  contains that arrow (player-id order), run `evaporateFromArrow`. A later
  birth on a component already evaporated is a no-op.
- **No new vocabulary / no new port method.** Observe via existing `apply` +
  `trails` + groups. Re-use `evaporateFromArrow`.
- **FX / telemetry.** Adapter already keys `trailCut` / P32 cuts off trail-set
  shrinkage on any apply, including `endTurn`. No adapter packet.
- **Purity / determinism.** No `Date`, no `Math.random`, no insertion-order
  dependence.

## Out of scope

- Changing when accrual ticks or the “enemy occupation halts” rule itself.
- Making bare trail count as “occupied” for the halt check (that would stop
  the birth entirely; we want the birth + cut, not silent non-birth).
- Contact combat math, conversion, branch toll, firebreak-capped paint.
- Adapter-only visual hide; the trail set must actually shrink.

## Scenario inventory

- Enemy birth on bare open trail → cut fires, trail evaporates both ways to
  firebreaks / territory; newborn remains.
- Birth on arrow that already holds the trail owner’s stack → no birth
  (existing halt); no cut needed.
- Birth on unowned / own-territory arrow with no foreign trail → no cut.
- Friendly birth onto own trail → merge, no cut.
- Birth on trail that has a garrison further along → front halts at that
  stack; distal beyond the firebreak stays.
- Fork: birth on the stem → both arms evaporate until each arm’s firebreak.
- Multiple births in one accrual tick on the same component → deterministic
  sequential cuts (Set of birth arrows, then arrow-id order).
- Head conservation (plus the born heads), purity, replay determinism.
- Existing movement-cut, convert-wipe, dormant, and blockade scenarios still
  pass unchanged.

## Definition of done

- [ ] `pnpm verify` green.
- [ ] Playtest case (enemy unit materialising on open trail with no
      evaporation) cannot be reproduced from `GameState.trails`.
- [ ] Existing cut / convert / dormant / blockade scenarios still pass.
- [ ] No nondeterminism introduced.
- [ ] SPEC §6.1 / §7 prose + §11 item 47 updated; packet index row added.
