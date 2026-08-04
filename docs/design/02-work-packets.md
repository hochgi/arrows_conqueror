# 02 — Work packets: index, dependencies, build order

> **Status:** Draft for review.
> Each packet is one encapsulated unit of work, sized for a single `/spec-to-ship`
> run (spec → tests → code → review, human gate between phases). A packet doc is
> the **phase-1 input**: it fixes scope, decisions, invariants and a scenario
> inventory; the spec-author session turns those into Gherkin + EARS with the
> human in the loop.
>
> Everything here is derived from [`SPEC.md`](../../SPEC.md). The § references
> point at the section that owns the behaviour.

## MVP scope

MVP is **stateless, client-only, hot-seat** (SPEC §1). Two players alternating on
one machine, no save/resume, no server, no AI.

That trims the plan rather than reshaping it: **P12 leaves MVP**, and P11 becomes
the only adapter that ships. Nothing moves the other way — there was never a
persistence or netcode packet, because ADR 0001 kept both outside the core by
construction.

**P10 stays in, and its justification changes.** With no save/resume it is not a
product feature; it is the determinism detector, which is the reason it was
scheduled early in the first place.

## Packet index

| # | Packet | Layer | SPEC | Depends on | Gate / risk |
|---|---|---|---|---|---|
| P01 | Contracts: ports & DTOs | foundation | §2–7 | — | unblocked — §11 item 19 settled the `Move` DTO: one unit, one step |
| P02 | Fixture geometry (hand-authored boards) | foundation | §2 | P01 | **no longer owes the green suite — P03 discharges it**, so P02 matches a suite already known satisfiable. Fixtures are **abstract conformant digraphs, not lattice sub-boards** (§11 item 29) — floor near 6 points / 18 arrows against 16/48 for the smallest conformant torus, and readability when a *rules* test fails is the whole point. Slots must **alternate** in/out; the phase is free. No layout: an abstract board has no coordinates |
| P03 | Tiling generator & torus wrap | foundation | §2 | P01 | **[packet doc written](./packets/P03-tiling.md); taken next, ahead of P02.** A generator, not an extraction, and the maths is already validated against the artwork by a throwaway viewer (14/14 conformance, 14×14 torus). **Discharges the conformance debt** instead of P02 — 28 assertions, unedited. Also owns the renderer's **layout** (a polygon per arrow), which is *not* on `GeometryPort`: item 29 made fixtures abstract digraphs, and those have no coordinates at all. Board floor is **4×4** |
| P04 | Movement, stacks & the turn loop | rules | §2–4 | P01, P02 | allowance is an **integer** — `speed(N) = 1 + floor(log₂ N)`, nothing carried between turns. No rationals on this path; exact rationals belong to the §7 accumulators (P08) |
| P05 | Trails, crossings & closure | rules | §2, §5, §7 | P04 | the chord test and even-odd fill are the subtlest logic in the game. Fill must read the trail's **arrow set** and use `chordsInterleave`, not `chordsCross` (§6.1a). A point presents `i × o` chords, not one — extracting them is this packet's job, and `chordsCross` is called once per chord. Also owns §5's branch-anchor legality: a move creating a join or a split must leave a head |
| P06 | Cuts, evaporation & combat | rules | §6 | P05 | **§6 was rebuilt twice after P01 landed.** Bidirectional evaporation, one kill per front, 1:1 per-move combat — then bare trail, **all-to-all points**, and **per-arrow halting** (a head does *not* shield the point ahead against fire; that range is combat's alone). Two grades of anchor, territory and stack, and conflating them breaks §6.3 |
| P07 | Territory & encirclement | rules | §7 | P05, P06 | conversion must conserve total heads exactly |
| P08 | Spawner economy | rules | §7 | P07 | exact rationals only — **the accumulator is the one thing in the game that banks**; blockades halt accrual and cost the share. Accrual takes *a* force per spawner and must never read its value: **no branch on 1/3 vs 1/12, no threshold against a constant** (§7, *placement and force are setup data*). MVP defaults are playtest-first (§11 items 12 and 25) and a retune must not change which scenarios pass |
| P09 | Match lifecycle, setup & victory | rules | §8, §9 | P07, P08 | the turtle stalemate is an accepted risk (§9) — watch for it here. **Owns the spawner tuning table**: which eligible vertices carry a spawner, band boundaries, force per band — one input read once at setup, not conditions spread through placement (§7) |
| P10 | Replay & determinism harness | cross-cutting | — | P04, P09 | the primary detector of accidental nondeterminism |
| P11 | Renderer & hot-seat input | adapter | §2, §5, §7 | P03, P09 | the only shipping adapter. Galcon-style source→destination→portion input; trail-vs-territory must be legible at a glance (§5) |
| ~~P12~~ | ~~AI opponent~~ | — | — | — | **out of MVP** (hot-seat). Kept in the graph because P10 exists partly to make it cheap later |

## Dependency graph

```mermaid
flowchart TD
  P01["P01 contracts"] --> P02["P02 fixture geometry"]
  P01 --> P03["P03 tiling geometry"]
  P02 --> P04["P04 movement & turns"]
  P04 --> P05["P05 trails & closure"]
  P05 --> P06["P06 cuts & combat"]
  P05 --> P07["P07 territory & encirclement"]
  P06 --> P07
  P07 --> P08["P08 spawner economy"]
  P07 --> P09["P09 match lifecycle"]
  P08 --> P09
  P04 --> P10["P10 replay harness"]
  P09 --> P10
  P03 --> P11["P11 renderer & hot-seat input"]
  P09 --> P11
  P09 -.-> P12["P12 AI opponent — post-MVP"]
  P10 -.-> P12
```

## Build order and why

**P01–P02 first, and P03 in parallel.** The tiling is fully known — the oriented
triangular lattice with alternating junctions (§2, §11 item 1) — so P03 generates
a board from two basis vectors and a modulus rather than tracing an image, and
there is no measurement left anywhere in the plan. Keeping fixture geometry
separate still pays: rules packets test against small hand-authored boards with
known adjacency, which make failures readable, while both implementations answer
to the same `GeometryPort` and the same conformance suite.

It pays by more than it looks, because **the smallest conformant torus is 4×4** —
16 points and 48 arrows, since anything smaller breaks *girth-3 encloses exactly
one vertex* under wrap (§11 item 29). A hand-authored abstract digraph has no wrap
and bottoms out near 6 points and 18 arrows. That is the difference between a
fixture you can read when a rules test fails and one you cannot, and it is why P02
authors graphs rather than sub-boards.

**P03 is the closest thing to a hard prerequisite, and it used to be P02.** Until
one of them lands, 28 of P01's tests are pending rather than passing, so the repo
has no board and no rules packet can be tested against one. P03 is taken first
because it also produces a **visible** board, and because proving the suite
against the real tiling is worth more than proving it against a fixture.

**P04 → P05 → P06 → P07 is a genuine chain.** Closure needs movement; cuts need
trails to cut; territory needs both closure and the encirclement that combat
produces. Do not try to parallelise these — the interactions are the game.

**P08 after P07**, because a spawner share is ownership of an arrow *as
territory*, so there is nothing to accrue to until territory exists.

**P10 early enough to matter.** The replay harness is worth landing as soon as
there is a turn loop to replay. Its value is not regression coverage, it is that
it catches nondeterminism *while the core is still small enough to find it*.

## Open items this plan inherits

Tracked in [`SPEC.md` §11](../../SPEC.md): **two tuning knobs, and nothing
structural.** No geometric measurement remains — items 1, 5, 16 and 29 are all
resolved, so P03 generates rather than extracts. Nothing blocks any packet.

- **item 11** — board size `(n, m)`, and MVP player count fixed at 2 → **P09**
- **item 12** — spawner density, resolved as *non-uniform*: dense and fast in the
  contested centre, sparse and slow at home. MVP defaults are written down and
  explicitly playtest-first → **P09**

Items 11 and 12 are a single balance sweep against total spawner force, and want
a playable game rather than an argument — which is why P09 owns them and why the
replay harness (P10) lands right behind it.

Neither is a blocker, and the reason is a constraint rather than an accident:
§7's *placement and force are setup data* keeps every one of these numbers on the
setup side of the port. Build against the defaults now; the sweep later is a
table edit, and if it turns out not to be, that is a defect in P08 or P09.

**Item 20 is closed and the plan used to say otherwise.** The two "residual carry
edges" it listed dissolved when §3 dropped banking — there are no carries to
forfeit or duplicate, so P04 inherits nothing from it.

An item with no packet owner is a scoping gap, not a decision. Say so rather than
absorbing it.

## Packet docs

Individual packet docs live in `./packets/PNN-<slug>.md` and are written
just-in-time, immediately before the `/spec-to-ship` run that consumes them.
Writing them all up front would bake in assumptions that earlier packets are
about to invalidate.
