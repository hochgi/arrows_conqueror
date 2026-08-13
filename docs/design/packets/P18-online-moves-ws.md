# P18 — Online moves + WebSocket notify + heuristic burst

> **Status:** queued. **Depends on:** P14, P16, P17. Bundles `rules-core` into Lambda.

## Intent

- `POST /games/.../moves` — authz (active human seat + matching `sub`),
  `If-Match` version, `apply`, then **while next seat is heuristic and the
  game is not over:** `chooseMove` + `apply`. Persist **once** at the end of
  the burst (state + log append of every move in the burst). Notify humans
  once.
- Timeout of the Lambda leaves S3 unchanged so the client may retry the same
  move + version. Size: **60s / 1024 MB**. Worst burst: **4** consecutive
  heuristic seats (6-player, 2 humans on opposite corners).
- `$connect` / `$disconnect` + `connections/<userHash>/<connectionId>` in S3
- On success: `PostToConnection` `{ type: "stateChanged", version, groupHash, gameNumber }`
- Stale connection ids → delete key
- GET game state (members only) for the client refresh

Heuristic is the **server** copy of the existing web heuristic (or a shared
module). Must stay deterministic (stable tie-break). No `Math.random`.

## Scenario inventory (for spec-author)

- Human move, next seat human → one apply, notify, version +1
- Human move, next four seats heuristic → five applies in one put; next active
  seat is the following human
- Burst that ends the game (domination/elimination) mid-AI → persist terminal
  state, no further AI
- Wrong seat / wrong user → 403, no write
- Stale `If-Match` → 412
- Illegal move → 422, no write
- All-human 3p: WS wakes the two others, not the mover-only
- Disconnect GC: gone connection id is dropped, later notify skips it

## Out of scope

Pages client (P19), BYOK online, viewers, fork.
