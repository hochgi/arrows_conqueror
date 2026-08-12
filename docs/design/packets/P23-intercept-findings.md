# P23 — Intercept findings (projected close / timed cut)

> **Status:** ready to ship (adapter).
> **Layer:** `packages/web` only — extends P21 findings. **Depends on:** P21, P11,
> tiling layout (for triangle interior).
> **Does not touch:** `rules-core`, game rules in `SPEC.md`.

## Intent

Humans cut brewing enclosures before they land. Heuristic/BYOK under-harass
because `cut` only scores an **immediate** trail shrink. Add finding kind
`intercept`: project a cheap close from an enemy tip, estimate value and enemy
ETA, and score a step toward cutting **only if the bot can arrive in time**.

## Geometry motivation (why a triangle)

On this lattice the densest claim-per-step shape is triangular (girth-3 minimum
loop encloses one spawner; larger “triangle-like” returns from tip to a
territory frontier are the natural projected closes). Playtest screenshots mark
an **imagined triangle** with:

- apex at the open trail tip,
- base points on the closer’s **territory frontier** (junction **points**, not
  arrows).

That picture is reading **B**: cheapest return home, not “only the pinwheel
face.”

## Locked decisions (v1)

| # | Decision |
|---|---|
| D1 | New finding kind `intercept`. Priority: after immediate `cut`, before `attack`. |
| D2 | Score only **enemy territory-grade** tips with trail length ≥ 3. |
| D3 | **Apex** = `target(tipArrow)` (forward point of the tip arrow). |
| D4 | **Frontier point** = a `PointId` incident to ≥1 arrow owned as that enemy’s territory. |
| D5 | **Imagined triangle** = apex + two frontier points `p0`, `p1` chosen to maximise `x` among candidates in a bounded window (see algorithm), requiring positive area. |
| D6 | **`x`** = Σ spawner `force` (as number `num/den`) whose **vertex** lies **strictly inside** the Euclidean triangle in tiling layout space. |
| D7 | **Enemy remaining** `dClose` = grain distance tip → that enemy’s territory (existing `distanceToTerritory`). |
| D8 | **Enemy ETA** (their turns) = `ceil(dClose / speed(tipHeads))`. |
| D9 | **Bot `n`** = min grain distance from a steppable own stack to a legal step that **cuts** that enemy’s **existing** trail (`isCutMove`). Immediate step = the legal step that most reduces that distance (tie: move key). |
| D10 | **Bot ETA** (our turns, it is our turn when collecting) = `ceil(n / speed(stackHeads))` for the stack that achieves `n`. |
| D11 | **In-time gate:** emit only if `botETA ≤ enemyETA`. No finding if no cut approach exists within `distCap`. |
| D12 | **Reward** = `clamp(25, 105, round(160 * x / max(1, n)))`, `cost = max(1, n)`, `score = reward*100 - cost*10` (same formula as P21). |
| D13 | Immediate trail-shrinking steps stay kind `cut` (static reward 70). Do not relabel them `intercept`. |
| D14 | Layout required for D5–D6. If no layout (fixture-only tests without positions), skip triangle `x` and use fallback `x = 0.25 * trailLen` **only in tests that inject layout**; production hot-seat always has tiling layout. |

## Algorithm sketch (v1)

```
for each enemy E ≠ me:
  for each tip arrow T of E on territory-grade trail with |trail|≥3:
    dClose = grainDist(T → E territory)
    enemyETA = ceil(dClose / speed(heads on T))
    apex = target(T)
    candidates = frontier points of E inside window(apex, distCap)
    pick p0,p1 maximising x = forceInside(triangle(apex,p0,p1))
      among pairs with area > ε; if none, skip tip
    n, step, stack = bestApproachToCut(E trail)
    if n > distCap: skip
    botETA = ceil(n / speed(stack.heads))
    if botETA > enemyETA: skip   // gate
    emit intercept(step, reward from x/n, cost n)
```

Dedup by move key with other findings (first push wins; collect `cut` before
`intercept` so immediate cuts stay `cut`).

## Future (not v1 — leave in this packet)

- Project cut landings onto **unlaid** projected sides (cut where the trail
  *will* be), not only existing marks.
- Exact outside-arc length along triangle sides as `dClose` instead of plain
  grain-to-territory.
- Soften ratio (`x/(n+1)`, `x/n²`) if bots over-chase distant intercepts.
- Multi-tip portfolio / one intercept per enemy.
- Fill-based `x` (reachability pocket if they closed) instead of Euclidean
  interior.
- Formal proof that triangular returns maximise claim density (today: visual /
  girth-3 motivation only).

## In scope

- `packages/web/src/findings.ts` (+ small helpers; optional `layout` arg)
- `packages/web/src/targets.ts` / BYOK tags if they switch on `FindingKind`
- Tests under `packages/web/test/`
- Spec under `docs/spec/intercept-findings/`

## Out of scope

- Rules-core / SPEC.md game mechanics
- Minimax, MCTS, random softmax
- Rewriting evaluate() soup beyond consuming the new finding

## Invariants (adapter)

- WHILE collecting findings, the planner SHALL NOT call `Date.now`, `Math.random`, or I/O.
- WHEN `botETA > enemyETA`, the planner SHALL NOT emit `intercept` for that tip.
- WHEN an immediate step shrinks enemy trail, the planner SHALL classify it as `cut`, not `intercept`.
- WHEN two findings tie on score, the planner SHALL pick the lesser move key.
