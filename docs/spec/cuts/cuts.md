# cuts — evaporating a trail from a crossing

**Packet:** [P13 — Trail fire & anchors](../../design/packets/P12-trail-fire-anchors.md)
(was P06 for the original kill-per-front rule)
**SPEC:** §6.1, §6.1a, §2, §11 items 8, 24, 26, 27, 28 (P12 re-resolutions)
**Features:** [core](./cuts.core.feature) · [edge cases](./cuts.edge-cases.feature)
**Sibling:** [combat](../combat/combat.md)
**Builds on:** [crossings](../crossings/crossings.md)

## Purpose

An enemy traversal that crosses your trail **cuts** it. Evaporation clears trail
paint in both directions from the cut point until a garrison or territory stops
it. **It does not kill heads** — combat does.

## Terms

| Term | Means |
|---|---|
| **cut** | a step whose traversal crosses a victim's trail, or a territory-root cut at `P0` |
| **cut point** | the point evaporation starts from |
| **front** | one advancing edge of evaporation (no kill) |
| **firebreak** | the first occupied arrow a front would enter — halt; arrow and stack survive |
| **region** | trail between two firebreaks, or a firebreak and territory |
| **territory-root cut** | last enemy mark on a territory feeder into `P0` |

## How a cut resolves

```mermaid
flowchart TD
  S["step / wipe / last feeder mark"] --> P["cut point P"]
  P --> F["forward fronts on every trail out of P"]
  P --> B["backward fronts on every trail in of P"]
  F --> E["enter arrow: if victim stack on it, halt without destroying"]
  B --> E
  E --> R["else remove arrow from trail #59; fan to continuations"]
  R --> T{"backward hits victim territory?"}
  T -- yes --> W["stop"]
  T -- no --> D["survivors beyond firebreaks are stack grade"]
```

## Invariants

- When a cut resolves, the system shall evaporate the victim's trail both ways from the cut point without reducing any head counts.
- When a front would enter an arrow occupied by the victim, the system shall halt and shall not destroy that arrow.
- At a branch, the system shall send a front into every continuation.
- The system shall halt per arrow, never by a head on another arrow of the same point.
- When a backward front reaches the victim's territory, the system shall stop.
- When a step marks the last clean territory feeder into a trail root `P0`, the system shall cut the owner's trail at `P0`.
- When a stack is wiped to 0, the system shall evaporate that owner's trail from that arrow.
- When a spawner birth lands on another player's trail arrow, the system shall evaporate that trail from the birth arrow (P40).
- The system shall not leave a dormant (unanchored) trail component standing.
- The system shall not mutate the input state.
