# Findings planner (playtest adapter)

Pure multi-goal stubs for the heuristic (and later BYOK targets). See
[P21](../../design/packets/P21-findings-planner.md).

```mermaid
flowchart LR
  legal[legal step moves] --> classify[classify + BFS cost]
  classify --> rank[score = reward*100 - cost*10]
  rank --> top[top maxFindings]
  top --> choose[chooseMove prefers top.move]
```

## Invariants

- WHILE collecting findings, the system shall not use time, randomness, or I/O.
- WHEN findings are sorted, the system shall order by descending score then ascending move key.
- WHEN a legal step exists, chooseMove shall not return endTurn.

## Spec files

- `findings-planner.core.feature`
