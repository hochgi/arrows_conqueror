# P14 — Online ADR (cheap async multiplayer)

> **Status:** queued. Next `/spec-to-ship` after P24.
>
> **Layer:** architecture / docs. **Depends on:** ADR 0001, P10, P11, P24.
> **Unblocks:** P16–P19.
>
> **Pipeline:** ADR + SPEC pointer. **Skip phases 2–3** (no failing tests for a
> document). Phase 4 is spec hygiene: no game-rule invented in the ADR, packet
> index matches, P20+ wishes recorded.

## Intent

Freeze the cheap online architecture before any infra lands. Game rules stay in
`SPEC.md`. This packet writes `docs/adr/0002-cheap-async-online.md`.

## Locked decisions (do not reopen in later packets)

| Topic | Decision |
|---|---|
| Seats | **3 or 6 only** (rotational grain fairness; same as playtest lobby) |
| Online AI | `human \| heuristic`. BYOK stays local |
| Who pays AWS | **≥2 human seats**, all bound, before any S3 group/game exists. 1 human + AI is browser-only (today's local lobby). All-AI is browser-only |
| AI driver | Same move Lambda: apply human move, then `chooseMove`+`apply` while next seat is heuristic, until a human seat or the game ends. **One** state put + log append for the whole burst. Notify humans once |
| Worst AI burst | 4 consecutive heuristic turns (6-seat: H, A, A, A, A, H). Lambda **60s / 1024 MB**. Persist-at-end so timeout is retry-safe |
| Invites | Opaque shareable token URL. Host occupies first human seat. Invitees take the next unbound human seat. Full → 409, **no viewers** |
| Start | Host **Start** when every human seat is bound. Materialize group + **next** game number (never overwrite) |
| Invite life | **No TTL.** Valid until host revokes or the lobby Starts (token then 410). Games never expire |
| Authz | Only the active human seat whose Google `sub` maps to that binding may `POST` a move |
| Games | Never auto-delete; resume forever from S3. Rematch = next `games/NNNNNN` under the same group |
| Group id | `groupHash = H(sorted human userHashes)` — Google `sub`s only, order-independent. Heuristic seats and 3-vs-6 plan are **not** in the hash (they live on the game's meta). Same two people always share one group folder |
| Game id | Integer counter per group, zero-padded path `games/000001`. Not concatenated into the hash |
| Library | `GET /my-games` = that user's memberships only. No public browse |
| Meta seats | `seats: [{ kind: 'human', userHash }, { kind: 'heuristic' }, …]` so the FE can show "B is AI" |
| Notify | API Gateway WebSocket `{ type, version, groupHash, gameNumber }`; client GETs state. `visibilitychange` safety net, no poll loop |
| Auth | DIY Google OIDC JWT in Lambda. No Cognito. `sub` → stable player id |
| Store | S3 only. No DynamoDB |
| DNS | Namecheap CNAMEs. No NS-delegation of `games`. No Route53 hosted zone |
| Hosts | FE `https://games.hochgi.com/arrows_conqueror/`. HTTP `https://api.games.hochgi.com/arrows_conqueror`. WS `wss://ws.games.hochgi.com/arrows_conqueror`. Path is the game; hostnames are shared for future games via API Gateway base-path mapping |
| Code | Lambda TypeScript, same repo, bundles `rules-core`. Path `infra/` + `packages/online-api/` |
| Deploy | SAM from **`hochgi/arrows_conqueror`** via GitHub Actions OIDC to **personal AWS only**. Pages stays on `shalevhoch` |
| Language | TypeScript. Do not rewrite the engine in Go/Rust |

## S3 layout

```text
arrows_conqueror/users/<userHash>/groups/<groupHash>
arrows_conqueror/groups/<groupHash>/meta.json
arrows_conqueror/groups/<groupHash>/games/000001/meta.json
arrows_conqueror/groups/<groupHash>/games/000001/state.json
arrows_conqueror/groups/<groupHash>/games/000001/log.jsonl
arrows_conqueror/invites/<token>.json
arrows_conqueror/connections/<userHash>/<connectionId>
```

(Prefix `arrows_conqueror/` so a future game can share a bucket or not.)

Ids: SHA-256 truncated (16 bytes). `groupHash = H(sorted human userHashes)`.
`groups/<groupHash>/meta.json` holds `nextGameNumber` (or equivalent). Start
allocates the next integer; existing `games/NNNNNN` objects are never
overwritten. ETag/version on game `state.json` for same-player double-tab.

Equivalent identity to `${groupHash}_${counter}` — the counter is a path
segment, not part of the hash (hashes are not incrementable).

## Deliverable

- `docs/adr/0002-cheap-async-online.md`
- Short pointer in `SPEC.md` that online is not a game-rule chapter
- Index note in `02-work-packets.md`

## Out of scope

SAM, handlers, Pages Sign-In, viewers, fork, arena, Elo, auto-replay, online BYOK
(those are P16–P19 or P20+).
