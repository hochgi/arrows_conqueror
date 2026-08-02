# Arrows Conqueror — Design Spec

*Working draft. Turn-based territorial conquest on an arrow tiling. Volfied's carve-and-enclose loop, rebuilt as a deterministic skirmish game.*

Status: core mechanics settled, open questions listed at the end. No implementation yet.

---

## 1. Premise

Two or more players carve territory out of a plane tiled with interlocking arrows. You advance **heads** along the arrows, leaving a **trail** behind them. When your trails close a loop, everything inside becomes yours — including any enemy units caught in it, and any **special tiles** that then start producing for you.

You can only be hurt while you are growing. That is the spine of the whole design.

---

## 2. The Board

The playing field is the arrow tiling from the source image.

- **Tiles are arrows.** Each arrow is a node in the movement graph.
- **Movement follows the grain, always.** A head advances *in the direction the arrow points*. There are no exceptions and no backwards movement — see the reachability note below for why none is needed.
- **Points are 3-in / 3-out.** Arrows converge at points; every point has **exactly 3 arrows in and 3 arrows out**. Points are where trails are crossed and where combat happens.
- **Girth is 3.** The shortest directed cycle is the pinwheel triangle — three arrows turning about a shared point. Confirmed visually (`~/Documents/arrows_tile_colored.jpg`). The minimum enclosable loop therefore costs 3 arrows and 3 heads, which is what makes a drafted opening affordable.

### Trails own points, not just arrows

Consecutive arrows in a trail meet at a **point** — they share a vertex, not an edge. Two tiles touching at a single point **do not form a barrier**: this is the diagonal-leak problem from flood fill, where 8-connected movement escapes a 4-connected wall. If crossing meant "land on a trail arrow," an enemy could thread through the vertex between two trail arrows without touching either, and enclosures would leak.

> **A trail owns the points it passes through.** Crossing is defined as *traversing a point on the trail*, not as occupying its arrows.

### The chord test

Each point has six surrounding arrow-slots (3 in, 3 out). A path transiting the point draws a **chord** from its in-slot to its out-slot.

> **Blue crosses red iff their chords interleave** — blue's pair separates red's around the circle — **or coincide**, meaning blue's exit arrow *is* one of red's trail arrows.

This single test covers both real cases: threading between two of red's arrows (interleave) and landing directly on a red arrow (coincide). A blue chord that stays on one side of red's — turning aside rather than through — is not a crossing.

**Crossing is therefore a decision, not a tripwire.** A head standing at a vertex an enemy trail runs through has not crossed anything; it commits by choosing its exit arrow. Three things follow with no extra design:

- A head can **shadow** an enemy trail, travelling alongside it vertex after vertex without triggering combat, choosing its moment.
- A defender can **hold a contested vertex** without committing to a fight.
- Two trails can **race in parallel** through the same corridor, mutually aware and mutually unobligated — until one of them turns.

Three things then unify under one definition:

- **Enemy cut** — an opponent traverses a point your trail passes through (§6.1).
- **Self-crossing** — *you* revisit a point your own trail already uses, producing the even-odd inversion in §7.
- **Combat** — resolved at that point, which is where §6.2 already puts it, with its three approaches.

It subsumes the tile rule for free: an enemy cannot stand on your trail arrow without entering through its tail point, which your trail also uses.

### Reachability

The movement graph is directed, which normally risks one-way currents and absorbing pockets. It doesn't here:

> A weakly connected digraph in which every node is **balanced** (in-degree = out-degree) is **Eulerian**, and Eulerian implies **strongly connected**.

3-in/3-out satisfies balance exactly, so every arrow is reachable from every other and no head can ever be trapped. This is why no against-the-grain rule is needed: a head U-turns by navigating forward around a loop, which costs real distance and lays fresh cuttable trail the whole way. Retreat stays dangerous without any special case.

**This holds on the infinite tiling only.** Cutting a finite board out of it would leave rim points with missing arrows, breaking balance precisely where camping happens and potentially creating genuine sinks at the edge.

> **The board is therefore a torus.** It wraps in both directions. This is the only topology that keeps every point 3-in/3-out and the connectivity proof intact — and it erases corners, so there is no safe back wall to turtle against and no asymmetry between a central and a peripheral start. Cost: a harder board to render, and a minimap players must learn to read.
- **Special tiles** are scattered on a sub-lattice of the tiling (see §7).

### Map symmetry

Special tiles and starting positions are placed with **rotational symmetry about the board center**, so each player's home region has identical special-tile count and distance. A denser contested cluster sits in the center, far from every start. Deterministic — no random map generation. (StarCraft's naturals-plus-contested-center recipe.)

---

## 3. Units: Heads and Stacks

- A player's units are **heads**.
- Heads on the same tile may **merge** into a **stack**.
- **Stack size is lives.** A 3-stack is literally three heads standing together. There is no separate HP stat — a stack that loses one becomes a 2-stack.
- **Splitting is unmerging.** A stack may shed heads (see §5, sentries).

### Speed

A stack moves faster than a single head, but **sub-linearly** — stacking must never beat splitting on raw throughput.

```
speed(N) = 1 + 1/2 + 1/3 + ... + 1/N      (harmonic)

N:      1     2     3     4     5     6
speed:  1.00  1.50  1.83  2.08  2.28  2.45
```

Fractional movement **banks between turns**; a unit steps when it has a whole point available.

> Alternative if fractions prove unpleasant: `speed(N) = 1 + floor(log2 N)` — every doubling adds one step. Cleaner to state, jumpier in feel.

### Why both merging and splitting are attractive

| | Merge | Split |
|---|---|---|
| Total throughput | ~1.5–2 moves/turn | N moves/turn |
| Chain-laying speed | fast | slow (one chain per head) |
| Combat strength | concentrated | scattered |
| Board coverage | one tile | N tiles |

A territory is closed by **one** chain, and that chain advances at the speed of the single unit laying it. So the stack is the only thing that can finish a large enclosure before the enemy arrives to cut it — while splitting gives you presence, garrisons, and more total work done. Neither dominates.

---

## 4. Turn Structure

- Players alternate turns.
- **Every head acts each turn**, spending its own movement allowance (1 step for a single head, more for a stack).
- Perfect information. No fog of war, no hidden state.

---

## 5. Trails, Safety, and Sentries

### The safety rule

> **Moving inside your own closed territory lays no trail and costs no exposure. The moment you step off it, you are trailing and you are vulnerable.**

Everything below follows from this one rule.

- A head with **no open trail** — standing on finished border or inside your own land — has **no attack surface at all**. It cannot be cut. It can only be taken by encirclement.
- Therefore: **you can only be hurt while you are growing.** Turtling is safe but static; growth requires exposure; the game cannot stall.

### The geography this creates, for free

- A trail laid tight against the enemy border is **cheap for them to cut** — they slide up through their own safe ground and expose themselves only on the final step.
- A trail laid in **neutral ground** costs the defender a real trip through open terrain, which is where decoy-and-flank play pays.
- A **lasso deep inside enemy territory** is brutally hard: they are on safe ground the whole time and you never are.

Result: fights concentrate at the frontier, heartlands resist raiding, and conquest grinds borders inward. No special rules required.

### Sentries

A moving stack may **drop heads along its trail** as it goes. A dropped head is a stationary garrison defending that stretch of trail. A stack passing back over its own sentries may **pick them up again**.

This is the third leg of the tension: every sentry makes the chain safer and makes the head slower and weaker at the far end. Greed, speed, and safety trade against each other in a decision made repeatedly along the way.

---

## 6. Combat and Damage

There are exactly **two** ways to hurt a player.

### 6.1 Cutting a trail

An enemy head crosses your open trail at a **point**. If the crossing succeeds:

- **The trail evaporates forward, with the grain**, from the cut point — propagating down *every* fork it meets.
- **Evaporation halts at the first stack on each branch**, and that stack **loses one head**. An unmerged single head that loses its life **dies and is removed**.
- **The trail behind the cut survives and stays anchored.** Your investment near home is never lost, and a branch that forked off *behind* the cut is untouched and still connected.
- Trail fragments beyond the firebreak stacks survive but are **unanchored** — dormant, not dead.
- A stranded head **fights its way home**. Because the graph is strongly connected (§2), it does this by looping forward around the grain rather than reversing, laying fresh cuttable trail the entire way.

**Fragments are re-attachable, and this needs no special machinery.** The ordinary rule already covers it: a path counts once it runs continuously from your territory to your territory. Lay a fresh path from home that reconnects to a dormant fragment, and the whole chain is live again. Nothing floats, nothing is tracked separately — an orphan is simply a wall waiting for a road.

Three properties fall out of this:

**Cut depth is everything.** A cut near the tip scratches off a few tiles; a cut near the root wipes the whole tree forward of it. So attackers are drawn toward the victim's own border — precisely where the victim is strongest and the attacker most exposed. Cut value and cut difficulty rise together, with no balancing constant.

**Sentries are firebreaks.** Evaporation stops at the first stack, so a trail garrisoned every couple of tiles can only ever lose that short stretch. Paid for by the fact that every sentry dropped bleeds the spearhead's speed and its ability to win the next crossing.

**Forks hedge risk.** A cut behind a fork takes everything; a cut on one branch leaves the other whole and anchored. Trail shape becomes a strategic choice — but a branching trail also offers more cut points and loses one head *per branch*.

A cut is therefore expensive but survivable. You lose a head, you lose the back half of your work, and you are stranded behind enemy lines. This matters: under a rule where cutting destroyed the whole trail, ambition would be suicidal and the rational play would always be small safe nibbles. Here, large enclosures stay attemptable.

It also makes **sentries literally armor** — the closest stack absorbs the hit, so heads dropped along the trail are what keep the chain alive.

### 6.1a Trails are trees

Because a stack can split and diverge, a trail may **fork**. A trail is a tree rooted at your territory, not a simple path. Trail *shape* is a decision, not just trail length — a branching trail covers more ground and offers more cut points; a single spine concentrates its defenders.

### 6.2 Contested crossings

Crossings resolve at points, where three arrows converge. To cross, an attacker approaches along one arrow; a defender's sentry may hold another.

- **Deterministic attrition.** Both sides lose the smaller stack's size.
- **Defender wins ties.** The attacker needs *strict* superiority to cross.
- **Multi-prong bonus.** Because three arrows point at every crossing, attacking a point from **two arrows in the same turn** grants an attack bonus. Positioning replaces dice — the tiling supplies the combat system.

No randomness anywhere. A six-turn enclosure never dies to a bad roll; it dies to being outplayed.

### 6.3 Encirclement

If you close a shape containing enemy heads, those heads **convert** and become yours. This is how the head pool moves between players, and it makes a well-placed lasso a double swing.

---

## 7. Territory and Economy

### Closure — the Splix/Hexa model

> **Depart from your own territory. Land back on your own territory. Everything the path encloses becomes yours, and so does the path itself.**

This is the hexa.io / splix.io rule, not "any cycle of your own trail."

- **An unanchored loop is nothing.** A trail severed from your realm claims no territory under any circumstance. There are no islands, no garrison forts, no founding.
- **A path that encloses nothing becomes a thin strip.** Travel from one holding of yours to another without surrounding anything and you have built a **land bridge** — the arrow chain itself becomes territory, one tile wide.
- **Self-crossings invert.** Crossing your own trail doesn't close anything on the spot; it flips which lobes count as enclosed when you finally land. Formally: even-odd fill. Figure-eights resolve without a special case.

Closing grants the enclosed tiles **and everything inside them** — enemy heads (converted) and special tiles.

### The pincer

A forked trail whose two branches both land on your territory **is a valid conquest**, and it requires no additional rule. Branches land one at a time: when the first arm lands, the whole drawn path becomes territory, stem included. The second arm is then an open trail hanging off a fork point that is *now territory*, so its landing is an ordinary territory-to-territory closure — and it takes the ground between itself and the now-solid first arm.

The two arms never need to form a directed cycle. **Enclosure is a property of the curve, not of the flow along it.**

This gives forking an offensive identity rather than a purely defensive one: two arms sweep out, both come home, and the ground between them falls. Paid for by splitting (which slows both arms), by having two trails to defend instead of one, and by the fact that a single cut on the shared stem kills the whole operation.

### Why this kills the corridor exploit

A path can never terminate in open ground — it must come home. So you cannot walk twenty tiles into contested territory, tie a small knot, and convert the walk into a permanent one-wide safe-movement highway. To keep anything, you have to return, and returning means enclosing something real.

Land bridges remain available, but only between holdings you *already own* — which is exactly the situation where connecting them is a legitimate move rather than an exploit.

### Territory is contestable

Enclosed land is **not permanent**. An enemy can drive a chain into your territory and close a loop inside it, carving that chunk — and any specials in it — back out. Enemy territory is hostile ground: enterable, but you are exposed there and they are not.

Nothing is ever safe, so nobody snowballs. Taking a spawner early paints a target rather than winning the game.

### Specials live on vertices, not tiles

A special occupies a **pinwheel-centre vertex** — a point of the tiling that is *not* a movement junction, bordered by exactly 3 arrows. Confirmed visually (`~/Documents/arrows_tile_colored.3.jpg`).

This is the decisive property: **you cannot stand on a vertex.** A special is never occupied, only ever *bordered*. Had specials been arrow tiles they would also be movement tiles — occupiable, walkable, garrisonable — and we would be answering "does standing on it count?" forever. Putting them on the lattice the movement graph doesn't touch makes the ambiguity structurally impossible. Same principle as the chord test in §2: let the geometry enforce the rule.

**Ownership is fractional, in thirds.** Each of the 3 bordering arrows carries one share. Hold two arrows as territory and you hold 2/3 of that special.

**The vertex never needs to be enclosed — one adjacent arrow gets you in on the action.** So specials are *shared by default* and monopoly is the exception: three different players can each hold one third of the same spawner. The fight is a continuous contest over shares rather than a binary flag, and a rival's income can be pared down a third at a time.

Three things follow:

- **Partial capture gives granular pressure.** Shaving one arrow off a rival cuts their income by a third — a real blow available without mounting a full operation, and one a weaker player can land. A raid that falls short still pays.
- **Border *shape* starts mattering.** Capturing fully is no longer about reaching, it's about how your seam runs; a sloppy border clips your own specials to 2/3. New, legible pressure toward compact, well-formed territory.
- **The atomic unit of conquest and the atomic unit of value may be the same object.** The girth-3 minimum loop is three arrows pinwheeling about a centre; a special is a centre bordered by three arrows. If those are the same three arrows — the images strongly suggest it — then the smallest territory the board permits encloses exactly one special. *Confirm when the graph is extracted (§11).*

### Spawner logic

- A spawner has a **force** *f*, a rational fraction ≤ 1/3. **1/3 is a very rare maximum**; typical values are **1/9 or 1/12**. Total output is *f* heads per turn.
- **Each turn, one adjacent arrow gains *f***, cycling round-robin. Post-MVP, other distributions per spawner type.
- Each **accumulator belongs to the arrow, not the player.** When one reaches 1, a head appears on that arrow — merging into any stack already there — and the accumulator **carries the remainder** rather than resetting to zero. Nothing is wasted, which matters once two spawners feed one arrow and overshoot is routine. Same idiom as the banked fractional movement in §3.
- **An arrow that changes hands starts fresh.** Its accumulator resets to zero on capture — the one case where progress is destroyed rather than carried.

**The round-robin is what implements the thirds.** No player-level fractional economy is needed: hold 2 of 3 arrows and you simply receive 2 of every 3 spawns.

**Reset-on-capture desynchronizes production.** Arrows taken on different turns run on different clocks, so heads trickle out at staggered intervals instead of arriving in waves. The desynchronization is earned rather than configured.

It also makes **border churn economically sterile.** An arrow flipping back and forth never produces anything for anybody, so consolidating beats raiding for its own sake — and a raid that holds an arrow two turns and loses it has still erased everything the owner banked there. Only securely held ground pays.

**Spawners produce dispersion, not stacks** — heads appear one at a time on different arrows. Concentration is something a player must actively do.

### Stacked spawners

An arrow may border **two** spawners. Its single accumulator receives from both, and coprime denominators (1/9 against 1/12) produce compound, aperiodic-feeling spawn timing.

**Overlap is common, not exceptional** — low-force spawners are the norm and their neighbourhoods routinely intersect.

This is **deterministic irregularity** — no randomness anywhere, yet a rhythm complex enough to feel organic while staying fully predictable to a player willing to do the arithmetic. Double-fed arrows become natural **keystones**: capturing one wounds two spawners and gains two income streams at once, so overlapping neighbourhoods become the map's hot spots without any special-casing.

**Overlap roughly halves fill time.** A single-fed arrow at 1/12 needs 36 turns; one fed by a 1/9 and a 1/12 gains 7/36 per three-turn cycle and fills in about **15**. Two 1/12s give 18. Since overlap is the norm, typical arrows pay out on a timescale contested ground can actually survive — the frontline-never-produces problem shrinks to genuinely isolated arrows.

### The emergent income landscape

The consequence worth designing around: **a single spawner's three arrows produce at three different speeds**, because each has different *other* neighbours. The round-robin is perfectly even; the outcomes are not. One arrow is double-fed and pops every 15 turns while its sibling is isolated and takes 36.

So the map develops rich arrows and poor arrows determined purely by spawner placement geometry, with **no per-tile data authored anywhere**. Knowing which arrows are the good ones becomes real map knowledge, and it comes free from the geometry.

### Force should scale with contestedness

Reset-on-capture has a consequence worth designing around. At *f* = 1/12 a single arrow needs **36 turns** to fill — twelve gains at one per three turns — so an arrow anywhere near a frontline will never pay out at all. A uniform scatter of slow spawners would therefore make the contested central cluster (§8) the *least* productive region on the map, inverting the entire point of putting it there.

> **Fast spawners belong where the fighting is.** Put the rare *f* = 1/3 specials in the contested centre, where 9 turns per arrow is quick enough to pay out between flips. Put the slow 1/9 and 1/12 specials in home regions, which have the quiet decades they need.

This gives spawner placement a design principle rather than a scatter, and makes the centre genuinely worth bleeding for.

### What the spawn rate implies about victory

A cut removes exactly one head, and costs the attacker travel, exposure, and a won crossing — call it a cut every 3–4 turns for a committed attacker. A spawner replaces a head every 1/*f* turns.

**Force is therefore the single knob that sets the game's character:**

| *f* | Head every | Effect |
|---|---|---|
| 1/3 | 3 turns | Economy dominates. Attrition can never outpace production, so **encirclement is the only real killer** and elimination is mop-up after you have taken someone's spawners. |
| 1/9 – 1/12 | 9–12 turns | Near the crossover. Attrition is viable, heads are precious, and chip damage genuinely decides games — while encirclement stays the decisive swing. |

The typical values sit deliberately near that crossover, which is likely the most interesting place for them to be. Worth re-checking against real playtest numbers, since it decides whether cuts earn their keep through damage or only through tempo and denial.

**MVP ships spawners only.** Every special is the same kind of object, differing only in force and in where it sits — all the variety comes from placement geometry and overlap, none from authored perk types.

That has a clean consequence: **territory has no intrinsic value in MVP.** With no score and elimination as the win condition, area isn't points, it's *infrastructure* — you take ground to reach spawner arrows, to build safe highways, and to enclose people. Sprawl is therefore purely a liability with no scoring upside to offset it, so the pressure toward compact territory is stronger now than it will be once other specials exist, and conflict concentrates naturally around spawner neighbourhoods rather than spreading across the board.

Post-MVP perk directions (content, not structure — unresolved):

| Special | Effect |
|---|---|
| Spawner | *MVP.* Force *f* ≤ 1/3, round-robin across its 3 arrows (above) |
| Forge | Raises max stack size or improves the speed curve |
| Armory | Your heads are born as 2-stacks |
| Gate pair | Teleport between two specials you hold — makes a long perimeter defensible |
| Anvil | A head ending its turn here regains a life |

---

## 8. Match Setup

Fixed and symmetric for v1. Each player begins holding:

- a **home pinwheel** — a small pre-enclosed territory,
- **one spawner** inside it,
- **one 3-stack** garrisoning it.

Home regions are placed with rotational symmetry about the board center. A denser cluster of specials sits in the contested middle, far from every start.

**Starting territory is mandatory, not a convenience.** Under Splix closure (§7) every claim must depart from and land on your own territory, so a player holding none can never claim anything, ever. "Start with a head on bare ground and carve your way up" isn't hard, it's unplayable. The opening position has to be granted.

**Why a 3-stack.** Three is the smallest stack that can split into a pincer (§7) and still leave something behind, and it matches the girth-3 minimum loop.

A drafted opening was designed and deliberately deferred — see Appendix A.

---

## 9. Victory

**Elimination.** Lose your last head and you are out.

This makes heads the life force rather than merely units. Conversion by encirclement becomes a literal step toward winning, spawners become life support rather than score, and the loop tightens into:

> risk heads → take territory → hold specials → make heads

It also hands the trailing player a real comeback vector: a desperate lasso around an enemy stack doesn't just deal damage, it *takes* those heads — a 2× swing on the exact axis that decides the game.

### Accepted risk: the turtle stalemate

"You can only be hurt while you're growing" means a player who **stops growing becomes unkillable by cutting**. A losing player can pull every head onto safe ground inside a small enclave and never lay another trail; the only remaining way to kill them is to encircle the entire enclave, which may be impractical at a chokepoint. With elimination as the sole win condition and no clock, that is a permanent stalemate rather than a slow one.

**Decision: accept it.** Encirclement is considered sufficient. If playtesting shows real stalemates, the drop-in fix is **upkeep** — each special sustains some number of heads, and holding less production than your army needs costs you one head per turn. That turns the turtle's shell into a starvation chamber and reuses pieces already on the board, without adding a subsystem.

---

## 10. Balance Posture

Known pressure points and their built-in counterweights:

| Snowball vector | Counterweight |
|---|---|
| Safe movement inside territory is free, so a large empire repositions instantly | A large empire has an enormous perimeter it cannot garrison everywhere |
| More specials → more heads | Specials are physical locations that can be attacked, and only produce while enclosed |
| Big stacks win fights | Big stacks are slow and throughput-negative; splitting is genuinely competitive |
| Leader can cut every enemy chain | Cutting requires leaving safety — the cutter becomes trailed and cuttable itself, and spends a whole turn to remove one life |

The decoy play this enables: bait an attacker into committing to a cut, and counterattack the now-exposed cutter with a flanking stack. If they refuse the bait, the decoy changes course and joins the flank to close the shape. This emerges from the rules rather than being designed in.

---

## 11. Open Questions

**Geometry**
1. Extract the exact adjacency graph and arrow directions from the source tiling. Confirm 3-in/3-out empirically rather than assuming it.
2. ~~Reachability~~ — **resolved.** Balanced + weakly connected ⇒ Eulerian ⇒ strongly connected. See §2.
3. ~~Girth~~ — **resolved.** 3, the pinwheel triangle. See §2.
4. ~~Board topology~~ — **resolved.** Torus, wrapping both ways. Preserves rim balance, kills corner camping. See §2.
5. Shortest U-turn loop length. Sets the real cost of retreat, and therefore how punishing a cut is in practice. Measurable once the graph is extracted.

**Tuning — none of these block a paper playtest**
6. At a contested crossing, is the stack you must *defeat* the same stack that *loses a head*, or can they differ?
7. Merging: free on contact, or does it cost the turn?
8. What happens to the branch of a fork whose head dies.
9. Do converted heads keep their stack size?
10. Multi-prong bonus: how much?
11. Player count and board size. Everything so far assumes 2 players alternating; 3+ raises kingmaking under elimination.
12. Special density on the vertex lattice — scarce enough that nobody sweeps them, common enough that everyone has a fair shot.
13. ~~Accrual on unowned arrows / charge surviving capture~~ — **resolved.** An arrow that changes hands starts fresh. See §7.
14. ~~Reset versus carry on spawn~~ — **resolved.** Carry the remainder. See §7.
15. **Spawning onto a contested arrow.** The arrow is your territory but an enemy head may be standing on it. Does the head appear anyway, get suppressed, or arrive and force a fight?
16. Confirm the girth-3 loop and a special's 3 bordering arrows are the *same* three arrows — i.e. that the minimum enclosable territory holds exactly one special.

---

## Appendix A: Drafted Opening (deferred)

Designed, viable, and shelved until there's a real game to test it against.

**The mechanic.** Placement alone can't bootstrap territory — you need land by turn one. The rule that makes it work is the garrison-island idea, resurrected as **setup-only**: at the end of placement, any closed loop of your heads becomes territory, and you keep everything inside it. It is exactly right here and wrong everywhere else — it's the only way to make land from nothing, it's one-shot so it can't be farmed, and the heads walk free afterward.

**The decision it creates.** With a fixed head budget: one large loop swallowing two specials, spending nearly everything on perimeter and starting with no mobile force? Or a tight 3-tile loop on one special, keeping heads free to fight? Plus Catan-style blocking — placing a head on the one arrow a rival's planned loop needs.

**Prerequisites before building it**

1. ~~Girth must be 3~~ — **confirmed**, so a minimum island costs 3 heads and the phase is affordable.
2. **The map must become varied.** A rotationally symmetric map makes the draft nearly pointless — each player takes their mirrored half and only the center is contested. A draft and a symmetric map are substitutes; running both means paying for a phase that isn't earning its keep. Choosing the draft means dropping symmetry and letting snake order do the balancing, Catan-style.
3. **Guardrail against zero territory.** A player who miscounts or gets blocked can finish setup owning nothing, which under §7 is an unplayable position reachable through ordinary bad play. Fix: enforce that each player's first placements form a legal loop, then free-place the remainder.
