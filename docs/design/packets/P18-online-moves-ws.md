# P18 — Online moves + WebSocket notify + heuristic burst

> **Status:** shipping. Gate 4: PR to `hochgi/conquarrow`. **Depends on:** P14, P16, P17. Bundles `rules-core` into Lambda.

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

## P17 follow-ons (conditional store)

P17 invite/Start writes are last-write-wins. When this packet adds conditional
put for move `If-Match`, use the same primitive on lobby mutations:

- **Accept:** `If-Match` on `invites/<token>.json` so two concurrent accepts
  cannot bind the same chair; 412 → re-read and retry.
- **Start / rematch:** `If-None-Match: *` on `games/NNNNNN/meta.json` and a
  conditional bump of `nextGameNumber`, so concurrent Start cannot overwrite
  a game (ADR “never overwrite”).
- **Start retry:** if game/group writes succeed but the invite stays `open`,
  a retry can allocate a second game. Persist a resumable start (including
  the chosen game number) so a retry finishes the same start. Do **not**
  change the 410-after-successful-Start rule on GET/accept; that is specified.

Do not add a `membership` field to `groups/<groupHash>/meta.json`. Seats live
on game `meta.json`; library rows are the per-user pointer keys.

## Out of scope

Pages client (P19), BYOK online, viewers, fork.
