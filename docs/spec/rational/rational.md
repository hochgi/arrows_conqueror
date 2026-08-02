# rational — exact arithmetic for allowance and accrual

**Packet:** [P01 — Contracts](../../design/packets/P01-contracts.md)
**SPEC:** §3 (harmonic speed, banked fractional movement), §7 (accumulators)
**ADR:** [0001](../../adr/0001-pure-core-and-pluggable-geometry.md) — exact rationals, never floats
**Features:** [core](./rational.core.feature) · [edge cases](./rational.edge-cases.feature)

## Purpose

Two subsystems are rational-valued, and both are load-bearing:

- **Movement allowance** (§3) — `speed(N) = 1 + 1/2 + … + 1/N`, with the
  fractional part banked between turns.
- **Spawner accrual** (§7) — force *f* ≤ 1/3, typically 1/9 or 1/12, added to a
  per-arrow accumulator that carries its remainder.

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
| **allowance** | a stack's movement budget for the turn |
| **bank** | the fractional part of an allowance, carried to the next turn |
| **carry** | the remainder left after an accumulator crosses 1 and produces a head |

## Invariants

- The system shall represent every rational as an integer numerator and integer
  denominator.
- The system shall never represent force, allowance, accumulator or bank as a
  floating-point number.
- The system shall compare rationals by value, so that equal values with
  different representations compare equal.
- The system shall provide a total order over rationals.
- When a whole step is spent from an allowance, the system shall reduce it by
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
