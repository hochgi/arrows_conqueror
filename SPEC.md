# Arrows Conqueror — Design Spec

*Working draft. Turn-based territorial conquest on an arrow tiling. Volfied's carve-and-enclose loop, rebuilt as a deterministic skirmish game.*

Status: core mechanics settled, open questions listed at the end. No implementation yet.

---

## 1. Premise

Two or more players carve territory out of a plane tiled with interlocking arrows. You advance **heads** along the arrows, leaving a **trail** behind them. When your trails close a loop, everything inside becomes yours — including any enemy units caught in it, and any **special tiles** that then start producing for you.

You can only be hurt while you are growing. That is the spine of the whole design.

### MVP delivery shape

The first playable is a **stateless, client-only, hot-seat** game: two players alternating on one machine, the whole match held in memory, no save/resume, no server, no AI. Perfect information (§4) is what makes hot-seat exactly right — there is nothing to hide between turns, so passing the mouse costs the design nothing.

This is a **delivery decision, not a rules decision**. It removes netcode, persistence and AI from MVP scope without touching a mechanic. It does have one structural consequence: it makes the question of *what a move is* concrete and urgent — see §11 item 19.

Post-MVP is deliberately not designed here. Ask before assuming it.

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

**Crossing is therefore a decision, not a tripwire.** A head standing at a point an enemy trail runs through has not crossed anything; it commits by choosing its exit arrow. Three things follow with no extra design:

- A head can **shadow** an enemy trail, travelling alongside it point after point without triggering combat, choosing its moment.
- A defender can **hold a contested point** without committing to a fight.
- Two trails can **race in parallel** through the same corridor, mutually aware and mutually unobligated — until one of them turns.

All three survive §6.2's contested-crossing rule only because **declining is always legal**. Skip is a first-class move (§4), so adjacency never forces a fight. What an enemy stack denies you is passage *through* the point — never the right to stand beside it.

Three things then unify under one definition:

- **Enemy cut** — an opponent traverses a point your trail passes through (§6.1).
- **Self-crossing** — *you* revisit a point your own trail already uses. Only an **interleave** inverts the enclosed lobes (§7). Coincidence cannot: fill reads the trail's arrow *set* (§6.1a), and re-traversing an arrow you already hold leaves that set unchanged. So the predicate is shared but §7 asks the narrower question.
- **Combat** — resolved at that point, which is where §6.2 already puts it, with its three approaches.

It subsumes the tile rule for free: an enemy cannot stand on your trail arrow without entering through its tail point, which your trail also uses.

**A point may present more than one chord.** Where a trail uses `i` in-arrows and `o` out-arrows at a point it is a join followed by a split (§6.1a), so it offers **`i × o` chords** there — one per (in, out) pair — and a traversal is tested against each. A spine offers one, a fork or a join two, a **crossover** four, and a point the trail runs through three times over offers nine. At that last one all six slots are the trail's, so no enemy can transit the point at all: a full crossover is impassable by arithmetic rather than by rule.

### Formal definition — the oriented triangular lattice

An arrow touches exactly four interesting points: its origin point, its target point, and the two spawner vertices on its left and right. With 6 arrows per point and 3 per spawner vertex, the incidence counts close:

```
6P = 2A  →  A = 3P          (6 arrows per point, 2 points per arrow)
3V = 2A  →  V = 2P          (3 arrows per vertex, 2 vertices per arrow)

arrows : points : vertices  =  3 : 1 : 2
```

which is exactly *edges : vertices : triangles* of a triangular lattice.

> **The arrow tiling is the oriented triangular lattice.**
> Lattice **vertices** are the movement **points**. Lattice **edges** are the **arrows**, each carrying a fixed orientation. Triangle **centres** — a honeycomb, two per lattice point — are the **spawner vertices**.

The chevron artwork is a decoration of a directed edge; the graph underneath is the lattice. Everything else follows rather than being asserted:

- A point has 6 incident edges — 3 in, 3 out.
- The **girth-3 pinwheel** is a lattice triangle whose three edges circulate.
- **That triangle encloses exactly its own centre, which is exactly one spawner vertex.** The atomic unit of conquest and the atomic unit of value are the same object — this is now a theorem, not an observation.
- **An edge borders exactly two triangles**, so two spawners feeding one arrow is a structural hard cap. Triple-fed arrows do not exist.
- The **board is the lattice itself, unbounded** — no quotient, no cut-out, so 3-in/3-out holds everywhere and there is no rim. What is finite is the *interesting* region, not the geometry: §7's spawner force decays with distance from the origin and reaches zero, so all the balance lives inside a disc while adjacency stays total. See *the board is unbounded* below.

**The generator constants, confirmed against the artwork.** Basis `u = (1, 0)`, `v = (½, √3⁄2)`. The three out-directions in lattice coordinates are

```
OUT = { (1, 0), (-1, 1), (0, -1) }        world angles 0° / 120° / 240°
```

which must satisfy **both** conditions and it is easy to pick a set that satisfies only one: they sum to zero (so the directed 3-cycle closes and girth is 3) *and* they sit 120° apart (so the board is mirror-symmetric rather than skewed). Each point owns two triangles, at `+(⅓, ⅓)` and `+(⅔, ⅔)` — one "up", one "down" — which are its two spawner vertices.

Two facts fall out, and both were measured rather than assumed:

- **An arrow's two flanking triangles are always one up and one down.** Never two of the same kind. So §7's cap of two feed slots per arrow is geometry, not a rule.
- **Slots alternate with in-arrows on the odd indices**, given the labelling above. The lattice picks that phase; §11 item 29 forbids anything depending on it, and this is precisely why.

The chevron's own outline — where the boundary between two tiles bends on its way from a triangle centre to a lattice point — is a **rendering** parameter and lives with the tiling implementation, not here. See [P03](docs/design/packets/P03-tiling.md).

### Orientation pattern — resolved: alternating

Balance (3 in, 3 out) does not by itself fix *which* slots are which — the 3-fold symmetry sits at the spawner vertices, not at the junctions. Two patterns were consistent with everything above, and **the lattice has the alternating one** (§11 item 1):

| Pattern | Successors from any arrow | Consequence |
|---|---|---|
| **Alternating** — out at 0°/120°/240° | straight, or turn **±120°** | both handednesses available |
| ~~Three-consecutive~~ | straight, or turn +60°/+120° | chiral board — left turns only |

The out-set at every point is {up, down-left, down-right}: three directions 120° apart, so **the six slots alternate in/out around the hexagon** and the in-set is the complement {down, up-left, up-right}. It is self-consistent throughout — the three out-vectors sum to zero, so the directed 3-cycle exists and girth is 3; exits from any in-arrow are straight or ±120°, so both handednesses are available and the board is mirror-symmetric rather than chiral. That last property is the one the crossing examples demand: a head can turn *either* right or left aside from a trail without crossing it.

**Every consequence below that was once conditional on alternating now holds outright**, and P03 generates a board from two basis vectors and a modulus rather than measuring anything. Three-consecutive stays named because the chord test is still written against cyclic slot order alone and its suite uses that layout as a **counterfactual** — the way it proves the predicate never asks which slots are in-slots. That independence is defence in depth now rather than a hedge against a pending measurement, and it is worth keeping.

**Alternation binds every board, not just the generated one** (§11 item 29). It is part of what `GeometryPort` means and a conformance requirement, because *both handednesses available* is what §5 and §6 assume when a head turns aside from a trail without crossing it — a chiral board would answer those scenarios differently. What is **not** fixed is the *phase*: which slot index the alternation starts on is the port's own labelling, and nothing may depend on it. In-arrows may occupy the even slots or the odd ones; they may not sit two-in-a-row.

The shortest directed cycle is 3, so **a stranded head loops back onto its own trail in three moves** — legal, since a trail is a set and re-traversal adds nothing to it (§6.1a invariant 2). Retreat is cheap, and that is a balance watch-point in both directions: §6.1 softens a cut by demoting rather than destroying what lies beyond it, and hardens one by evaporating backward as well as forward.

### Reachability

The movement graph is directed, which normally risks one-way currents and absorbing pockets. It doesn't here:

> A weakly connected digraph in which every node is **balanced** (in-degree = out-degree) is **Eulerian**, and Eulerian implies **strongly connected**.

3-in/3-out satisfies balance exactly, so every arrow is reachable from every other and no head can ever be trapped. This is why no against-the-grain rule is needed: a head U-turns by navigating forward around a loop, which costs real distance and lays fresh cuttable trail the whole way. Retreat stays dangerous without any special case.

**This holds on the infinite tiling only.** Cutting a finite board out of it would leave rim points with missing arrows, breaking balance precisely where camping happens and potentially creating genuine sinks at the edge.

### The board is unbounded — ~~a torus~~ **resolved: the plane**

> **The board is the infinite lattice.** It does not wrap and it does not end. Balance, and with it the connectivity proof, holds at every point because there is no point that is special.

Two finite topologies were considered and both are worse.

**A cut-out rectangle** breaks balance at the rim, which is exactly where camping happens — the failure the paragraph above describes.

**A torus** (`the lattice mod (n·u, m·v)`) fixes the rim and was the answer for most of this document's life. It was **withdrawn because it breaks even-odd fill**, and not only in the girdling case that §11 item 30 had already flagged:

> On a torus every lattice ray is a **closed loop**, so its mod-2 intersection number with any *contractible* curve is zero. A ray cast from a cell inside a small enclosure exits once, wanders the torus, re-enters once, and comes home having crossed twice. **Even parity. Verdict: outside.** Every cell, every time.

Item 30 had caught the trail being non-contractible. The ray is non-contractible too, which is the larger half, and it makes §7's stated fill algorithm return *nothing is enclosed* for every enclosure on the board. A torus fill is still constructible — flood both sides and take the one that is a disc, distinguishable by Euler characteristic — but that is real machinery in place of a ray cast, imposed to support a topology nothing else wanted.

Three things fall out of the plane that the torus had cost:

- **Even-odd fill is correct as written** (§7). The ray escapes, and the classical Jordan argument applies. A closed curve has an inside.
- **There is a centre**, so §2's map symmetry and §8's contested middle mean what they say, and two players have one frontline rather than two.
- **No size floor.** The 4×4 minimum existed only because wrap collapsed *girth-3 encloses exactly one vertex* on small tori. Unbounded, that property is local and unconditional, as is strong connectivity: the three out-directions span ℤ² and sum to zero, so every displacement is reachable in non-negative steps.

The costs are real and are paid elsewhere. **Enumeration is no longer total** — `GeometryPort` answers a bounded window rather than "every point", which is a better port anyway, since *enumerate the whole board* was always a representation leak. And **running away is now geometrically possible**, which the torus prevented by construction; §7's radial gradient removes the *reward* for it and §9 owns what remains.

- **Special tiles** are scattered on a sub-lattice of the tiling (see §7).

### Map symmetry

Special tiles and starting positions are placed **symmetrically about the origin**, so each player's home region has identical special-tile count and distance. A denser contested cluster sits at the centre, far from every start. Deterministic — no random map generation. (StarCraft's naturals-plus-contested-center recipe.)

**Which symmetry, exactly, is not free to choose — the grain constrains it.** A fair map needs an involution that is an automorphism of the *oriented* graph, and the obvious candidate is not one:

| Map | Effect on `OUT` | Verdict |
|---|---|---|
| 180° rotation `(i,j) ↦ (−i,−j)` | reverses every direction | **not a symmetry** — an anti-automorphism. Player 2 would get a board running backwards |
| 120° / 240° rotation | permutes `OUT` | automorphism, **order 3** — serves three players, not two |
| Reflection `(i,j) ↦ (i+j, −j)` | fixes `A`, swaps `B` and `C` | automorphism **and** involution — this is the one |

> **Two players are placed as mirror images in a line through the origin.** In world coordinates the reflection is the x-axis; it fixes the origin, so it preserves any radial gradient, and it is an exact automorphism of the oriented graph, so every line of play available to one player has an exact counterpart for the other.

The mirror swaps handedness, which is harmless precisely because §2's alternating pattern made the board non-chiral in the first place. Three-player symmetry is the 120° rotation and is deferred with the rest of 3+ (§11 item 11).

---

## 3. Units: Heads and Stacks

- A player's units are **heads**.
- Heads on the same tile may **merge** into a **stack**.
- **Stack size is lives.** A 3-stack is literally three heads standing together. There is no separate HP stat — a stack that loses one becomes a 2-stack.
- **Splitting is unmerging.** A stack may shed heads freely (see §5, sentries). The rules impose no minimum except the anchor a branch costs.
- **Merging is free and automatic.** Two of your heads ending a move on the same arrow merge. No action cost, no declaration.

Both directions are free, deliberately. Spawners produce **dispersion** — heads arrive one at a time on different arrows (§7) — so concentration is already the work the player is doing. Taxing the merge would tax the exact play the economy forces on you.

### Speed

A stack moves faster than a single head, but **sub-linearly** — stacking must never beat splitting on raw throughput.

> **`speed(N) = 1 + floor(log₂ N)`** — every doubling adds one step.

```
N:      1  2  3  4  5  6  7  8  ...  15  16
speed:  1  2  2  3  3  3  3  4  ...   4   5
```

**Allowance is a whole number, and nothing banks.** No fractional movement, no carry between turns, no saving a step for later. A group gets its steps and either spends them or loses them.

This is a deliberate trade against an earlier harmonic curve. Harmonic had a pleasing rhythm as a stack's remainder filled and drained, and it was genuinely hard to track at the table — you cannot tell at a glance how far a 5-stack moves this turn without knowing what it banked last turn. Predictable jumps beat elegant fractions in a game whose whole appeal is that an attentive player can compute the next move (§1).

Two properties make this the right ladder:

- **Splitting still wins on throughput, always.** A 4-stack takes 3 steps where four singles take 4; a 16-stack takes 5 where sixteen singles take 16.
- **The pair is free.** `speed(2) = 2`, exactly what two separate heads get, so pairing costs nothing in distance and buys concentration — and two is also the minimum sentry §5 allows. **The game's natural atom is the pair**, and it falls out of the curve rather than being chosen.

Exact rationals do not leave the engine: spawner accumulators still carry their remainders (§7). **Movement is integer, economy is exact rational** — production is a slow trickle you must be able to bank, whereas tempo you did not use is tempo you gave away.

### Merging costs the turn

Merging is free (above) but it is **not instant**.

> **A stack that merged this turn has speed 1 for that turn**, and **speed 0 if any group that arrived was larger than what it joined.**

The heads that walked in have already spent their move getting there — they are carried, not carrying. So the only question is what fraction of the merged stack has already moved. Arrive as the **minority** and most of the stack is fresh, so it may still take a step. Arrive as the **majority** and most of it has already gone, so it stops. Equal counts still move: half is fresh.

***Any* is load-bearing.** Once a stack is barred for the turn, a later small arrival cannot un-bar it — otherwise merging big-then-small would launder the restriction, and the order the player chose (§4) would decide the rule rather than the rule deciding.

Stated as a speed override rather than a special case, so nothing else needs changing: a constituent that already stepped this turn has therefore already used the merged stack's whole allowance, and the bonus arrives next turn when the stack is no longer *recently merged*.

This prices two exploits at once. Without the speed-1 clause, walking a spare head into a stack would be a free mid-turn speed upgrade and the correct opening move every turn would be to merge before doing anything else. Without the speed-0 clause you get the conveyor below for nothing.

### Allowance and spending

A **group** is the heads of one player standing on one arrow. Allowance belongs to the group — not to a head, not to a player.

> **A group may step while `spent < speed(size)`**, where `spent` counts the steps that group has already taken this turn.

Both are whole numbers and neither survives the turn boundary. Two rules make a change of composition behave:

- **On a split, both parts inherit `spent`.** Only the portion that moves pays for the step. The portion that stayed has spent nothing extra and may still act — branching off in another direction, or following the same path a step behind (§6.1a).
- **On a merge, the arrivals' spending is discarded and the destination's is kept**, and the merged group's speed is overridden per the rule above. The arrivals already paid to get there; they are carried, not carrying.

**Splitting needs no penalty of its own, and that asymmetry is not an oversight.** Merging up mid-turn would be a free upgrade if unpriced, because a larger group is strictly faster. Splitting down needs no such guard: inheriting `spent` already prevents the double dip, because a stack that has taken its step cannot split into scouts that have not.

What survives is exactly the throughput advantage splitting is supposed to have:

| a fresh 4-stack (speed 3) | steps this turn |
|---|---|
| moves as one | **3** |
| splits 2 + 2, both move | **4** — two steps each |
| splits 1+1+1+1, all move | **4** — one step each |
| moves as one, *then* tries to split | **3** — the parts inherit the spend |

The last row is the whole rule in one line: **splitting is a decision you make before you move, not after.**

And a group large enough to afford two steps takes its rear guard with it. A 6-stack splitting 4 + 2 sends the 4 forward three steps while the 2 follows behind at two — a spearhead with its firebreak trailing it, from one ordinary split.

### The conveyor

The merge rule permits a real manoeuvre worth naming, because it looks like an exploit and — priced — is not.

Park heads along a chain of arrows and shuttle forward link by link: the rear group merges into the next arrow, that stack steps into the next, and so on, until the whole parked force stands on the far end. Unpriced this is a genuine throughput exploit — a chain of four single heads delivers 10 head-arrows in one turn where those four heads moving independently deliver 4.

The speed-0 clause prices it exactly. Each link must be **no smaller than the stack arriving at it**, and the arriving stack grows every link, so the breadcrumbs have to grow at least as fast as their own running total — geometrically. A five-link conveyor is `1, 1, 2, 4, 8`: sixteen heads parked to deliver **15** head-arrows, where those sixteen heads moving as their own groups would deliver 50.

So the conveyor is not a speed trick, it is a **concentration trick that costs most of its own movement** — exactly the trade §3 is about, made by hand. A naive chain of equal links gets one hop and stops.

On a trail the parked links are cuttable, and one cut takes the whole region between the nearest surviving heads — so a conveyor laid across open trail is a large, immobile, visible investment sitting in the one place it can be taken away. In your own territory it cannot be touched, and that is where it is strongest — the same "a large empire repositions instantly" pressure §10 already accepts.

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

- Players alternate turns. MVP is 2 players, hot-seat (§1).
- Perfect information. No fog of war, no hidden state.

### A turn is a sequence of single steps

> **A move takes a portion of one arrow's heads one step along an out-arrow. A turn is an ordered list of moves, ended explicitly.**

A move names a **source arrow, a destination out-arrow, and a count** — nothing else. There are no unit identities to track; a stack is just the count standing on an arrow (§5).

- **The player chooses the order.** Which stack steps next is a player decision, not an engine rule. This is why the per-step model was chosen: there is no within-turn resolution order to invent, and the ordering the player picked is already carried by the move list a replay stores.
- **A stack may move or skip.** Skipping is a first-class choice, not the absence of one.
- **A stack may step more than once per turn** if its allowance permits, and those steps may be **interleaved** with other stacks' steps. A 3-stack at 1.83 does not have to spend its steps consecutively.
- **Sending different portions to different out-arrows is how a fork is made** — two moves from the same source, each with its own count. The pincer (§7) needs no special move.
- **The turn ends when the player ends it**, or when no unit has a whole step left.

**Ordering within your own turn is therefore a real tactic.** Stepping one head onto a stack to reinforce it before another head commits to a crossing is a legal and intended play — though §3's merge rule means the reinforced stack pays for it in tempo.

**Skipping is normal, not a fallback.** A rearguard head on an open trail is doing its job by standing still (§5): stepping forward only lengthens the trail it is there to guard, and drags it away from the stretch it defends. Expect a typical turn to move a minority of the units on the board.

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

There is **no drop action and no pickup action.**

> **An arrow holds a count of heads. A move takes any portion of that count one step along an out-arrow.**

Leaving some behind *is* the drop. Sending heads onto an arrow that already holds yours *is* the pickup, and it merges under §3 like any other arrival — no carve-out, no declaration, no placed-versus-loose distinction.

A **sentry** is therefore not a kind of unit. It is the name for heads you chose not to bring: a stationary garrison defending that stretch of trail, indistinguishable from any other stack of the same size sitting on the same arrow.

This is the third leg of the tension: every head left behind makes the chain safer and the far end slower and weaker. Greed, speed and safety trade against each other in a decision made repeatedly along the way — and because the portion is just a number on the move, that decision is available at *every* step rather than at authored moments.

### Branching costs an anchor

**Linear trail carries no heads.** A tip walks, marking arrows behind it, and leaves nothing. The trail is a mark on the board, not a chain of garrisons — every sentry above is a head you *chose* to leave. There is exactly one place the rules require one.

That place is **branching**. A trail that joins or splits is no longer one trail: it is several **mini-trails** meeting at a point, and each of them needs its own anchored end.

> **A move that gives a point a second trail in-arrow must leave at least one head on the in-arrow it arrived by. A move that gives a point a second trail out-arrow must leave at least one head on the out-arrow it departed onto.**

One head before a join, one head after a split. A **crossover** — a point your own trail already runs through — is a join followed by a split (§6.1a), so it costs both: one before, one after.

**A lone head therefore cannot branch.** It pays its only head and stops there, becoming the anchor rather than passing through. That is not a clause written for singles; it is a bill a single cannot afford. It is also the whole answer to *"what if the tip is too small to pay?"* — too small to pay and unable to act are the same state, and it is a state the rules already handle: the head stays, immobile, until reinforced or captured.

**The anchor is a toll, not a wall.** A front spends its kill on the first head it meets and halts at the *next* (§6.1), so a single anchor absorbs one kill and the front rolls on. What the anchor buys is the price of branching and the rule above — never immunity. A player who wants a branch point to actually stop something leaves two, exactly as anywhere else.

**This constrains what you may leave, not what may exist.** Damage can empty a branch point, and the resulting state is legal — it simply could not have been created deliberately. Nothing needs repairing when it happens, because §6.1's spread is total with or without anchors. An unpaid branch is just an unpaid branch.

> An earlier draft set the floor at *"one head per open side"* — two mid-trail, on the argument that two is the smallest garrison that halts a front. **The arithmetic was right and the rule was fatal.** It read the arrow you were *vacating*, so leaving zero counted as leaving fewer than two, and no group could ever fully step off a mid-trail arrow: a 2-stack could not move at all, and an N-stack shed two heads per arrow of trail it laid. It also contradicted the tension two paragraphs above — a garrison is meant to be a *choice*, and that rule made it a tax.

### Reading the board

Each arrow shows the count of heads standing on it, in its owner's colour. Closed territory reads as solid; an **unclosed trail reads as visibly different** — reduced opacity, or stripes.

That distinction is not decoration. "Is this stretch cuttable?" is the question a player asks most often (§6.1), and under the safety rule it is the *only* thing separating a head that cannot be touched from one that can. It has to be answerable at a glance rather than by tracing a path back to its anchor.

The interaction model is Galcon-like: pick a source arrow, pick a destination, send a portion.

---

## 6. Combat and Damage

There are exactly **two** ways to hurt a player.

### 6.1 Cutting a trail

An enemy head crosses your open trail at a **point**. If the crossing succeeds, the trail **evaporates in both directions from the cut point** — forward with the grain, and backward against it.

Each evaporation front carries exactly **one kill**:

> **A front spends its kill on the first head it meets, and halts at the next head — which survives, along with its arrow and the point that arrow points into.**

So a **lone head bleeds evaporation without stopping it; a pair stops it.** One head is a toll, two is a wall. That arithmetic is why sentry *size* is a real decision (§5) even though the rules only ever require one head, and only to pay for a branch.

- **A point is all-to-all.** Where the trail has `i` in-arrows and `o` out-arrows at a point, that point is a join followed by a split: **every in feeds every out**. Not a convention picked to break a tie — the arrow set holds no pairing to recover (§6.1a), and a set with `i` ins and `o` outs simply *is* a join-then-split.
- **A front per branch, a kill per front.** So a forward front reaching a point continues into *every* out-arrow and a backward front into *every* in-arrow, each branch carrying whatever kill the parent had left. A cut on a spine costs one head; a cut below a three-way join costs three.
- **A front halts per arrow, not per point.** It stops when it meets a head **on the arrow it is entering**. A head does *not* shield the point ahead of it against evaporation — that range belongs to combat (§6.2), and the two jobs sit on different axes.
- **Territory is a wall.** Backward evaporation reaching your own closed ground stops there and costs nothing. There is nothing to destroy and nothing to charge (§5).
- **A stack is an anchor.** Trail beyond a halting stack is anchored *on that stack* — live, not dormant. It can be extended, defended, and driven home.
- A stranded stack **fights its way home**. Because the graph is strongly connected (§2), it does this by looping forward around the grain rather than reversing, laying fresh cuttable trail the entire way.

**Two grades of anchor, and the difference is load-bearing.** A trail anchored to your **territory** is fully live: it can close and claim everything it encloses (§7), and heads on it are not encircled (§6.3). A trail anchored only on a **stack** is live but lesser — it can be extended and driven home for a *land bridge*, but it encloses nothing, and it does not save a head from conversion inside enemy territory. Without that distinction a parked stack would be a founding site, which §7 forbids outright.

**Fragments are re-attachable, and this needs no special machinery.** The ordinary rule already covers it: a path counts once it runs continuously from your territory to your territory. Lay a fresh path from home that reconnects to a stack-anchored fragment and the whole chain is promoted back to the full grade. Nothing floats, nothing is tracked separately — a demoted fragment is simply a wall waiting for a road.

Four properties fall out of this:

**A cut destroys one region, and you choose how big a region is.** Heads standing on a trail partition it into regions, and evaporation runs from the cut in both directions until it meets one, or meets territory. Everything between those two boundaries is lost; everything outside them is untouched. So a player sets the price of being cut by choosing how far apart to place sentries — the answer is *region length*, legible on the board at a glance rather than by tracing a path (§5).

A single sentry does not bound anything: the front spends its kill on it and rolls on to the *next* head, so a lone sentry buys one arrow of delay while a pair buys the boundary. That arithmetic sits behind every garrison decision in the game — and it is **advice, not a rule**. The only head the rules require is the one that pays for a branch. Leaving a trail bare from home to tip is entirely legal, costs nothing, and means one cut takes the lot.

**Cut depth is still everything, by a better mechanism.** A deep cut no longer destroys more, it **demotes** more. Take out the region touching the victim's territory and everything beyond it survives — sentries intact, territory anchor gone — dropped to the lesser grade: claiming nothing enclosed, worth only a land bridge if it can be driven home. Attackers are still drawn toward the victim's own border, precisely where the victim is strongest and the attacker most exposed. Cut value and cut difficulty rise together, with no balancing constant.

**Sentries are firebreaks in both directions, and prying one open takes a sequence.** A firebreak is two heads a player chose to leave. The first cut from either side spends its kill and halts on the survivor, costing one region. The second cut kills that survivor and **rolls on**, taking the region beyond as well and leaving the point bare. A third floods it freely. Each of those is a separate crossing — a separate move, a separate exposure, on a separate turn, against a defender who can see it coming (§4). Dismantling a garrisoned trail is a siege, not a lucky swing.

**Forks are ordinary trail, but branching is not free.** A fork is one arrow with two trail arrows leaving it; nothing about its *behaviour* is privileged and it needs no rule of its own — a cut behind it floods into both branches and costs one head on each. What it costs is the anchor §5 charges to create it. Trail *shape* stays a strategic choice — a branching trail covers more ground, offers more cut points, and bleeds once per branch — and it now comes with a price list: one head per join, one per split, two at a crossover.

A cut is therefore expensive but survivable. You lose a head, you lose the region you were cut in, and what lies beyond it is demoted rather than destroyed. This matters: under a rule where cutting destroyed the whole trail, ambition would be suicidal and the rational play would always be small safe nibbles. Here, large enclosures stay attemptable — and the spearhead itself survives, which is what keeps a six-turn operation worth starting.

### 6.1a Trail invariants

> **A trail is a set of arrows.** Not a walk, not a tree.

Nothing about it records the order it was laid, which heads laid it, or how many times one has walked it. Every question the rules ask of a trail — where evaporation stops, whether a crossing happened, what is enclosed, what is still anchored, whether a branch was paid for — is answerable from that set plus the counts standing on it. **Trails have no memory**, and that is a load-bearing property: it is what removes head identity from the engine entirely (§3, §4), and it is the reason none of the rules below need a resolution order.

Three invariants govern every trail:

1. **Movement is forward along the grain**, always (§2).
2. **The trail is a set.** Stepping onto an arrow it already holds is legal and adds nothing.
3. **Points may be revisited.** Crossing your own trail by looping around is legal, and inverts which regions are claimed when the path eventually closes (§7, even-odd).

**Invariant 2 constrains the trail, not the heads.** A **lagging group is legal and expected**: split a stack, send the front group two steps and the rear group one, and the rear group stands on an arrow the front group laid. The trail did not grow a second copy of that arrow. This is how a spearhead brings its firebreaks along (§6.1) instead of abandoning them at the start line.

**Why 2 and 3 matter more than they look.** Even-odd fill needs a boundary that self-intersects only at points, never *along* an arrow — a curve permitted to double back along itself leaves "inside" genuinely undefined. The set representation gives that for free, twice over: a set holds no duplicates, and movement along the grain means a second traversal is *coincident*, never anti-parallel. So re-traversal is not doubling back, and fill reads the same boundary however many times a head walked it.

> This is why **fill must read the arrow set and never the move list.** Under a re-tracing prohibition that was automatic. It is now an assertion, and it is the one place where getting the representation wrong would silently produce a wrong answer instead of a crash.

**A point is all-to-all — this is what "no memory" costs, and what it buys.** Where the trail uses a point more than once, the arrow set holds several in-arrows and several out-arrows and **no pairing between them**: a walk that went `a→a, b→b` and one that went `a→b, b→a` leave the identical set. There is nothing to recover, so nothing is guessed. The point simply *is* a join followed by a split, every in feeding every out. Two consequences, both intended:

- **Evaporation spreads to every continuation**, in its own direction and never against it (§6.1).
- **The trail presents `i × o` chords there** for the crossing test (§2) — one per (in, out) pair. A knot is genuinely more cuttable than a spine, which is the right sign: more strands through a point, more ways through it.

Three answers were on the table and only this one asserts nothing. *Canonical pairing* — pick one by a slot convention — routes damage down arrows the player never connected. *Immunity* — declare an ambiguous point uncuttable — is a patch with no mechanism behind it. All-to-all is not a resolution of the ambiguity; it is the observation that **the question was wrong**. It presumed a trail is a walk that pairs its entries with its exits, and a trail is a set.

Branching is priced rather than restricted: §5 charges a head before a join and a head after a split, so a crossover costs two. That is what stops a lone head branching, and it is the only head the rules ever require.

**Headless trail is ordinary.** An earlier draft carried a fourth invariant — *every tip carries a head* — justified on the grounds that evaporation runs forward to the first surviving stack, so a branch whose tip dies died with it. That reasoning only ever looked forward. A plain mid-trail cut leaves the stretch *behind* it anchored with no head on it, so the invariant was never true; it was violated by the ordinary operation of §6.1. It is dropped rather than repaired. A headless stretch is simply a wall: it cannot close, nothing charges to it, fill counts it, and a head may walk onto it later and put it back to work — which is exactly §6.1's re-attachment.

**A head can never be trapped.** Balance gives strong connectivity via the Eulerian argument (§2). Since invariant 2 no longer removes arrows from consideration, that argument covers move legality directly: three out-arrows always exist at every point and none of them is forbidden. No stuck-head handling is needed anywhere in the engine.

> An earlier draft proved this the hard way, from 3-in/3-out plus no-re-trace: each visit to a point consumes one in-arrow and one out-arrow, so after *k* arrivals at most *k−1* exits are used and one is always free. **That proof is true for a path and false for a tree.** A split makes one arrival fund several departures — fan a 3-stack out of a point onto all three of its out-arrows and the accounting goes negative, stranding anything that arrives there afterwards, including the sentry the player was told to leave. The proof is not patched here because invariant 2 removes the premise it needed.

### 6.2 Contested crossings

Crossings resolve at points, and a stack contests the point **it points into**. That range is combat's alone — evaporation halts per arrow, not per point (§6.1), so a head guards the point ahead against an *enemy* and its own arrow against *fire*.

> **When two players' stacks point into the same point, a move against that point is an attack rather than a step. Both sides lose one head.**

That is the entire rule. No attrition table, no tie-break, no bonus constant.

- **An attack costs a move**, spent from the attacking group's allowance (§3) like any other step. A 2-stack gets one attack a turn; a 4-stack gets two.
- **Declining is always legal.** Skip is first-class (§4), so a stack may stand beside an enemy indefinitely. What it may not do is walk *through* the contested point without fighting for it. This is what keeps §2's promise intact — shadowing, parallel racing and holding a contested point all survive, because none of them requires passing through.
- **Combat is interruptible.** A fight is a sequence of moves rather than one resolution, so reinforcements can arrive mid-fight and either side can disengage between rounds. A large stack can no longer grind a defender down inside a single turn; it can only out-bleed them over several, in the open, where the loser can see it coming.

**Multi-prong is now emergent.** Two of your stacks pointing into one enemy-held point each attack for one, so the defender bleeds at twice the rate while each of yours bleeds at once. The reward for the genuinely hard thing — splitting your force and coordinating its arrival — falls out of rate arithmetic rather than a special case. This is what the previous draft was buying with a tie-flip, bought instead with nothing.

**Sentries have two distinct jobs, and they sit on different axes.** A sentry **gates** the point ahead of it against an enemy step, and **absorbs** evaporation arriving along its own arrow from either side. Different threats, different ranges — one per point, one per arrow — so *where* along a trail you place them stays a real decision rather than one undifferentiated blob of defence.

An earlier draft unified the two ranges, on the grounds that a stack shields the point it points into against fire as well as against enemies. It cannot: a front that reaches a point has already come *through* one of that point's arrows, and letting a head on some *other* arrow retroactively bar it produces answers that contradict the ordinary cases. Per-arrow is the local rule, and locality is what keeps evaporation total.

No randomness anywhere. A six-turn enclosure never dies to a bad roll; it dies to being outplayed.

### 6.3 Encirclement

Conversion triggers on **state, not on event**:

> **An enemy head inside your territory with no anchored trail is encircled, and converts.**

Closing a shape around enemy heads is the common case, not a separate rule — the closure simply puts them inside your territory and severs them at once. **Stacks convert intact:** encircle a 3-stack and you gain a 3-stack, not three singles and not a token survivor.

Two consequences that are easy to miss:

- **Sentries do not protect a raider from conversion.** A firebreak bounds how much trail a cut destroys, and the fragment beyond it stays live — but live on the **lesser grade**, anchored on a stack rather than on territory (§6.1). Conversion asks for a *territory* anchor. So a raider inside enemy ground is captured however well its trail was garrisoned, and the two grades are what keep this true without a carve-out.
- **"Stranded" means two different things.** Stranded in *neutral* ground is the recoverable case of §6.1: a stack-anchored fragment, fight your way home. Stranded inside *enemy territory* is capture. The distinction is load-bearing.

This is how the head pool moves between players, and it is what makes encirclement rather than attrition the decisive move (§9): a well-placed lasso is a 2× swing on the axis that decides the game, which is the comeback vector a losing player needs a reason to attempt.

---

## 7. Territory and Economy

### Closure — the Splix/Hexa model

> **Depart from your own territory. Land back on your own territory. Everything the path encloses becomes yours, and so does the path itself.**

This is the hexa.io / splix.io rule, not "any cycle of your own trail."

- **An unanchored loop is nothing.** A trail severed from your realm claims no territory under any circumstance. There are no islands, no garrison forts, no founding.
- **A path that encloses nothing becomes a thin strip.** Travel from one holding of yours to another without surrounding anything and you have built a **land bridge** — the arrow chain itself becomes territory, one tile wide.
- **A stack anchor pays a land bridge and nothing more.** A fragment that survived a cut is anchored on its own stack (§6.1). Drive it into your territory and you claim **the path itself** — a land bridge — but it encloses nothing, because enclosure requires territory at *both* ends. This is what makes salvage worth attempting, and what stops a stack parked in open ground from becoming a founding site.
- **Self-crossings invert.** Crossing your own trail doesn't close anything on the spot; it flips which lobes count as enclosed when you finally land. Formally: even-odd fill. Figure-eights resolve without a special case.

Closing grants the enclosed tiles **and everything inside them** — enemy heads (converted) and special tiles.

**Even-odd is correct here because the board is a plane** (§2). A ray cast from a candidate tile escapes to infinity and crosses the boundary an odd number of times exactly when the tile is inside — the classical Jordan argument, and it needs the ray to *leave*. This was the deciding argument against a toroidal board: there a ray closes on itself and always crosses a contractible boundary an even number of times, so even-odd reports *outside* for every tile of every enclosure. The rule below reads as it always did; what changed is that it is now true.

Two consequences worth stating, because they are what "unbounded" costs and buys:

- **A closed curve always has an inside.** There is no girdling case, no non-separating loop, and no homology test anywhere in the engine.
- **Fill is bounded by the trail, not by the board.** A trail of *L* arrows cannot enclose more than `O(L²)` of them, so the sweep is finite even though the board is not — and it is the only place the engine ever needs a bounded region of an unbounded lattice.

### The pincer

A forked trail whose two branches both land on your territory **is a valid conquest**, and it requires no additional rule. Branches land one at a time: when the first arm lands, the whole drawn path becomes territory, stem included. The second arm is then an open trail hanging off a fork point that is *now territory*, so its landing is an ordinary territory-to-territory closure — and it takes the ground between itself and the now-solid first arm.

The two arms never need to form a directed cycle. **Enclosure is a property of the curve, not of the flow along it.**

This gives forking an offensive identity rather than a purely defensive one: two arms sweep out, both come home, and the ground between them falls. Paid for by splitting (which slows both arms and costs an anchor on each, §5), by having two trails to defend instead of one, and by the stem being a single point of failure — a cut there destroys its region and demotes *both* arms at once (§6.1), so the stem is the stretch most worth garrisoning and the stretch the defender most wants to reach.

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
- **The atomic unit of conquest and the atomic unit of value are the same object.** The girth-3 minimum loop is three arrows pinwheeling about a centre; a special is a centre bordered by three arrows; and they are the same three arrows — a lattice triangle encloses exactly its own centre, which is exactly one spawner vertex (§11 item 16). So **the smallest territory the board permits encloses exactly one special**, which is what sets the scale of the whole economy and what makes the drafted opening affordable (Appendix A). Every board must satisfy it: it is a `GeometryPort` conformance invariant, not an observation.

### Spawner logic

- A spawner has a **force** *f*, a rational fraction ≤ 1/3. **1/3 is a very rare maximum**; typical values are **1/9 or 1/12**. Total output is *f* heads per turn.
- **Each turn, one adjacent arrow gains *f***, cycling round-robin. Post-MVP, other distributions per spawner type.
- Each **accumulator belongs to the arrow, not the player.** When one reaches 1, a head appears on that arrow — merging into any stack already there — and the accumulator **carries the remainder** rather than resetting to zero. Nothing is wasted, which matters once two spawners feed one arrow and overshoot is routine. **This is the only place in the game that banks anything** — §3 deliberately does not, since tempo you did not spend is tempo you gave away, whereas a spawner's trickle has to accumulate to be worth anything at all.
- **An arrow that changes hands starts fresh.** Its accumulator resets to zero on capture — the one case where progress is destroyed rather than carried.
- **An enemy head standing on the arrow halts accrual.** The accumulator neither advances nor resets; it holds at whatever it had reached and resumes when the intruder leaves. Nothing spawns into an occupied arrow.

**A blockade costs the spawner that share's output.** The round-robin still lands on the frozen arrow; the fraction simply does not accrue and is gone. Total output drops by a third per blockaded arrow. The rotation is a fixed cycle that never varies with board state, which keeps the deterministic rhythm players count on.

**Blockading is real, and it is not free.** A head parked on a rival's spawner arrow freezes that share outright. But to get there it laid a trail, and that trail is cuttable — and by §6.3 a head left inside enemy territory with no anchored trail is *converted*, not merely stranded. So a blockade has a maintenance cost and a decisive failure mode: one successful cut both damages the blockader and captures it.

**The round-robin is what implements the thirds.** No player-level fractional economy is needed: hold 2 of 3 arrows and you simply receive 2 of every 3 spawns.

**Reset-on-capture desynchronizes production.** Arrows taken on different turns run on different clocks, so heads trickle out at staggered intervals instead of arriving in waves. The desynchronization is earned rather than configured.

It also makes **border churn economically sterile.** An arrow flipping back and forth never produces anything for anybody, so consolidating beats raiding for its own sake — and a raid that holds an arrow two turns and loses it has still erased everything the owner banked there. Only securely held ground pays.

**Spawners produce dispersion, not stacks** — heads appear one at a time on different arrows. Concentration is something a player must actively do.

### Stacked spawners

An arrow may border **two** spawners. Its single accumulator receives from both, and coprime denominators (1/9 against 1/12) produce compound, aperiodic-feeling spawn timing.

**Overlap is common where spawners are clustered, and rare where they are scattered** — which, since density is deliberately uneven (below), means the contested centre is riddled with double-fed arrows while home regions mostly are not.

This is **deterministic irregularity** — no randomness anywhere, yet a rhythm complex enough to feel organic while staying fully predictable to a player willing to do the arithmetic. Double-fed arrows become natural **keystones**: capturing one wounds two spawners and gains two income streams at once, so overlapping neighbourhoods become the map's hot spots without any special-casing.

**Overlap roughly halves fill time.** A single-fed arrow at 1/12 needs 36 turns; one fed by a 1/9 and a 1/12 gains 7/36 per three-turn cycle and fills in about **15**. Two 1/12s give 18. That is what makes contested ground productive at all — an arrow that flips every twenty turns is worthless at 36-turn fill and worth fighting for at 15.

### The emergent income landscape

The consequence worth designing around: **a single spawner's three arrows produce at three different speeds**, because each has different *other* neighbours. The round-robin is perfectly even; the outcomes are not. One arrow is double-fed and pops every 15 turns while its sibling is isolated and takes 36.

So the map develops rich arrows and poor arrows determined purely by spawner placement geometry, with **no per-tile data authored anywhere**. Knowing which arrows are the good ones becomes real map knowledge, and it comes free from the geometry.

### Force should scale with contestedness

Reset-on-capture has a consequence worth designing around. At *f* = 1/12 a single arrow needs **36 turns** to fill — twelve gains at one per three turns — so an arrow anywhere near a frontline will never pay out at all. A uniform scatter of slow spawners would therefore make the contested central cluster (§8) the *least* productive region on the map, inverting the entire point of putting it there.

> **Fast spawners belong where the fighting is.** Put the rare *f* = 1/3 specials in the contested centre, where 9 turns per arrow is quick enough to pay out between flips. Put the slow 1/9 and 1/12 specials in home regions, which have the quiet decades they need.

This gives spawner placement a design principle rather than a scatter, and makes the centre genuinely worth bleeding for.

**Density scales with contestedness too, and for a second reason.** Force sets how fast one spawner pays; density sets how many arrows are *double-fed*, which halves fill time again on top of it. Clustering is therefore the cheaper of the two levers for making the centre productive, and scattering is what keeps home regions quiet without needing a slower *f* than 1/12.

It also dissolves a tension that would otherwise be real. Spawners must be **scarce** — they are the objective, and a board where a third of all arrows produce is a board nobody fights over. But overlap must be **common**, or contested arrows never pay out. Those pull opposite ways under a uniform scatter, and not at all under a clustered one: scarce overall, dense where it matters.

### The radial gradient — and what bounds an unbounded board

The board does not end (§2), so *contestedness* cannot be a band index into a finite rectangle. It is **distance from the origin**, and both levers are functions of it:

> **Force and density both decay with radius, and both reach zero.** A spawner at distance *r* from the origin runs at *f*(*r*), and beyond a **cutoff radius *R*** there are no spawners at all. Everything outside *R* is barren ground: walkable, enclosable, and worth nothing.

The cutoff is what makes an unbounded board playable, and it does the job the torus was doing, better:

- **Scarcity is now definable.** "Spawners are scarce" was previously a fraction of a finite `2nm`; it is now a count inside a disc, and the disc is the tuning parameter. One number, *R*, in place of a board size `(n, m)`.
- **Fleeing gains nothing.** A player who runs past *R* is running into a region that produces nothing, while the opponent keeps every spawner they hold. Distance stops being shelter and starts being surrender. What the torus achieved by removing the option, the gradient achieves by removing the reward.
- **The interesting region stays finite** even though the geometry does not, so every balance question — total force, spawner count, opening distance — is asked of a disc and answered the same way it would have been on a finite board.

> **MVP defaults, chosen to be playable rather than derived.** Three bands by radius: a **centre** disc at *f* = 1/3 with roughly **half** its eligible vertices carrying a spawner, a **mid** annulus at 1/9, and a **home** annulus at 1/12 with **an eighth** density. Beyond the outermost annulus, nothing. *R* and the two band radii are set with the opening distance so that each home sits in the outer band and the centre is roughly equidistant from both.

The arithmetic those are aimed at, since every arrow borders exactly two eligible vertices and so has two feed slots. At half density, **three quarters of centre arrows are fed and a third of those are double-fed**, and **seven in eight centre spawners have at least one keystone arrow** — the double-fed ones that wound two spawners when captured. At an eighth, home arrows are mostly single-fed or bare and fill on the scale of decades, which is what the quiet is for.

A starting point for the first playtest, not a result. What they are chosen to produce: a centre that pays out inside ten turns and is therefore worth bleeding for, a home economy that rewards being left alone, and a board where sweeping the specials is not something a player can do.

**Bands rather than a smooth curve, deliberately.** A continuous *f*(*r*) would need a rounding rule to land on a rational, and §7 requires exact rationals with small coprime denominators — the whole coprime-denominator rhythm depends on 1/9 against 1/12 rather than on 1/9 against 0.1083. Bands keep the values authored. Post-MVP jitter is compatible with all of this on one condition: it must be a **pure function of the vertex and a setup seed**, never a draw from an RNG, or it takes determinism (ADR 0001) with it.

### Placement and force are setup data, not rules

Everything in the two blocks above is a **number to be tuned**, and none of it is a mechanic. That distinction has to survive contact with the code, or the first retune becomes an engineering task instead of a table edit.

> **No rule reads a force's value.** Accrual takes *a* rational per spawner and *a* set of spawner vertices from the board, and does the same arithmetic whatever they are. Nothing in the core knows what "the centre band" is, nothing branches on 1/3 versus 1/12, and no threshold anywhere compares a force against a constant.

So the whole of the placement scheme — which eligible vertices carry a spawner, which band each sits in, what force each runs at — is produced by **match setup** (§8) and consumed as opaque rationals. Retuning means editing the table setup builds from; it does not mean touching the engine, and it cannot change which scenarios pass.

Two things must hold for that to stay true:

- **A force is an exact rational, never a float.** Carry, reset-on-capture and the coprime-denominator rhythm are rules; the numerator and denominator are data. `1/9 + 1/12` has to be exactly `7/36` for a retune to be a retune rather than a new drift profile.
- **Density and band boundaries live in one place.** They are inputs to placement, not conditions scattered through it — one table, read once, at setup.

If a rule ever needs to ask *how large* a force is, or *where* a spawner sits, that is a design change and not a tuning change, and it belongs in §11 rather than in a branch.

### What the spawn rate implies about victory

**Cutting is barely an attrition channel any more, and that changes the answer.** Linear trail carries no heads (§5), so a cut on a bare stretch kills **nobody**. It burns trail to the next head and destroys the region it landed in; everything beyond is demoted, not killed (§6.1). A committed attacker cutting every 3–4 turns is denying *tempo*, not removing heads.

So the comparison is no longer heads-destroyed against heads-produced. It is **turns of work denied** against **heads accrued**, and those are different currencies:

- A destroyed region of *R* arrows cost its owner *R* moves to lay, plus whatever the enclosure it was building would have been worth.
- A spawner accrues one head every 1/*f* turns, and a head is worth roughly its remaining reach.
- Heads only actually die in two places: **§6.2 combat**, one apiece per exchange, and **§6.3 conversion**, wholesale.

**The victim picks which currency they pay in**, which is the sharpest consequence of the bare-trail default. Run bare and fast, and cuts cost you trail and time but no heads. Garrison, and cuts cost heads instead — but you paid those heads up front by parking them. There is no dominant answer on paper, and finding out which is right is most of what the first playtest is for.

**Force still sets the game's character:**

| *f* | Head every | Effect |
|---|---|---|
| 1/3 | 3 turns | Economy dominates outright. Nothing an attacker does with cuts keeps pace, so **encirclement is the only real killer** and elimination is mop-up after you have taken someone's spawners. Reserved for the contested centre, where arrows flip too often to reward anything slower. |
| 1/9 | 9 turns | Production and denial trade roughly evenly. Cuts hurt because of what they *cost you to rebuild*, not because of what they kill. |
| 1/12 | 12 turns | Denial dominates. Heads are precious, a lost region is expensive, and a player who is cut repeatedly cannot outproduce it. The home-region value, where the quiet is supposed to be what pays. |

**What moved, and why it is not a retune.** The earlier reading of this table put 1/9–1/12 "near the crossover, where attrition is viable." Attrition by cutting is now close to nil, so the crossover moved decisively toward economy on the head axis, and the whole contest re-formed on the tempo axis instead. That makes §6.3 conversion the clearest way to actually reduce an opponent — which is what §9 already wanted, arrived at from the other end.

**What stays uncertain is the number, not the shape.** The original table was worked out when a cut cost one head and the trail behind it always survived; the re-derivation above is what replaced that reading. One further pressure it puts on any *f* worth choosing: §6.2's per-move exchange makes heads flow in **both** directions during a fight, rather than only toward the defender, so an attacker's losses now scale with how long they stay — which is a cost the old table did not price at all. Which side of the crossover a given *f* lands on is a playtest question and always was. Item 25.

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

Home regions are mirror images of each other in a line through the origin (§2, *map symmetry*) — the one involution that preserves the grain. A denser, faster cluster of spawners sits at the centre, far from both starts, and the spawner field fades to nothing past the cutoff radius *R* (§7, *the radial gradient*).

**Setup is what makes an unbounded board finite.** The board itself has no size (§2); what setup chooses is *R*, the band radii, and how far apart the two homes sit. Those three numbers are the whole map, they are read once, and no rule reads any of them again (§7, *placement and force are setup data*). Board size as a tuning knob has become spawner radius as a tuning knob, which is one number instead of two and has an obvious meaning.

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

### Open risk: the board has no edge to corner someone against

An unbounded board (§2) makes a second non-termination case reachable, and it is the turtle's twin rather than a new problem. A losing player can walk their last heads past the cutoff radius *R* and keep walking.

What is already true and worth stating, because it makes this smaller than it first looks:

- **Fleeing gains nothing.** Past *R* there is no production (§7), so the runner's economy is fixed at zero while the pursuer keeps every spawner. Every turn spent running widens the gap.
- **Pursuit converges.** `speed(N) = 1 + floor(log₂ N)` (§3), so a 16-stack closes four cells a turn on a lone head. Being faster is not enough on its own — the pursuer must also leave home to do it, and a chase is turns not spent defending.

So it is a *griefing* case, not a strategic one: the runner cannot win, only decline to lose. That is exactly the shape of the turtle stalemate, and it wants the same fix — a condition that lets overwhelming economic dominance end a match without physically reaching every enemy head. **Not decided here.** → §11 item 32.

---

## 10. Balance Posture

Known pressure points and their built-in counterweights:

| Snowball vector | Counterweight |
|---|---|
| Safe movement inside territory is free, so a large empire repositions instantly | A large empire has an enormous perimeter it cannot garrison everywhere |
| More specials → more heads | Specials are physical locations that can be attacked, and only produce while enclosed |
| Big stacks win fights | Big stacks are slow and throughput-negative; splitting is genuinely competitive |
| Leader can cut every enemy chain | Cutting requires leaving safety — the cutter becomes trailed and cuttable itself, and pays a head of its own for every exchange at a point the defender gates (§6.2) |

The decoy play this enables: bait an attacker into committing to a cut, and counterattack the now-exposed cutter with a flanking stack. If they refuse the bait, the decoy changes course and joins the flank to close the shape. This emerges from the rules rather than being designed in.

---

## 11. Open Questions

> **Nothing here blocks implementation.** Every structural item is resolved; the two tuning items — spawner density and the damage-versus-production crossover — closed as *playtest-first defaults* rather than derivations, which is the honest shape for numbers nobody can settle on paper. They are marked as such where they land in §7, and refining them is expected rather than exceptional.
>
> Item **29** was opened by the P01 review and closed in the same pass: resolving item 1 promoted the orientation pattern from a measurement to a rule, and no invariant enforced it. That is the ordinary way closing one gap opens another, and the reason this list is not deleted when it empties.
>
> **Items 30 and 31 were opened together and closed together, by deleting their cause.** Both said the same thing — §7's fill and §8's setup were written for a plane while the board was a torus. The gap was closed in the direction nobody had considered: **the board became the plane** (item 4, re-resolved). Neither was answered on its own terms, and that is the better outcome; a rule invented to make fill work on a torus would have been a rule the game never needed.
>
> **Item 32 is open**, and is the one thing an unbounded board costs: nothing stops a losing player walking away forever. It is the turtle stalemate in another costume and wants the same answer. → §9, → P09.
>
> Items are struck through rather than deleted on purpose. Several were resolved twice, and where a decision moved, the reasoning that moved it is usually the most valuable thing on the page. **New gaps belong here, not in the section that discovers them.**

**Geometry**
1. ~~The orientation pattern at a junction~~ — **resolved: alternating.** The out-set at every point is {up, down-left, down-right}: three directions 120° apart, so the six slots alternate in/out around the hexagon. Self-consistent throughout — the three out-vectors sum to zero, so the directed 3-cycle exists and girth is 3; the in-set is the complement {down, up-left, up-right}; exits from any in-arrow are straight or ±120°, so both handednesses are available and the board is mirror-symmetric rather than chiral. Every §2 consequence that was conditional on alternating now holds outright. **P03 generates rather than measures, and no geometric unknown remains.**
2. ~~Reachability~~ — **resolved.** Balanced + weakly connected ⇒ Eulerian ⇒ strongly connected. See §2.
3. ~~Girth~~ — **resolved.** 3, the pinwheel triangle. See §2.
4. ~~Board topology~~ — ~~resolved: torus~~ — **re-resolved: the unbounded plane.** The torus was right about the thing it was chosen for — a cut-out rectangle breaks 3-in/3-out at the rim, and wrapping fixes that — and wrong about a thing nobody had checked. **On a torus every lattice ray is a closed loop, so it crosses any contractible curve an even number of times.** Even-odd fill (§7) therefore reports *outside* for every tile of every enclosure, not merely for the girdling case item 30 had flagged. Fill was the algorithm the whole territory system rests on, and it was silently broken.

    The unbounded lattice keeps everything the torus was bought for — balance everywhere, no rim, no corner to camp in — and pays for fill with the classical Jordan argument instead of a homology test. It also restores a **centre**, which §2 and §8 had both been assuming all along (item 31), and removes the board-size floor entirely (item 29). See §2, *the board is unbounded*.

    Costs, both real and both paid outside the rules: `GeometryPort` can no longer enumerate the whole board and answers a bounded window instead, and running away becomes possible (item 32).
5. ~~Shortest U-turn loop~~ — **resolved, and now unconditional** (item 1). 3: a stranded head loops back onto its own trail in three moves, which is legal because a trail is a set (§6.1a invariant 2). Retreat is cheap; flagged as a balance watch-point in §2.

**Tuning — none of these block a paper playtest**
6. ~~Crossing target~~ — **re-resolved.** The two-step gate-and-charge is gone. A contested crossing is a 1:1 attack costing a move, and evaporation charges whichever stack halts it. Gating range narrowed with it: a stack contests only the point it *points into*, rather than any of that point's six arrows. Evaporation does **not** share that range — it halts per arrow (see item 27). See §6.2 and §6.1. *(The original answer — deterministic attrition, defender wins ties, charge to the nearest stack — survived from the first draft until the §6.1 rewrite made both halves redundant.)*
7. ~~Merging cost~~ — **resolved.** Free and automatic on contact. See §3.
8. ~~Fork branch whose head dies~~ — **re-resolved: the state is reachable, and it is fine.** The old answer rested on *every tip carries a head*, which was never true — a plain mid-trail cut leaves the stretch behind it anchored and headless. Headless trail is now ordinary: a wall that claims nothing, charges nothing, and can be walked onto again. See §6.1a.
9. ~~Converted stack size~~ — **resolved.** Stacks convert intact. See §6.3.
10. ~~Multi-prong bonus~~ — **re-resolved: there is no bonus, and none is needed.** Under 1:1 attacks, two prongs simply bleed the defender twice as fast. Pooling-and-tie-flip was the price of instantaneous attrition; per-move combat delivers the same reward as arithmetic. See §6.2.
11. ~~Board size~~ — ~~resolved as configurable: the lattice mod `(n, m)`~~ — **re-resolved: there is no board size.** The board is unbounded (item 4), so the knob is no longer how big the world is but **how big the part worth having is**: the spawner cutoff radius *R*, plus the band radii inside it (§7, *the radial gradient*). One number where there were two, and it has a direct meaning — *R* is the distance past which the map stops paying.

    Still tuned by experiment against player count and total spawner force, not decided on paper. **Player count: MVP is 2, mirror-symmetric** — see §2, *map symmetry*, and note the correction there: the two-player involution is a **reflection**, because 180° rotation reverses every arrow's grain and is not a symmetry of the oriented board at all. 3+ is deferred; the 120° rotation is available for it, and it raises kingmaking under elimination and wants its own design pass.
12. ~~Spawner density~~ — **resolved: not one number, because it is not uniform.** The criterion as originally stated — *scarce enough that nobody sweeps them, common enough that overlap stays the norm* — cannot be met by a single density: overlap only becomes typical at densities where spawners stop being scarce. Under a **clustered** placement it is met trivially, and clustering is already the §7 principle for force. Dense and fast in the contested centre, sparse and slow at home.

    MVP defaults, chosen to be playable rather than derived: about **half** the eligible vertices in the central disc, **an eighth** in the home annulus, and **none at all past the cutoff radius *R***. See §7, *the radial gradient*. Still in the tuning sweep with item 11 — but it no longer blocks anything, because a fixture board can be built from these today.

    **The bands became radii when the board became unbounded** (item 4). That is a restatement rather than a retune: contestedness was always "distance from the middle", and on a finite rectangle a band index was a way of saying so. The cutoff *R* is genuinely new, and it is what replaces the board edge — see item 32 for the part it does not fix.

    **The values are deliberately cheap to change**, and §7 (*placement and force are setup data*) says what that costs the implementation: one table at setup, no rule reading a force's value, no threshold comparing one against a constant. A retune must not be able to change which scenarios pass.
13. ~~Accrual on unowned arrows / charge surviving capture~~ — **resolved.** An arrow that changes hands starts fresh. See §7.
14. ~~Reset versus carry on spawn~~ — **resolved.** Carry the remainder. See §7.
15. ~~Spawning onto a contested arrow~~ — **resolved.** An enemy head halts accrual; the accumulator holds and resumes when they leave. See §7.
17. ~~Self-trap~~ — **re-resolved: still impossible, but the old proof was wrong.** It held for a single path and failed for a forked one: a split lets *one* arrival at a point fund *three* departures, so a 3-stack fanning onto all three out-arrows strands whatever arrives there next — including the sentry §6.1 tells you to leave. Fixed at the source rather than patched. The trail is a set and re-traversal is legal (§6.1a invariant 2), so no-re-trace no longer subtracts arrows and §2's Eulerian argument covers move legality on its own.
18. ~~Blockade cost~~ — **resolved.** The rotation still lands on a frozen arrow and that fraction is lost; output drops by a third per blockaded share. See §7.
16. ~~Girth-loop / spawner-vertex correspondence~~ — **resolved, and it holds.** A lattice triangle encloses exactly its own centre, which is exactly one spawner vertex. The minimum enclosable territory holds exactly one special. See §2.

**Structure**

19. ~~What is a move?~~ — **resolved: per-step.** A move is one unit, one step; the player chooses the order; skip is a first-class move; the turn ends explicitly. No within-turn resolution order had to be invented. Merging mid-turn costs the stack its speed bonus for that turn, which prices the reinforce-then-strike combo without banning it. See §4 and §3.

20. ~~Residuals of the per-step model~~ — **resolved: there are no residuals.** The harmonic curve is replaced by `speed(N) = 1 + floor(log₂ N)`, allowance is a whole number, and nothing survives the turn boundary — not a fraction, not an unused whole step. Every sub-question dissolved rather than being answered:

    - ~~Does a skipped step bank?~~ — **no.** Nothing banks at all now, so this needs no rule of its own. The original reason still stands: a rearguard that banked would be a spring — skip three turns, move four — undercutting §4's standing-still-is-doing-its-job point.
    - ~~Does a merge forfeit an inherited carry?~~ — **no carries exist.** What replaced it is sharper: a merged stack has speed 1, or **speed 0 if any arriving group outnumbered what it joined**. See §3, merging costs the turn.
    - ~~Does a split duplicate an inherited carry?~~ — **no carries exist.** Both parts inherit `spent`, so a split trades one group's distance for a second group's existence and the arithmetic balances itself.
    - ~~Is splitting symmetric with merging?~~ — **no, and deliberately.** See item 22.
    - ~~Does a spawned head merging into a stack cost the bonus?~~ — **no.** Spawn resolution happens at the turn boundary, not mid-turn, so it is not a move-merge and the speed override does not apply.

    The harmonic curve was not wrong, it was unreadable: you could not tell how far a 5-stack moves this turn without knowing what it banked last turn, in a game whose entire appeal is that the next move is computable (§1). The log₂ ladder also makes **the pair the natural atom** — `speed(2) = 2`, exactly what two singles get — so the smallest garrison that actually halts a front (§6.1) is also the largest one that costs nothing in speed. Neither rule was written for the other.

    One live consequence, priced rather than banned: see **the conveyor** in §3.

21. ~~Are sentries dropped and picked up by moves?~~ — **resolved, and the question dissolved.** There is no drop and no pickup. An arrow holds a count; a move takes a portion of it. Leaving heads behind is the drop, arriving on your own stack is the pickup, and §3's automatic merge needs no carve-out. §5 rewritten; the *may*/*automatic* contradiction is gone rather than adjudicated.

22. ~~What happens to a stack's allowance when it splits mid-turn?~~ — **resolved: only the portion that moves spends.** Both parts inherit `spent`, so the portion that stayed may still act — branch off, or follow one step behind — while a stack that already moved as a whole cannot then split into scouts that have not. Splitting needs no penalty of its own; inheriting `spent` closes the double dip on its own, so the asymmetry with merging is deliberate rather than an oversight. See §3, allowance and spending.

    This also settled a latent question in §6.1a: a lagging group standing on an arrow the front group laid is **not** re-tracing. Invariant 2 constrains the trail's arrow set, not where heads walk.

23. ~~Is a sentry at a branch point mandatory, or only subject to the minimum?~~ — **re-resolved: mandatory, and it is the only head the rules ever require.** One head on the in-arrow before a join, one on the out-arrow after a split, two at a crossover (§5). The earlier answer — *only the minimum, an ungarrisoned fork is legal* — was reached against a floor that put heads on every arrow anyway, so the mandate looked redundant. It isn't: linear trail is now bare, and a branch is the one place the game charges.

    Its rejection rested on one objection: *"a mandate is unenforceable in exactly the case it was written for — damage can empty a fork, and no rule can repair it."* Still true, and now **harmless**, because the mandate is not what makes evaporation well-defined. **All-to-all point semantics does that**, with or without anchors (§6.1a). What the mandate buys instead is a price for branching, and the fact that a **lone head cannot pay it** — which is the whole answer to *"what if the tip is too small?"*, arrived at without a clause about singles.

24. ~~Does the arrow of a stack that dies absorbing a cut survive?~~ — **resolved, and the question changed shape.** A dying stack does not absorb at all. **Each evaporation front carries one kill: it spends that kill on the first head it meets and halts at the next head**, which survives with its arrow and the point it shields. So a lone head is a toll and a pair is a wall, in both directions. Two is not one-per-side; it is the smallest garrison that halts anything. That arithmetic survived the floor it was originally written to justify (item 27) — it is now the reason a player *chooses* pairs, rather than the reason a rule demands them. See §6.1.

25. ~~The damage-versus-production crossover needs re-deriving.~~ — **re-derived, and it moved off its original axis.** The old table compared heads destroyed against heads produced. That comparison is now close to meaningless: linear trail carries no heads (§5), so **a cut on bare trail kills nobody**. It denies tempo — a region of *R* arrows cost *R* moves to lay — while heads die only in §6.2 combat and §6.3 conversion.

    So the contest re-formed as **turns denied against heads accrued**, and the interesting consequence is that *the victim chooses the currency*: run bare and cuts cost trail, garrison and they cost heads you had already spent by parking them. MVP values are **1/3 centre, 1/9 mid, 1/12 home** (§7, *what the spawn rate implies about victory*).

    Explicitly a **playtest-first number**, and one the implementation must keep cheap to move — see item 12 and §7, *placement and force are setup data*. These are chosen to be playable, not derived, and the human owns the refinement once the game can actually be played. The one structural claim worth keeping is that conversion, not chip damage, is now unambiguously how a player is reduced — which is what §9 wanted anyway.

26. ~~Which in-arrow pairs with which out-arrow at a point the trail uses twice?~~ — **resolved: none of them, and the question was wrong.** Two in-arrows and two out-arrows admit three readings — two passages, two crossed passages, or a join then a fork — and they leave the identical arrow set, so the set determines no pairing. The hole was real: a crossing test that assumed a pairing gave opposite verdicts on the same board state, and evaporation had nowhere defined to route.

    The fix is not to recover the pairing but to stop presuming one. **A point is all-to-all: every in feeds every out** (§6.1a). A set with `i` ins and `o` outs *is* a join-then-split; that is what the representation says, and asserting less was the error. Evaporation spreads to every continuation in its own direction; the crossing test sees `i × o` chords (§2).

    Two rejected alternatives, recorded because both look reasonable. *Canonical pairing* — choose one by a slot convention — routes damage down arrows the player never connected, which is worse than being generous. *Immunity* — declare an ambiguous point uncuttable — is a patch with no mechanism behind it, and it makes a crossover a permanent free wall.

    **No code impact.** Every cuttable configuration has determined chords, so `chordsCross` stands as written and is simply called once per chord.

27. ~~How many heads must a move leave behind?~~ — **resolved: none, except to pay for a branch** (§5). The rule this replaced — *"you may not leave fewer heads on an arrow than it has open sides"*, two mid-trail — was **broken, not merely mistuned**. It read the arrow being *vacated*, so leaving zero counted as leaving fewer than two: a 2-stack mid-trail could not move at all, an N-stack shed two heads per arrow of trail laid, and maximum reach was about N/2. It also contradicted §5's own framing of the garrison as a *choice* rather than a tax.

    What replaced it inverts the default. Linear trail carries **no** heads; sentries are entirely discretionary; and the one mandatory head is the anchor a join or a split costs. A single head can walk freely and **cannot branch**, which is where the old rule's real intent lands without any clause about singles.

28. ~~Can something other than territory anchor a trail?~~ — **resolved: a stack can, at a lesser grade.** Trail beyond a halting stack is anchored on that stack — live, extendable, defendable — rather than dormant. But the grades are not interchangeable, and keeping them apart is what holds two other rules up:

    - **Territory grade** — closes and claims everything enclosed (§7); heads on it are not encircled (§6.3).
    - **Stack grade** — can be driven home for a **land bridge**, claiming the path and nothing else. Encloses nothing, and does **not** save a head from conversion inside enemy ground.

    Collapsing them would let a stack parked in open ground found an island (§7 forbids it outright) and make any raider with a sentry behind it immune to encirclement, which would take §9's decisive move with it.

29. ~~Must every board be alternating, or only the generated one?~~ — **resolved: every board.** Resolving item 1 turned the orientation pattern from a measurement into a rule and nothing enforced it: the conformance suite asserted a point's six arrows get six *distinct* slots, never that in and out alternate, so a fixture board with three-consecutive in-slots passed the whole suite while contradicting §2. Now a conformance invariant (§2).

    What decided it is that **both handednesses available** is not decoration — §5 and §6 assume a head can turn either way aside from a trail without crossing it, and those are the scenarios rules packets test *on fixtures*. A chiral fixture would answer them differently, which would break the suite's one promise: that any implementation satisfying it is interchangeable.

    The **phase is deliberately free** — in-arrows may take the even slots or the odd ones. Slot indices are the port's own labelling, the chord test is rotation-invariant (§2), and pinning the phase would create a fact for a caller to depend on with nothing gained.

    Measured while deciding it, and useful independently: **alternation is not what constrains board size.** ~~The smallest torus satisfying the existing suite is 4×4~~ — that floor existed only because wrap collapsed *girth-3 encloses exactly one vertex* on small tori (at 2×2 and 3×3 the triangle count fell to 4 and 27 against 8 and 18 vertices, and at any `n = 3` three steps of one out-vector wrapped to zero and manufactured a straight-line 3-cycle enclosing nothing). **Item 4 removed the wrap, and with it the floor.** On the unbounded lattice both properties are local and hold unconditionally. Requiring alternation still costs a labelling convention and nothing else.

    A fixture board need not be a lattice at all, only satisfy the suite, and its floor is **7 points, 21 arrows, 14 vertices** — which is why **P02 authors abstract conformant digraphs rather than lattice sub-boards**, and why a fixture stays readable when a rules test fails. That reasoning is untouched by item 4: a fixture is finite and enumerable whatever the real board is, which is now the sharpest difference between the two implementations of the port.

    ~~counting bounds put its own floor near 6 points and 18 arrows~~ — **corrected while writing P02.** Six points cannot carry the suite: no-rim forces undirected degree 6 at every point, and with no parallel arrows that needs at least 7 points. Seven is attained, by a *unique* board up to isomorphism — the tournament on ℤ/7, `i → j` iff `j − i` is a square mod 7 (21 arrows, 14 vertices, girth 3, six triangles per point). Brute-forced over every lattice quotient to 30 points: nothing below 7 satisfies the conformance conditions. This also makes the smallest fixture `K₇` — every point adjacent to every other — so P02 ships a second, 8-point board for anything about non-adjacency or a window that is a proper part of the board.

**~~The torus is not a plane, and two sections still read as though it were~~ — dissolved: the board is the plane**

30. ~~What does a trail that girdles the board enclose?~~ — **resolved by dissolution: there is no girdle.** On a torus a closed curve need not separate the surface, so a trail that ran all the way around and landed home enclosed nothing definable and even-odd fill was undefined for it. Three readings were on the table — land bridge, claim-one-side, illegal — and the answer turned out to be that **the question only existed because the board wrapped** (item 4). On the unbounded plane every closed curve bounds, so the case is unreachable and no rule is needed.

    Worth recording, because it is what moved item 4: this item had found **half** the problem. It observed that a *non-contractible trail* has no inside. It did not check the *ray*, and the ray is the larger half — every lattice ray on a torus is itself a closed loop, so its mod-2 intersection with any **contractible** curve is zero and even-odd reports *outside* for every ordinary enclosure too. A rule answering item 30 as written would have made girdling well-defined on a board where nothing else filled correctly.

31. ~~A torus has no centre, and §2 and §8 both assume one.~~ — **resolved by dissolution: the plane has a centre.** §2's *map symmetry* and §8's contested middle mean what they always meant, two players have one frontline rather than two, and no prose needed reinterpreting — the sections were not wrong, the board was.

    One thing this item asserted **was wrong and is now corrected in §2**. It said "the 120° rotation survives the quotient only when `n = m`; 180° rotation survives for any `(n, m)`, so a 2-player board is symmetric at any size." That is true of the *sublattice* and false of the *oriented graph*: `(i,j) ↦ (−i,−j)` sends every out-direction to a non-out-direction, so it reverses every arrow. It is an anti-automorphism, and a board built on it would hand player 2 a mirror world running backwards. The grain-preserving involution is a **reflection** — `(i,j) ↦ (i+j, −j)`, which fixes one out-direction and swaps the other two. 120° remains the three-player symmetry. See §2, *map symmetry*.

**Open**

32. **Nothing ends a match against an opponent who simply leaves.** The board is unbounded (item 4), so a losing player can walk their last heads past the cutoff radius *R* and keep walking. §7's gradient removes the *reward* — there is no production out there and the pursuer keeps everything — and §3's speed curve means a large stack does close on a lone head. So the runner cannot win. They can decline to lose, indefinitely, and elimination is the only win condition (§9).

    **This is the turtle stalemate in another costume**, and the two want one answer rather than two. Both are a player who has stopped playing and cannot be reached; both are unreachable specifically because the reaching is physical. Candidates, none chosen:

    - **Upkeep** — already named in §9 as the turtle's drop-in fix. Each special sustains some number of heads; hold less production than your army needs and you lose one head per turn. A runner has *zero* production, so it kills the flee case outright and faster than the turtle case. Reuses pieces already on the board and adds no subsystem, which is why it is the front-runner.
    - **A domination condition** — hold every spawner share, or some fraction of total force, for *N* consecutive turns. Ends the match on the axis the game is actually contested on, and needs no new state.
    - **Accept it**, as §9 already accepts the turtle. Defensible for a hot-seat MVP where both players can simply agree it is over, and indefensible the moment there is an AI or a ladder.

    Note the flee case is *strictly easier* than the turtle case — a turtle keeps its economy, a runner has none — so anything that solves the turtle solves this, and it is not worth designing separately. → **P09** (match lifecycle and victory), and it should be decided together with §9's accepted risk rather than bolted beside it.

---

## Appendix A: Drafted Opening (deferred)

Designed, viable, and shelved until there's a real game to test it against.

**The mechanic.** Placement alone can't bootstrap territory — you need land by turn one. The rule that makes it work is the garrison-island idea, resurrected as **setup-only**: at the end of placement, any closed loop of your heads becomes territory, and you keep everything inside it. It is exactly right here and wrong everywhere else — it's the only way to make land from nothing, it's one-shot so it can't be farmed, and the heads walk free afterward.

**The decision it creates.** With a fixed head budget: one large loop swallowing two specials, spending nearly everything on perimeter and starting with no mobile force? Or a tight 3-tile loop on one special, keeping heads free to fight? Plus Catan-style blocking — placing a head on the one arrow a rival's planned loop needs.

**Prerequisites before building it**

1. ~~Girth must be 3~~ — **confirmed**, so a minimum island costs 3 heads and the phase is affordable.
2. **The map must become varied.** A symmetric map makes the draft nearly pointless — each player takes their mirrored half and only the centre is contested. (For two players that symmetry is a *reflection*, not a rotation; §2, map symmetry. The point stands either way, and "mirrored half" is now literal.) A draft and a symmetric map are substitutes; running both means paying for a phase that isn't earning its keep. Choosing the draft means dropping symmetry and letting snake order do the balancing, Catan-style.
3. **Guardrail against zero territory.** A player who miscounts or gets blocked can finish setup owning nothing, which under §7 is an unplayable position reachable through ordinary bad play. Fix: enforce that each player's first placements form a legal loop, then free-place the remainder.
