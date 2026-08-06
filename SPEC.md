# Arrows Conqueror — Design Spec

*Working draft. Turn-based territorial conquest on an arrow tiling. Volfied's carve-and-enclose loop, rebuilt as a deterministic skirmish game.*

Status: core mechanics settled, open questions listed at the end. No implementation yet.

---

## 1. Premise

Two or more players carve territory out of a plane tiled with interlocking arrows. You advance **heads** along the arrows, leaving a **trail** behind them. When your trails close a loop, everything inside becomes yours — including any enemy units caught in it, and a share of every **spawner** the new ground borders, which then starts producing for you.

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

All three survive contact combat (§6.2) only because **declining is always legal**. Skip is a first-class move (§4), so adjacency never forces a fight. Two stacks that merely share a point ahead do not fight; what costs heads is *stepping onto* an enemy-occupied arrow — never the right to stand beside it.

Three things then unify under one definition:

- **Enemy cut** — an opponent traverses a point your trail passes through (§6.1).
- **Self-crossing** — *you* revisit a point your own trail already uses. Only an **interleave** inverts the enclosed lobes (§7). Coincidence cannot: fill reads the trail's arrow *set* (§6.1a), and re-traversing an arrow you already hold leaves that set unchanged. So the predicate is shared but §7 asks the narrower question.
- **Combat** — resolved on the **destination arrow** when that arrow holds an enemy group (§6.2 / §11 item 37). Contested-point 1:1 is withdrawn; the chord test decides cuts and self-crossings, not fights.

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

The mirror swaps handedness, which is harmless precisely because §2's alternating pattern made the board non-chiral in the first place. **N-player homes** for hot-seat sit on a hexagon about the origin (§11 item 11): opposite corners (2), alternating (3), four corners with one opposite pair free (4), all six (6), or equal angular span (5 / 7+). The classical 120° rotation still describes three-player *map* symmetry of the oriented graph; seating uses the corner table above so every count shares one placement vocabulary.

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

**The price rides with the heads, not with the arrow.** There is no stack to hang it on — a group is whoever stands on an arrow right now (§11 item 21) — so the override travels with the heads that paid it. A merged group stepping onto empty ground is still at its overridden speed when it arrives, and on a split both parts carry the override exactly as both inherit `spent`. Step onto ground already held and the override is computed **fresh** there, from arrival against joined, so nothing accumulates and big-then-small still cannot launder a bar. The alternative — the override as a fact about the arrow the merge happened on — would let one ordinary step refund the whole price, which is the free mid-turn upgrade this rule exists to close (§11 item 33).

Stated as a speed override rather than a special case, so nothing else needs changing: a constituent that already stepped this turn has therefore already used the merged stack's whole allowance, and the bonus arrives next turn when the stack is no longer *recently merged*.

This prices two exploits at once. Without the speed-1 clause, walking a spare head into a stack would be a free mid-turn speed upgrade and the correct opening move every turn would be to merge before doing anything else. Without the speed-0 clause you get the conveyor below for nothing.

### Allowance and spending

A **group** is the heads of one player standing on one arrow. Allowance belongs to the group — not to a head, not to a player.

> **A group may step while `spent < speed(size)`**, where `spent` counts the steps that group has already taken this turn.

Both are whole numbers and neither survives the turn boundary. Two rules make a change of composition behave:

- **On a split, both parts inherit `spent`** — and any merge override with it (above; §11 item 33). Only the portion that moves pays for the step. The portion that stayed has spent nothing extra and may still act — branching off in another direction, or following the same path a step behind (§6.1a).
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

**Linear trail carries no heads.** A tip walks, marking arrows behind it, and leaves nothing. (Behind it *including the one under it*: a step marks its **destination**, so the arrow a head stands on is trail and the ground it departed is not. §6.1 depends on that — a front halts when it meets a head "on the arrow it is entering", which requires the occupied arrow to be part of the trail — and so does the safety rule two paragraphs up, since the first step off your own territory must not mark the territory it left.) The trail is a mark on the board, not a chain of garrisons — every sentry above is a head you *chose* to leave. There is exactly one place the rules require one.

That place is **branching**. A trail that joins or splits is no longer one trail: it is several **mini-trails** meeting at a point, and each of them needs its own anchored end.

> **A move that gives a point a second trail in-arrow must leave at least one head on the in-arrow it arrived by. A move that gives a point a second trail out-arrow must leave at least one head on the out-arrow it departed onto.**

One head before a join, one head after a split. A **crossover** — a point your own trail already runs through — is a join followed by a split (§6.1a), so it costs both: one before, one after.

**One head per branch, and the rules never ask which strand holds it.** "The in-arrow it arrived by" and "the out-arrow it departed onto" name the move that created the branch, and a trail is a set that records no such thing (§6.1a) — a moment later the arm a split created is indistinguishable from the arm already there. So the standing form of the rule is: **a join must keep at least one of your heads somewhere among its in-arrows, a split at least one among its out-arrows, and no move may take the last one.** A sibling arm covers the whole junction, which is what makes the price list in §6.1 the price rather than a per-arm floor (§11 item 35). Because only the branches the departing arrow itself belongs to are ever checked, a branch damage emptied constrains nothing later — the next paragraph but one.

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

**Forks are ordinary trail, but branching is not free.** A fork is one arrow with two trail arrows leaving it; nothing about its *behaviour* is privileged and it needs no rule of its own — a cut behind it floods into both branches and costs one head on each. What it costs is the anchor §5 charges to create it. Trail *shape* stays a strategic choice — a branching trail covers more ground, offers more cut points, and bleeds once per branch — and it now comes with a price list: one head per join, one per split, two at a crossover. (This list is the price, and §5's *each mini-trail needs its own anchored end* is the reason there is one — not a second, larger price. §11 item 35.)

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

### 6.2 Contact combat

~~**Contested-point combat** — *when two stacks point into the same point, a move against that point is a 1:1 attack* — **withdrawn.**~~ Shadowing and waiting beside an enemy without stepping onto them are ordinary play (§2, §4); merely sharing a point ahead is not a fight. See §11 item 37.

Combat has one trigger:

> **An attack is an ordinary step whose destination arrow is occupied by an enemy group.**

That is the only combat trigger. No battle slots, no secret allocation, no RNG.

**Stay-behind (Risk-style).** An attack may not empty the source arrow: at least one of the attacker's heads must remain on `from`. A lone head therefore **cannot attack**. That is intentional — singles are vulnerable to cuts and cannot contest occupied arrows, which pushes play toward fewer, larger groups (§11 item 38).

**Resolve (one move, fight to wipe, deterministic).** Let *A* be the number of attacking heads stepping (the step's `count`, with `count ≤ heads − 1`) and *D* the defender heads on the destination. The battle resolves **fully inside that step** — no mid-fight interrupts, no reinforcements, no other actions (HoMM-style). Retreat between rounds is deferred.

Each **round** uses the threat-weighted floor rule; rounds repeat until *A* or *D* is 0:

1. **Threats:** *tA* = *D*/(*A*+*D*), *tD* = *A*/(*A*+*D*).
2. **Loss weights** (attacker∶defender): *wa*∶*wd* = *tA*² ∶ *tD* (integer form *D*² ∶ *A*(*A*+*D*)).
3. **Magnitude:** scale so max(atk_loss, def_loss) = *D*, preserving *wa*∶*wd*; then cap atk_loss ≤ *A* and def_loss ≤ *D*.
4. **Integerize** with floor. If both floors are 0 but the weights are positive, deal 1 loss to the side with the larger weight (ties → defender takes the 1).
5. Subtract losses; if both sides still have heads, repeat from (1) with the new *A*, *D*.

**Outcomes**

- *D* = 0: the attacker **lands** on the destination with remaining *A* (ordinary occupancy). Mark the destination as trail (§5) — a head stands there. The stay-behind remains on `from` and may later merge.
- *A* = 0: the attacker **does not land** and **does not mark** the destination (§11 item 38). The stay-behind on `from` is the tip of their trail. The defender keeps remaining *D* on the arrow.

Under the current magnitude step, a single round always wipes one side for positive integer *A*, *D*; the loop states the HoMM intent if the table is ever retuned.

The attack **costs one step of allowance** for the whole battle (§3).

**Equals favour the attacker** in a round where *A* = *D* (e.g. one round of 3v3 → attacker 2, defender 0). Do **not** special-case defender-wins-ties. Minimum contact is *A* ≥ 1 with a stay-behind, so a 1-stack cannot open equals.

**Floor may yield zero attacker loss** in a round when *A* is moderately larger than *D* (e.g. 5v3). Accepted PoC — no min-1 unless playtesting asks.

- **Declining is always legal.** Skip is first-class (§4); standing beside an enemy without stepping onto them fights nothing.
- ~~**Combat is interruptible.**~~ — **withdrawn.** The battle ends only by wipe (retreat-between-rounds is a later optional).
- **Cut and combat on one step.** If the destination is enemy-occupied *and* the traversal crosses that player's trail (`chordsCross`), resolve **combat first**, then **cut** against the trail set — trail is independent of heads (§6.1a). Evaporation is a cut on **trail**, not a wipe side-effect on bare or territory occupancy.
- **Parked:** territory combat modifiers (defender-only loss / invader trail mark on claimed ground) — not MVP; see §11 item 39.

**Sentries have two distinct jobs, and they sit on different axes.** A sentry **holds its arrow** against contact combat, and **absorbs** evaporation arriving along that arrow from either side (§6.1). Different threats, different ranges — contact is per arrow, fire is per arrow, and the withdrawn point-gating rule is not revived here. *Where* along a trail you place them stays a real decision.

An earlier draft unified evaporation's halt with a point-wide shield. It cannot: a front that reaches a point has already come *through* one of that point's arrows, and letting a head on some *other* arrow retroactively bar it produces answers that contradict the ordinary cases. Per-arrow is the local rule, and locality is what keeps evaporation total.

No randomness anywhere. A six-turn enclosure never dies to a bad roll; it dies to being outplayed.

### 6.3 Encirclement

Conversion triggers on **state, not on event**:

> **An enemy head inside your territory with no anchored trail is encircled, and converts.**

"Anchored" here means **territory grade** (§6.1 / §11 item 28). Stack-grade and dormant do not protect. Closing a shape around enemy heads is the common case, not a separate rule — the closure simply puts them inside your territory and severs them at once. **Stacks convert intact:** encircle a 3-stack and you gain a 3-stack, not three singles and not a token survivor.

A group that still has a territory-grade trail (a path of its trail reaching its own territory) is **not** encircled. You cannot capture a trail-connected raider by claim alone: a cut must first evaporate up to their anchor and drop the grade (§6.1). Trail cleanup is the cut's job; conversion does not strip trail (§11 item 40).

On convert, the stack flips owner at the same head count, with **`spent` reset to 0 and any merge override dropped** (§11 item 40). Converted groups sit on the claimer's territory — co-location with a pre-existing friendly group on the same arrow does not arise from claim encirclement (contact combat already forbids shared occupancy with enemies).

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
- **A stack anchor pays the path, and only what the path itself rings.** A fragment that survived a cut is anchored on its own stack (§6.1). Drive it into your territory and you claim **the path itself** — a land bridge. Ordinarily it encloses nothing: a strip has no inside. What it cannot do is *found* territory out of open ground, because the claim is still only the arrows walked plus whatever those arrows surround — and that is what makes salvage worth attempting without making a parked stack a founding site (§7 forbids that outright).
- **Self-crossings claim what they ring.** Crossing your own trail doesn't close anything on the spot. It matters when you land: the path becomes territory, and a loop the path made is then a ring of *your own ground* with a bounded inside — so that inside is yours too. Figure-eights and crossovers resolve without a special case, and an open trail that would have been a bare bridge can loop onto itself to claim something.
- **The test is reachability, not parity.** After the path is claimed, any pocket of non-territory that cannot reach infinity is enclosed and becomes yours. An earlier draft said *even-odd fill* and that was wrong twice over: a claim is bounded by the trail on one side and by your existing territory on the other, so it is not a closed curve to take a parity of — and where the two do differ, on a trail that rings a region with two separate loops, parity would report the core *outside* while it is plainly surrounded. See §11 item 36.

**Which arrows the landing claims: walk the trail backwards along the grain.**

> **From the arrow the closing step departed, follow trail arrows *against* the grain — `Y` precedes `X` when `Y` is trail and `target(Y)` is `origin(X)`. Everything reached is claimed. Nothing else is.**

The trail is a set with no memory (§6.1a), so "the path you walked" is not recorded — but it does not need to be. The grain recovers it: every arrow the closing head *could* have come through is upstream of the landing, and nothing else is. Three consequences, and they are the reason this is the rule rather than *claim the whole connected stretch*:

- **A fork's other arm is downstream, so it is not claimed.** It stays an open trail, now rooted on ground that has just become territory — which is exactly what the pincer below needs in order to have anything left to enclose.
- **A cut fragment driven home is upstream, so all of it is claimed**, dead end included. That is the land bridge two bullets up, and it is why fighting a stranded stack home is worth the trip.
- **At a merge, every trail in-arrow is claimed.** The set holds no pairing to prefer one by (§6.1a, §11 item 26), and a point is all-to-all in this direction for the same reason it is for evaporation.

~~**The same walk says whether the landing encloses anything.**~~ — **withdrawn with even-odd (§11 item 36).** There is **no enclose-or-strip gate**: the walk claims the path either way, and what the claimed ground then rings is asked separately and answered by reachability above. A walk that dead-ends claims a strip because *a strip rings nothing*, not because a second test refused it — and a dead-ending walk that crossed itself on the way home claims the loop's inside all the same. The old wording justified "encloses nothing" by *enclosure requires territory at both ends*, which was a proxy for *the curve must close*, and a self-loop closes it.

Closing grants the enclosed tiles **and everything standing on them** — enemy heads, converted (§6.3).

**A special is not among them, because a special is not a tile.** Specials live on vertices (below), and a vertex is never enclosed, occupied or granted: **it is owned in thirds, one share per bordering arrow**, and a closure moves those shares only by moving the arrows that carry them. So nothing here has to enumerate vertices at all — territory changes hands, and ownership of every special it borders follows (§11 item 34).

Two consequences worth stating, because the shares rule is easy to read as being only about partial capture:

- **The minimal closure takes a whole spawner.** Three arrows around one vertex enclose no tile, so a closure clause that granted "the specials inside" would hand the minimum enclosable territory (§11 item 16) nothing at all. Under shares it takes all three, and the minimum really is one: three arrows, three steps, one spawner. That is the game's cheapest objective and it is meant to be — a three-arrow closure is also the most cuttable thing on the board and claims nothing besides.
- **An interior vertex comes free, and a surrounded spawner is never unowned.** A vertex strictly inside a filled region has all three borders claimed by the fill already, so it is wholly owned without a second pass. The reading is identical for an enclosure, a land bridge and a carve-out.

**The fill needs a plane, and that is what decided the board** (§2). *Enclosed* means **cannot reach infinity**, so there has to be an infinity to fail to reach: a pocket is yours exactly when no walk from it escapes **your** ground. Only your own ground walls the walk — whose the pocket was does not enter into it, which is *territory is contestable* below and what makes a carve-out one rule rather than two. On a torus there is no escaping and no outside, so the notion is not merely wrong there — it is undefined, which is why the board is the unbounded plane (§11 items 4 and 30).

**A pocket does not leak at a point.** Reachability is over arrows, and two of your arrows meeting at a single point form a barrier even though no tile sits in the gap — that is §2's chord test, and without it every enclosure in the game would leak through the seam between two trail arrows.

Two consequences worth stating, because they are what "unbounded" costs and buys:

- **A closed curve always has an inside.** There is no girdling case, no non-separating loop, and no homology test anywhere in the engine.
- **Fill is bounded by the ground doing the ringing, not by the board.** A pocket is ringed by one closed run of arrows you hold, and a run of *L* arrows cannot ring more than `O(L²)` of them — so the sweep is finite even though the board is not, and it is the only place the engine ever needs a bounded region of an unbounded lattice. The bound belongs to the **ring**, not to the trail just walked: a one-arrow closure across the mouth of a C-shaped holding rings everything that holding curls around, and a second holding elsewhere on the board bounds nothing and must not widen the sweep.

### The pincer

A forked trail whose two branches both land on your territory **is a valid conquest**, and it requires no additional rule. Branches land one at a time: when the first arm lands, the whole drawn path becomes territory, stem included. The second arm is then an open trail hanging off a fork point that is *now territory*, so its landing is an ordinary territory-to-territory closure — and it takes the ground between itself and the now-solid first arm.

The two arms never need to form a directed cycle. **Enclosure is a property of the curve, not of the flow along it** — the *interior* does not care which way anything ran. What the flow does decide is *which arrows the landing claims*, which is the backward walk above: each arm is claimed by its own landing, and neither has to reach the other.

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

- A spawner has a **force** *f*, a rational fraction ≤ 1/3. **1/3 is a very rare maximum**; typical values are **1/9 or 1/12**. Total output is *f* heads per **full round** (both players have taken a turn — §11 item 41).
- **Each full round, one adjacent arrow gains *f***, cycling round-robin. Post-MVP, other distributions per spawner type. Accrual runs when `endTurn` returns the active seat to `players[0]` — not on every player `endTurn`.
- Each **accumulator belongs to the arrow, not the player.** When one reaches 1, a head appears on that arrow — merging into any stack already there — and the accumulator **carries the remainder** rather than resetting to zero. Nothing is wasted, which matters once two spawners feed one arrow and overshoot is routine. **This is the only place in the game that banks anything** — §3 deliberately does not, since tempo you did not spend is tempo you gave away, whereas a spawner's trickle has to accumulate to be worth anything at all.
- **Spawned heads do not pay the §3 merge override.** A birth is not a spent move; merging into a friendly stack leaves `spent` and `speedOverride` as they were (§11 item 41).
- **An arrow that changes hands starts fresh.** Its accumulator resets to zero on capture — the one case where progress is destroyed rather than carried.
- **An enemy head standing on the arrow halts accrual.** The accumulator neither advances nor resets; it holds at whatever it had reached and resumes when the intruder leaves. Nothing spawns into an enemy-occupied arrow. A **friendly** stack on the arrow does not halt: accrual runs and a spawn merges in with no merge-cost penalty.

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

> **MVP defaults (P09 PoC, configurable).** Cutoff *R* = **7** (graph distance).
> Force at distance *r* is **`1/3^r`** for *r* ∈ `[1, R]` — each step out
> diminishes by a factor of three. Homes sit at a reflected pair with
> `homeOffset = 5`. Domination *N* = **5** full rounds. Every vertex inside *R*
> carries a spawner for the first playable; thin later if the board feels dense.
> All of these live in `MatchConfig` / `DEFAULT_MATCH_CONFIG` and are setup data
> only — the core never branches on them (§7, *placement and force are setup data*).

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
- Heads only actually die in two places: **§6.2 contact combat**, threat-weighted losses per exchange (often more than one head), and **§6.3 conversion**, wholesale.

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

**Domination.** Hold **every spawner share on the board** for *N* consecutive turns and you win.

The second condition, and it exists because elimination alone is unreachable against a player who simply refuses to be reached (§11 item 32). It ends a match on the axis the game is actually contested on — production — rather than on physically cornering a last head, which an unbounded board makes impossible.

Two things about its shape are load-bearing and neither is a tuning choice:

- **Every share, not a fraction.** A threshold invites an argument about where the threshold goes; 100% needs no constant. It is also the state the flee case genuinely reaches: a runner past *R* has no production at all (§7), so total capture is not a high bar against them, it is automatic the moment they leave.
- **Held for *N* turns, not won on the turn of capture.** An instant win on the last share would end the match at the moment the losing side is most dangerous — they can still be holding large, fast stacks (§3: a big stack outruns a small one, which is also why a runner cannot escape a strong pursuer) with nothing left to defend and every reason to counterattack. The hold window turns *I took everything* into *I kept it*, and gives the losing side a defined last chance rather than a rug-pull.

*N* is a tuning number, deliberately, and belongs with the rest of the spawner table (§7, §11 item 11).

**Holding means owning, not blockading.** A share *is* ownership of one of the three arrows bordering the vertex, as territory (§7), and a head parked on a rival's spawner arrow **freezes** that share without taking it — the arrow is still theirs. So a blockade stops production and contributes nothing to the hold window. That is the reading §7 already requires, and it is the one that matters: if parking counted, domination would be won by garrisoning rather than by carving, and §7's *a blockade has a maintenance cost and a decisive failure mode* would stop being true.

**This does not require upkeep.** Item 32 listed upkeep as the front-runner and domination as the alternative; domination won because it needs no new state and no per-turn bookkeeping — it reads ownership the board already carries. Upkeep remains available as a balance knob if playtesting wants more pressure on a hoarding player, but nothing depends on it.

### The turtle is a losing position, not a stalemate

"You can only be hurt while you're growing" means a player who **stops growing becomes unkillable by cutting**. A losing player can pull every head onto safe ground inside a small enclave and never lay another trail.

An earlier draft called that a permanent stalemate and accepted it, reasoning that the only way through a shell was to encircle the *entire* enclave — impractical at a chokepoint. **The reasoning had a hidden premise: that the attacker needed the turtle's heads.** Under domination they need the turtle's *production*, and that is a far smaller shape. The shell is proof against fire, and nobody is obliged to burn it.

Three things already in this spec close the case, and none of them is new:

- **A spawner is enclosable at the minimum size the game has.** Ownership is fractional across the three arrows bordering the vertex (§7), and the lattice triangle of exactly those three arrows is *the minimum enclosable territory* (§11 items 16 and 34). So taking a turtle's income is a three-arrow loop, not a siege of the enclave.
- **Territory is contestable** (§7). An enemy can drive a chain into your territory and close a loop inside it, carving that chunk — and any specials in it — back out. Safe ground is safe from *cutting*, never from *closure*.
- **Closing around the garrison converts it** (§6.3). Heads standing on the carved tiles are now inside the attacker's territory with no anchored trail, so they convert intact — a 2× swing on the axis that decides the game. The turtle's own garrison is what makes the carve worth attempting.

So a turtle faces a bill either way: garrison the spawner and lose the garrison when it is carved, or leave it thin and lose it cheaply. Meanwhile they cannot grow — that is the definition of turtling — so nothing replaces what they lose, and once the last share is gone the domination clock runs on a player with no income at all.

**Decision: no clock, no upkeep, no rule.** The residue is a turtle with heads enough to cut every incursion into their own ground indefinitely, and that player is losing slowly rather than holding forever. **Upkeep** — each special sustaining some number of heads, with a shortfall costing one head per turn — remains on the shelf as a balance knob if playtesting disagrees, but nothing in the design is waiting on it.

### Closed: the board has no edge, and it does not need one

An unbounded board (§2) makes a second non-termination case reachable, and it looked like the turtle's twin: a losing player can walk their last heads past the cutoff radius *R* and keep walking.

Two things were already true, and together they are why this needed a win condition rather than a chase mechanic:

- **Fleeing gains nothing.** Past *R* there is no production (§7), so the runner's economy is fixed at zero while the pursuer keeps every spawner. Every turn spent running widens the gap.
- **Pursuit converges.** `speed(N) = 1 + floor(log₂ N)` (§3), so a 16-stack closes four cells a turn on a lone head. Being faster is not enough on its own — the pursuer must also leave home to do it, and a chase is turns not spent defending.

So the runner cannot win, only decline to lose — and **domination above ends it**, because a player who has left the board's productive region holds no shares at all. The clock starts the moment they run, and it does not depend on catching them. **Resolved** — §11 item 32.

The two were always the same problem — a player who has stopped playing and cannot be *reached* — and one condition answers both, because it stops asking to reach them. The runner has no production to take; the turtle's is enclosable at the cheapest size on the board (above). Neither needs a clock bolted beside it.

---

## 10. Balance Posture

Known pressure points and their built-in counterweights:

| Snowball vector | Counterweight |
|---|---|
| Safe movement inside territory is free, so a large empire repositions instantly | A large empire has an enormous perimeter it cannot garrison everywhere |
| More specials → more heads | Specials are physical locations that can be attacked, and only produce while enclosed |
| Big stacks win fights | Big stacks are slow and throughput-negative; splitting is genuinely competitive |
| Leader can cut every enemy chain | Cutting requires leaving safety — the cutter becomes trailed and cuttable itself, and contact combat (§6.2) makes stepping onto a garrisoned arrow cost heads on both sides |

The decoy play this enables: bait an attacker into committing to a cut, and counterattack the now-exposed cutter with a flanking stack. If they refuse the bait, the decoy changes course and joins the flank to close the shape. This emerges from the rules rather than being designed in.

---

## 11. Open Questions

> **Nothing here blocks implementation.** Every structural item is resolved; the two tuning items — spawner density and the damage-versus-production crossover — closed as *playtest-first defaults* rather than derivations, which is the honest shape for numbers nobody can settle on paper. They are marked as such where they land in §7, and refining them is expected rather than exceptional.
>
> Item **29** was opened by the P01 review and closed in the same pass: resolving item 1 promoted the orientation pattern from a measurement to a rule, and no invariant enforced it. That is the ordinary way closing one gap opens another, and the reason this list is not deleted when it empties.
>
> **Item 33 was opened and closed by P04**, and was the ordinary consequence of item 21: §3 priced a merge in terms of *a stack*, and the state deliberately has no stack to hang it on. It blocked nothing but P04's own implementation, and it blocked that squarely. Resolved to *the override travels with the heads*, and §3 now carries the rule rather than leaving it to be read out of a noun. → §3, → P04.
>
> **Items 30 and 31 were opened together and closed together, by deleting their cause.** Both said the same thing — §7's fill and §8's setup were written for a plane while the board was a torus. The gap was closed in the direction nobody had considered: **the board became the plane** (item 4, re-resolved). Neither was answered on its own terms, and that is the better outcome; a rule invented to make fill work on a torus would have been a rule the game never needed.
>
> **Item 32 was the one thing an unbounded board cost, and it is now closed** by a second win condition rather than by a chase mechanic: hold every spawner share for *N* turns and you win. A runner past *R* holds none, so the clock starts when they leave and never depends on catching them. It closed §9's turtle as a side effect, by changing what the attacker has to reach: a spawner is enclosable at the minimum size the game has (items 16 and 34), territory is contestable (§7), and closing around a garrison converts it (§6.3) — so **§9 no longer carries an accepted risk at all**. → §9 (*domination*, and the turtle), → P09 (*N*).
>
> **Item 35 was opened and closed by P05's review**, and it is the sharpest example on this list of why the review phase exists. §5 charged a branch on the move that creates it, in words that name a pairing a *set* cannot hold — so the implementation had to choose a standing form, chose the larger one, and passed every scenario doing it. Resolved to *one head per branch*; §5 now states the standing form and §6.1's price list is the price. → §5, → §6.1, → P05.
>
> **Item 36 was opened and closed by P05b**, and it is the second time this list has caught the *spec's own* phase-1 output rather than an implementation. §7 said *even-odd fill*; even-odd needs a closed curve and a claim is not one. Resolved by removing the curve instead of closing it — the wall is the player's ground and *enclosed* means **cannot reach infinity**. → §7 (five clauses corrected: three when the item closed, and two more found by P05b's **review** — the enclose-or-strip gate was still standing a subsection later, and the sweep's `O(L²)` bound was still attributed to the trail rather than to the ring that does the enclosing), → P05b.
>
> **Item 37 was opened and closed by P06**, replacing contested-point 1:1 combat with **contact combat**: an attack is a step onto an enemy-occupied arrow; losses follow a threat-weighted floor rule; equals favour the attacker; merely pointing into the same point is not a fight. → §6.2, → P06.
>
> **Item 38 was opened by P06's review and closed by the human:** stay-behind on attack (lone head cannot attack); fight to wipe in one `apply` (no interrupt); mark destination only if the attacker lands; bounce leaves the stay-behind as tip. → §6.2, → P06.
>
> **Item 40 was opened and closed by P07:** on convert, reset `spent` and drop merge override; trail cleanup is not conversion's job (a territory-grade trail must already have been cut); same-arrow merge with a friendly group is unreachable under claim encirclement. → §6.3, → P07.
>
> **Item 41 was opened and closed by P08:** accrual ticks once per **full round** (not every `endTurn`); friendly occupation accrues and merges with **no** §3 merge override (birth is not a spent move); enemy occupation still halts. → §7, → P08.
>
> **§11 now carries no open rules question.** What remains is a **parked tuning table**, not a gap: item 11's *R*, the band radii, force per band, and item 32's *N* are numbers only playtesting can set, and P09 owns setting them. Item **39** parks a territory-combat idea without blocking. Nothing else is blocked, and none of the tuning items changes a rule.
>
> **Item 34 was opened and closed by P05, and it was never a gap.** §7's closure clause granted "special tiles", which §7's *own next subsection* forbids — specials are vertices, owned in thirds by their bordering arrows, and a vertex is never enclosed. The answer was three subsections from the question, which is the failure mode a spec this cross-referential invites; the item stays as a reminder to look before opening one. → §7 (corrected), → P05b, → P08.
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
6. ~~Crossing target~~ — ~~re-resolved as contested-point 1:1~~ — **re-resolved again: contact combat.** The two-step gate-and-charge is gone, and so is the intervening *stacks pointing into the same point fight 1:1* reading. An attack is an ordinary step onto an enemy-occupied arrow; losses follow the threat-weighted floor rule in §6.2; equals favour the attacker; merely sharing a point ahead is not a fight. Evaporation still halts per arrow (item 27) and is a separate axis. See §6.2, §11 item 37. *(Original: deterministic attrition, defender wins ties. Then: contested-point 1:1. Now: contact.)*
7. ~~Merging cost~~ — **resolved.** Free and automatic on contact. See §3.
8. ~~Fork branch whose head dies~~ — **re-resolved: the state is reachable, and it is fine.** The old answer rested on *every tip carries a head*, which was never true — a plain mid-trail cut leaves the stretch behind it anchored and headless. Headless trail is now ordinary: a wall that claims nothing, charges nothing, and can be walked onto again. See §6.1a.
9. ~~Converted stack size~~ — **resolved.** Stacks convert intact. See §6.3.
10. ~~Multi-prong bonus~~ — **re-resolved: there is no bonus, and none is needed.** Under contact combat (§6.2 / item 37), coordinating two stacks means two separate contact steps over time (or against different arrows) — each resolves on its own *A*∶*D*. Pooling-and-tie-flip was the price of instantaneous attrition; there is still no special-case bonus constant. See §6.2.
11. ~~Board size~~ — ~~resolved as configurable: the lattice mod `(n, m)`~~ — **re-resolved: there is no board size.** The board is unbounded (item 4), so the knob is no longer how big the world is but **how big the part worth having is**: the spawner cutoff radius *R*, plus the band radii inside it (§7, *the radial gradient*). One number where there were two, and it has a direct meaning — *R* is the distance past which the map stops paying.

    Still tuned by experiment against player count and total spawner force, not decided on paper. **Player count is chosen in the hot-seat lobby (2–8).** Homes sit on a hexagon of radius `homeOffset` about the origin: **2** opposite corners, **3** alternating corners, **4** four corners with one opposite pair left free, **6** all six corners; **5 / 7+** equal angular span (best effort). The two-player case remains a grain-preserving placement (opposite corners), not a 180° rotation — that rotation reverses the grain (§2). Kingmaking under elimination for 3+ is accepted for hot-seat playtest; a dedicated design pass can revisit it later.

    **Item 32's *N* joins this table** — the number of consecutive turns every share must be held for a domination win (§9). Same shape as *R*: a number with a direct meaning that only playtesting can set, read once by the victory check rather than spread through it.
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

    **Finiteness is a limit as well as a convenience, measured while building P02.** *Straight-ahead* — arrive at a point on slot `s`, leave on slot `s + 3`, which alternation guarantees is an out-slot — is a **bijection on arrows**, so on any finite board every orbit is a cycle: every ray closes on itself and even-odd fill (§7) counts zero crossings for every enclosure. That is item 4's argument with the torus taken out of it; it was never about wrapping, it was about finiteness, and the torus was merely the finite board we happened to be holding. Movement, the chord test, cuts and accrual are local, so a fixture hosts them; **closure and fill (P05b) and encirclement (P07) test against the tiling**, which is where fill is defined anyway — and that line is what split P05 into a local half and a planar one. This is not a deferral — no authoring choice fixes it.

    ~~counting bounds put its own floor near 6 points and 18 arrows~~ — **corrected while writing P02.** Six points cannot carry the suite: no-rim forces undirected degree 6 at every point, and with no parallel arrows that needs at least 7 points. Seven is attained, by a *unique* board up to isomorphism — the tournament on ℤ/7, `i → j` iff `j − i` is a square mod 7 (21 arrows, 14 vertices, girth 3, six triangles per point). Brute-forced over every lattice quotient to 30 points: nothing below 7 satisfies the conformance conditions. This also makes the smallest fixture `K₇` — every point adjacent to every other — so P02 ships a second, 8-point board for anything about non-adjacency or a window that is a proper part of the board.

**~~The torus is not a plane, and two sections still read as though it were~~ — dissolved: the board is the plane**

30. ~~What does a trail that girdles the board enclose?~~ — **resolved by dissolution: there is no girdle.** On a torus a closed curve need not separate the surface, so a trail that ran all the way around and landed home enclosed nothing definable and even-odd fill was undefined for it. Three readings were on the table — land bridge, claim-one-side, illegal — and the answer turned out to be that **the question only existed because the board wrapped** (item 4). On the unbounded plane every closed curve bounds, so the case is unreachable and no rule is needed.

    Worth recording, because it is what moved item 4: this item had found **half** the problem. It observed that a *non-contractible trail* has no inside. It did not check the *ray*, and the ray is the larger half — every lattice ray on a torus is itself a closed loop, so its mod-2 intersection with any **contractible** curve is zero and even-odd reports *outside* for every ordinary enclosure too. A rule answering item 30 as written would have made girdling well-defined on a board where nothing else filled correctly.

31. ~~A torus has no centre, and §2 and §8 both assume one.~~ — **resolved by dissolution: the plane has a centre.** §2's *map symmetry* and §8's contested middle mean what they always meant, two players have one frontline rather than two, and no prose needed reinterpreting — the sections were not wrong, the board was.

    One thing this item asserted **was wrong and is now corrected in §2**. It said "the 120° rotation survives the quotient only when `n = m`; 180° rotation survives for any `(n, m)`, so a 2-player board is symmetric at any size." That is true of the *sublattice* and false of the *oriented graph*: `(i,j) ↦ (−i,−j)` sends every out-direction to a non-out-direction, so it reverses every arrow. It is an anti-automorphism, and a board built on it would hand player 2 a mirror world running backwards. The grain-preserving involution is a **reflection** — `(i,j) ↦ (i+j, −j)`, which fixes one out-direction and swaps the other two. 120° remains the three-player symmetry. See §2, *map symmetry*.

**~~Nothing ends a match against an opponent who simply leaves~~ — resolved: a second win condition, on production rather than on pursuit**

32. ~~What stops a losing player walking away forever?~~ — **resolved: domination.** Hold **every spawner share for *N* consecutive turns** and you win (§9). The board is unbounded (item 4), so a losing player can walk their last heads past the cutoff radius *R* and keep walking; §7's gradient removes the *reward* and §3's speed curve means a large stack does close on a lone head, so the runner could never win — but with elimination as the only condition they could decline to lose, indefinitely.

    **The answer is a win condition, not a chase mechanic**, and that is what makes it work: a runner past *R* holds no shares at all, so the clock starts the moment they leave and never depends on reaching them. Two things about its shape, neither a tuning choice:

    - **Every share, not a fraction.** A threshold invites an argument about where the threshold goes; 100% needs no constant, and it is the state the flee case reaches automatically.
    - **Held for *N* turns, not won on the turn of capture.** An instant win on the last share would end the match at the moment the losing side is most dangerous — still holding large, fast stacks (§3), with nothing left to defend and every reason to counterattack. The hold window turns *I took everything* into *I kept it*, and gives the losing side a defined last chance rather than a rug-pull. *N* is a tuning number, deliberately → item 11's table.

    **Chosen over upkeep**, which had been the front-runner. Upkeep — each special sustains some number of heads, and holding less production than your army needs costs one head a turn — also kills the flee case, but it adds per-turn bookkeeping and a second head-loss channel to reason about, and domination reads ownership the board already carries. Upkeep survives as a balance knob, not as a requirement, and the two compose if playtesting wants both.

    **It closed §9's turtle too, which was not the plan.** The turtle was accepted on the reasoning that the only way through a shell was to encircle the entire enclave. That premise was that the attacker needed the turtle's *heads*; domination needs their *production*, and a spawner is enclosable at the minimum size the game has — the three-arrow lattice triangle of items 16 and 34. Territory is contestable (§7), so a shell is proof against cutting and never against closure; and closing around the garrison converts it (§6.3), so the heads defending a share are what make taking it worth attempting. A turtle therefore pays whether it garrisons or not, cannot grow to replace the loss, and ends on the clock with no income. **§9 no longer carries an accepted risk**, and upkeep went from *drop-in fix* to *shelved balance knob*.

    Opened by the unbounded-board resolution (item 4) and answered by the human directly. → **§9** (*domination*, and the turtle's revised note), → **P09** (*N*, with the rest of the spawner table).

**~~"Even-odd fill" had no closed curve to run on~~ — resolved: the test is reachability, not parity**

36. ~~What is the fill's boundary, given that a claim is bounded by the trail on one side and by existing territory on the other?~~ — **resolved: the wall is a region, not a curve.** §7 said *even-odd fill*, and even-odd needs a closed curve. A claim is not one: a probe cast from an enclosed arrow can escape through the territory side having crossed the trail **zero** times, so every enclosure reads empty — the same failure the torus had (item 4), arriving from a different direction. Putting territory into the boundary does not repair it either, because territory is a thick region and a probe that enters and leaves crosses twice.

    **The answer removes the curve rather than closing it**, in two passes:

    1. **Claim the path.** From the closing arrow, follow the trail backwards along the grain until it reaches your territory **or the stack anchor the trail starts from** — a prefix evaporated up to an anchor is the ordinary way that happens (§6.1). Every arrow walked is claimed.
    2. **Claim what the claimed ground rings.** With the path now territory, any pocket of non-territory that **cannot reach infinity** is enclosed and claimed too.

    So there is no parity, no territory-outline arc to trace, and no degenerate ray to perturb — which matters, because `GeometryPort` exposes no coordinate to perturb *with*. What survives unchanged is §2's chord test: reachability is over arrows, and two of your arrows meeting at one point form a barrier though no tile sits in the gap, or every enclosure leaks through the seam.

    **It also changes an answer, which is why it is recorded rather than treated as a clarification.** The two readings differ on a trail that rings a region with **two separate loops** — re-walking one ring cannot produce that shape, since a trail is a set and re-traversal adds nothing (§6.1a invariant 2). Parity calls the core *outside*, two crossings being even. Reachability calls it *yours*, because it is plainly surrounded. Reachability is the answer, and the shape a player would predict.

    Two consequences worth stating, both now in §7:

    - **A self-loop claims its inside even without territory at both ends.** An open trail that would have been a bare bridge can cross itself and take what the loop rings, because the loop is a ring of the player's own ground the moment the path is claimed. §7's old justification — *enclosure requires territory at both ends* — was a proxy for *the curve must close*, and the ring closes it.
    - **The plane is still load-bearing, by a cleaner argument.** *Enclosed* means cannot reach infinity, so there must be an infinity to fail to reach. On a torus the notion is undefined rather than merely wrong.

    Opened by **P05b's test phase** against the spec **P05b's own phase 1 wrote**, and answered by the human. → **§7** (*closure*, corrected: the self-crossing clause, the stack-anchor clause, and the fill argument), → **P05b**.

**~~Contested-point combat~~ — resolved: contact combat on the destination arrow**

37. ~~When do two stacks fight, and how are losses computed?~~ — **resolved: contact combat.** An earlier reading (§6.2 / item 6) said two stacks that point into the same point fight 1:1 on a move against that point. That made shadowing illegal in spirit and conflated gating with contact. **Withdrawn.**

    **Trigger:** an ordinary step whose destination arrow holds an enemy group. That is the only trigger. Two stacks that merely point into the same point do not fight; skip still declines advancing.

    **Resolve** (deterministic, exact, no RNG, no secret bids; stay-behind and fight-to-wipe in item **38**): with *A* = attacking step count (`count ≤ heads − 1`) and *D* = defender heads on the destination — loop the threat-weighted floor rule until *A* or *D* is 0. Per round: threats *tA* = *D*/(*A*+*D*), *tD* = *A*/(*A*+*D*); loss weights *wa*∶*wd* = *tA*² ∶ *tD*; scale so max(atk_loss, def_loss) = *D* preserving the ratio, then cap atk ≤ *A*, def ≤ *D*; floor; if both floors are 0 and weights > 0, deal 1 to the larger weight (ties → defender). If *D* remaining is 0 the attacker lands with *A* remaining and marks; if *A* remaining is 0 the attacker does not land and does not mark. Equals (*A* = *D*) favour the attacker (e.g. 3v3 → 2∶0). Floor may yield 0 attacker loss when *A* is moderately larger than *D* (e.g. 5v3) — accepted PoC, no min-1.

    **Cut + combat on one step:** combat first, then cut against the trail set (trail is independent of heads).

    Opened by the P06 battle-mechanics side quest and answered by the human. → **§6.2**, → **P06**.

**Does a bounced attack still mark trail? — resolved with stay-behind and fight-to-wipe**

38. ~~When the attacker does not land, is the destination still marked as their trail?~~ — **resolved: no, and attacks leave a stay-behind.** Three decisions, one item:

    1. **Stay-behind.** An attack (destination enemy-occupied) may not empty `from` — at least one head remains. A lone head cannot attack. Intentional: singles are cut-vulnerable and cannot contest, so players keep larger groups.
    2. **Fight to wipe.** Contact resolves fully inside one `apply` — loop the floor rule until *A* or *D* is 0. No mid-fight interrupt, no reinforcements. (Retreat-between-rounds deferred.)
    3. **Mark only on land.** If *D* = 0 the attacker lands and marks; if *A* = 0 they do not land and do not mark — the stay-behind is the tip on `from`.

    Evaporation remains a **cut on trail** only, not a wipe side-effect. → **§6.2**, → **§5** (*marking*), → **P06**.

**Parked: territory combat modifiers**

39. ~~Boost defender / nerf invader on claimed territory?~~ — **parked, not a gap.** Idea for later playtest: on the defender's territory, contact might cost the defender heads only and mark the arrow in the invader's trail. Not MVP; no rule until revisited. → **P06** (noted), later balance pass.

**Conversion bookkeeping — resolved by P07**

40. ~~What happens to `spent` / trail / co-location on convert?~~ — **resolved.** Three precision calls, one item:

    1. **Reset.** Converted stacks keep head count, set `spent` to 0, and drop any merge override.
    2. **Trail.** Conversion does not strip trail. A territory-grade trail already prevents conversion; capturing a trail-connected raider requires a cut that evaporates up to their anchor first (§6.1). Q2 is moot as a conversion rule.
    3. **Co-location.** Claim encirclement puts converted units on the claimer's territory; sharing an arrow with a pre-existing friendly group does not arise (and contact forbids enemy co-occupancy beforehand). Out of scope.

    → **§6.3**, → **P07**.

**Spawner accrual timing and spawn-merge — resolved by P08**

41. ~~When does accrual tick, and does a birth pay merge cost?~~ — **resolved.**

    1. **Full round.** Every spawner advances one round-robin step once per **full round** — when `endTurn` returns the active seat to `players[0]` — not on every player `endTurn`.
    2. **Friendly occupation.** Accrue and spawn; the new head merges into the standing stack.
    3. **No merge override.** A spawned head has not spent a move; births do not set `speedOverride`. Enemy occupation still halts accrual (item 15).

    → **§7**, → **P08**.

**~~What does the minimal closure claim at its centre?~~ — not a gap: §7 already answered it, in a different subsection than the one that asked**

34. ~~Does the minimal closure claim the spawner at its centre?~~ — **resolved: yes, and no new rule was needed.** §7's closure clause granted "the enclosed tiles and everything inside them — enemy heads (converted) and **special tiles**", which reads a special's fate off the tile containing it. Item 16 says the smallest possible closure — a lattice triangle, three arrows around one vertex — is *the minimum enclosable territory*, and a triangle's three arrows **are** the path, so it encloses **zero tiles**. Read only against that clause, the cheapest closure in the game got three tiles and nothing at the centre.

    **The clause was wrong, not silent.** Three subsections down, §7 already says what owns a special: *"Ownership is fractional, in thirds. Each of the 3 bordering arrows carries one share"*, and *"the vertex never needs to be enclosed — one adjacent arrow gets you in on the action."* That settles it outright — the minimal triangle holds all three bordering arrows, so it holds all three shares — and it means **the phrase "special tiles" contradicted §7's own next subsection**, which exists to say specials are not tiles at all. The defect was a closure clause written as though a vertex could be enclosed.

    So the fix is a correction and a cross-reference rather than a rule: closure moves *tiles*, and every special's ownership follows from the tiles bordering it, in thirds. Consequences, now stated in §7 where the closure is described: the minimal closure takes a whole spawner; a vertex strictly inside a filled region is wholly owned without a second pass; and the reading is identical for an enclosure, a land bridge and a carve-out. **Nothing in the engine enumerates vertices during fill** — `borderArrows` answers ownership on demand, so it cannot drift from the tiles it is read off.

    Recorded rather than deleted because the near-miss is instructive: the question was asked against §7's *closure* prose and answered by §7's *specials* prose, which is exactly the failure mode this spec's density invites. **Check three sections away before opening an item.** Opened and closed by **P05**, which never reads a vertex and was not blocked either way. → **§7** (*closure*, corrected), → **P05b** (fill), → **P08** (shares).

**~~The merge price had nothing to hang on~~ — resolved: the heads carry it**

33. ~~Does a merge override travel with the heads, or stay on the arrow?~~ — **resolved: with the heads.** §3 said *a stack that merged this turn has speed 1 for that turn*, and item 21 says there is no stack — an arrow holds a count, and a group is whoever stands on an arrow right now. So "that stack" named a referent the state does not carry, and two readings of the same sentence parted ways as soon as the merged group moved:

    - **With the heads** — *chosen.* A merged 4-stack at speed 1 steps once onto empty ground and is still at speed 1 there, with `spent` 1 — it moved once this turn and it is done. On a split, both parts carry the override, the way both parts inherit `spent`. On a further merge the override is recomputed at the destination, so nothing accumulates.
    - **With the arrow.** The override is a fact about the arrow the merge happened on. The same 4-stack steps off it and is a plain 4-stack at speed 3 with `spent` 1, so it takes two further steps.

    Under the second reading, "merging costs the turn" costs nothing that a single ordinary step does not refund — the override is shed by the very step it was meant to price, and *reinforce, then advance* becomes the free mid-turn speed upgrade §3 says it is pricing away. That is what decided it: the clause exists to make merging cost tempo, and only the first reading charges it. §3 (*merging costs the turn*) now says so in the prose, and *the heads carry the price* is the reading the phrase "that stack" was always reaching for.

    Unreachable in the conveyor (§3): every hop of a conveyor lands on an occupied link, so a fresh override is computed at the destination and both readings agree. It was reachable in the most ordinary play there is — reinforce, then advance — which is why it wanted an answer rather than a note.

    Opened by **P04**'s test phase and closed by **P04**'s implementation phase, which it blocked squarely. No approved P04 *scenario* depends on it — the two readings differ only after the merged group moves again, which no scenario does — so P04's review added the invariant and a property test rather than leaving the decision resting on prose. Both readings pass every scenario in the packet; only the property tells them apart. → **§3** (*merging costs the turn*), → **P04**.

**~~A branch was priced twice, at two different numbers~~ — resolved: one head per branch, and the strand carrying it is not asked**

35. ~~Do §5 and §6.1 price a fork at one head or two?~~ — **resolved: one, per branch.** §5's mandate charges the *creating* move — "at least one head on the out-arrow it departed onto" — and §6.1 totals it as a price list: *"one head per join, one per split, two at a crossover."* But §5, four paragraphs earlier, calls a branch "several **mini-trails** meeting at a point, and **each of them needs its own anchored end**." At a fork those give different numbers and both are literal.

    Take linear trail `in → P → X`, then step off `in` onto `Y`, so P now has two trail out-arrows. §5's mandate and §6.1's list both charge **one** head, on `Y`. *Each mini-trail needs its own anchored end* charges **two**, because `X` is a mini-trail too and its end is also at P.

    The arithmetic was never the difficulty. **The trail holds no pairing to price against** (§6.1a, item 26): the set records neither which arm was second nor which in-arrow arrived last, so "the out-arrow it departed onto" names something the state does not carry — the same defect as item 33's "that stack". Two readings survive that, and both are implementable:

    - **Per branch** — *chosen.* A join must keep at least one of its owner's heads somewhere among its in-arrows, a split at least one among its out-arrows. A fork costs one and a crossover two, which is §6.1's list and §5's *one before, one after* exactly. A sibling arm carries the toll for the whole junction, so any arm may be wholly vacated while another holds it.
    - **Per strand.** Every in-arrow of a join and every out-arrow of a split must keep a head to be vacated, individually.

    **Both charge the same to *build* a branch**, and that is why the difference hid. Forming a crossover costs two heads under either — one before, one after — because the second strand's arrival is what pays. They part on every move afterwards: per strand pins each of the junction's four arrows separately, so a lagging group walking up the first in-arrow, or reinforcements sent down the first out-arrow, are stuck on arrival as well, up to four heads immobilised at one point and none of them required by any rule. Per branch keeps the toll at one head a side however many strands run through, and lets any single arrow empty while a sibling holds it.

    Three sentences to one decided it. Per strand contradicts both of §5's own numbers *and* §6.1's list, and it would make branching roughly twice the price §6.1 quotes — which pushes play toward single-threaded trails and quietly removes the choice §6.1 calls "trail shape stays a strategic choice". The mini-trail sentence is motivation for why a branch costs anything at all, not a second price. **It is also the reading that keeps the toll a toll**: one head at a junction buys one arrow of delay against evaporation (§6.1), and a player who wants a junction to stop something leaves two, exactly as anywhere else.

    *Which* strand holds it is not asked, and cannot be — that is item 26's answer applied to the anchor rather than to damage, and it is the same shape: the question presumed a pairing the representation does not hold. What replaces it is a **strip rule**: a move may not take a branch's last head. Locality does the rest — only the two branches the vacated arrow itself belongs to are examined, so a branch damage already emptied constrains no later move and the board cannot freeze (§5, *this constrains what you may leave, not what may exist*).

    Reachable in the most ordinary play there is — any fork whose two arms both carry heads, which is how a fork is normally walked — and **not** discriminated by any approved P05 scenario, since every one of them puts heads on at most one strand per side, where the readings agree. P05's implementation had done *per strand*; its review caught the choice, and the fix landed with three properties that tell the readings apart. → **§5** (*branching costs an anchor*), → **§6.1** (*forks are ordinary trail*), → **P05**.

---

## Appendix A: Drafted Opening (deferred)

Designed, viable, and shelved until there's a real game to test it against.

**The mechanic.** Placement alone can't bootstrap territory — you need land by turn one. The rule that makes it work is the garrison-island idea, resurrected as **setup-only**: at the end of placement, any closed loop of your heads becomes territory, and you keep everything inside it. It is exactly right here and wrong everywhere else — it's the only way to make land from nothing, it's one-shot so it can't be farmed, and the heads walk free afterward.

**The decision it creates.** With a fixed head budget: one large loop swallowing two specials, spending nearly everything on perimeter and starting with no mobile force? Or a tight 3-tile loop on one special, keeping heads free to fight? Plus Catan-style blocking — placing a head on the one arrow a rival's planned loop needs.

**Prerequisites before building it**

1. ~~Girth must be 3~~ — **confirmed**, so a minimum island costs 3 heads and the phase is affordable.
2. **The map must become varied.** A symmetric map makes the draft nearly pointless — each player takes their mirrored half and only the centre is contested. (For two players that symmetry is a *reflection*, not a rotation; §2, map symmetry. The point stands either way, and "mirrored half" is now literal.) A draft and a symmetric map are substitutes; running both means paying for a phase that isn't earning its keep. Choosing the draft means dropping symmetry and letting snake order do the balancing, Catan-style.
3. **Guardrail against zero territory.** A player who miscounts or gets blocked can finish setup owning nothing, which under §7 is an unplayable position reachable through ordinary bad play. Fix: enforce that each player's first placements form a legal loop, then free-place the remainder.
