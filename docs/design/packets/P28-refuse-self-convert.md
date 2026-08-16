# P28 — Refuse self-convert

> **Status:** shipping. **Depends on:** P04, P05, P07, P11, P22.
> Playtest: a stack-grade / marked-trail stack walked onto enemy territory and
> converted itself on that same `apply`. The player read thin fill as protection.
> **Human already decided:** refuse the step; teach why on hover. Opponent-caused
> conversion is unchanged.

## Intent

Stop **self-inflicted** conversion on the mover's own step. Do not invent a
second capture mechanic. Do not weaken opponent-caused conversion (closure
around a garrison; cut that demotes a raider already inside).

## BSSN (locked here)

- **Self-convert steps are illegal.** Destination is another player's
  **territory** and the mover is not **territory-grade protected** from `from`
  → omit every `count` of that `(from, exit)` from `legalMoves`; `apply` throws
  `ContractViolation` with the stable message
  `step onto enemy territory without a territory-grade trail would convert`.
  No occupancy, trail, territory, or owner mutation.
- **Protection is read off `from` before the step.** Protected iff `from` is
  the mover's territory **or** `from` is in the mover's trail and
  `anchorGrade(state, from, mover) === 'territory'`. Adding `exit` to the trail
  cannot create a path home that did not exist.
- **§6.3 conversion stays a state predicate** for groups that become encircled
  on **another** player's apply. Skip remains a no-op. Do not delete
  `convertEncircled`.
- **No combat simulation.** Enemy-occupied `exit` on foreign territory is still
  illegal when unprotected — refuse **before** battle. Stay-behind (§6.2) is
  independent.
- **Neutral and own territory are unchanged.** Stack-grade on unclaimed ground
  stays legal. Coming home onto own territory is not this refusal.
- **No new `RulesPort` method.** Observe via `legalMoves` + `apply` +
  `anchorGrade`.
- **Web:** grain-adjacent refused `exit` while the stack on `from` is selected —
  refused wash (reuse `TOLL_REACH_FILL`, no toll copy), `cursor: not-allowed`,
  tooltip exactly `Would convert. This is their territory, and you have no trail home.`
  Click does not open the portion picker and does not `apply`. Multi-hop
  `reachFrom` needs no special case (`apply` already throws). Convert tooltip
  wins over spawner hover on that arrow. Pure helper next to other web fx
  (`refusedConvert.ts`); tests against the helper, not React Testing Library.
- **Bots / LLM / online follow `legalMoves`.** Filtering the core is the block.
  Online 422 already means illegal `apply`. No ADR change.

## Out of scope

- A second trail fill for territory-grade vs stack-grade.
- Changing conversion of already-encircled groups, intact stacks, `spent`
  reset, convert wipe of the encircled path (P33 / item 40).
- Skip / `endTurn` starting to convert.
- Territory combat modifiers (§11 item 39).
- Multi-hop refused-reach, a reasons enum.
- Online protocol, BYOK prompt-text.

## Scenario inventory

- Stack-grade fragment cannot step onto enemy territory (`legalMoves` omit +
  `apply` refuse, state intact)
- Unmarked stack on neutral cannot step onto enemy territory
- Occupied marks that do not reach home are stack-grade and do not protect
- Territory-grade trail into enemy land remains legal and does not convert
- Stepping off own territory onto enemy territory remains legal
- Coming home onto own territory is offered
- Stack-grade onto unclaimed ground remains legal
- Unprotected attack onto enemy-occupied enemy territory is illegal (before combat)
- Protected raid may still attack on enemy territory
- Unprotected attack onto an enemy stack on *neutral* is not this rule
- Every `count` omitted; leaving a sentry does not license the advance
- Cut demotion of a raider already inside still converts
- Closure around an unprotected garrison still converts
- Skip still does not convert
- Refused apply does not mutate input; equal illegal inputs throw equal messages
- Remaining `legalMoves` still `apply`
- Web: refused grain target, click no-op, protected/unclaimed ordinary reach,
  no tooltip without selection, convert tip wins over spawner, HUD may mention
