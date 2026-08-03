# rational — exact arithmetic for spawner accrual

**Packet:** [P01 — Contracts](../../design/packets/P01-contracts.md)
**SPEC:** §7 (accumulators, carry, reset on capture)
**ADR:** [0001](../../adr/0001-pure-core-and-pluggable-geometry.md) — exact rationals, never floats
**Features:** [core](./rational.core.feature) · [edge cases](./rational.edge-cases.feature)

## Purpose

**One** subsystem is rational-valued, and it is load-bearing:

- **Spawner accrual** (§7) — force *f* ≤ 1/3, typically 1/9 or 1/12, added to a
  per-arrow accumulator that carries its remainder.

Movement allowance used to be the second. It was the harmonic curve
`speed(N) = 1 + 1/2 + … + 1/N` with the fractional part banked between turns —
exact to compute and unreadable at the table, since you could not tell how far a
stack moved without knowing what it saved. SPEC §3 now uses
`speed(N) = 1 + floor(log₂ N)`: whole steps, nothing carried, no rationals. It
lives in [move](../move/move.md).

**Movement is integer, economy is exact rational.** The asymmetry is deliberate:
production is a slow trickle you must be able to bank, whereas tempo you did not
spend is tempo you gave away.

## Why exactness is a product property, not a preference

The economy's whole texture rests on it. An arrow may border two spawners, and
low-force spawners are the norm, so **coprime denominators are routine rather
than exotic** — 1/9 against 1/12 is the ordinary case, not the pathological one.
That is what produces *deterministic irregularity*: a rhythm complex enough to
feel organic while staying computable by an attentive player.

Float drift would make that merely noisy. And drift in an accumulator is drift
in the economy, which is drift in who wins.

The threshold behaviour is what makes it sharp: five additions of 7/36 fall
short of 1 and six overshoot it. An implementation carrying an epsilon lands on
the wrong side of that boundary, spawning a head a turn early or a turn late —
and then every subsequent carry is wrong too.

## Terms

| Term | Means |
|---|---|
| **force** | a spawner's rate *f*, a rational ≤ 1/3 |
| **accumulator** | a per-arrow production counter; carries remainder, resets on capture |
| **carry** | the remainder left after an accumulator crosses 1 and produces a head |

## Invariants

- The system shall represent every rational as an integer numerator and integer
  denominator.
- The system shall never represent a force or an accumulator as a floating-point
  number.
- The system shall compare rationals by value, so that equal values with
  different representations compare equal.
- The system shall provide a total order over rationals.
- When a whole unit is spent from an accumulator, the system shall reduce it by
  exactly 1.
- When an accumulator reaches or exceeds 1, the system shall produce one head
  and carry the exact remainder.
- If an arrow changes owner, then its accumulator shall reset to zero and shall
  not carry.
- The system shall produce identical results for the same sequence of operations
  regardless of the order equal-valued operands were constructed in.

## Note on the reset invariant

`reset-on-capture` is the one place in the design where progress is destroyed
rather than carried, and it is deliberate: it desynchronizes production, so
arrows taken on different turns run on different clocks and heads trickle out at
staggered intervals instead of arriving in waves. It also makes border churn
economically sterile — an arrow flipping back and forth never pays anyone.

P01 owns only the arithmetic. **P08 owns when a reset fires**, and the invariant
appears here so the type cannot make it awkward to implement.
