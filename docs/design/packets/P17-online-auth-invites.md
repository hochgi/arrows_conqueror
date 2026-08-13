# P17 — Online auth, invites, discovery

> **Status:** queued. **Depends on:** P14, P16.

## Intent

- Verify Google ID tokens in Lambda (`sub` → `userHash`)
- `GET /me`
- `POST /invites` — host creates a 3- or 6-seat lobby, marks seats
  `human | heuristic`, occupies the first human seat
- `POST /invites/:token/accept` — next unbound human seat; full → 409
- Host revoke; lobby TTL per ADR
- Reject create/start with **fewer than 2 human seats** (1-human+AI and all-AI
  are browser-only; no S3)
- Membership pointers + `GET /my-games` (that user only)
- `POST .../start` when every human seat is bound → open-or-create
  `groupHash = H(sorted human userHashes)`, allocate **next** `games/NNNNNN`
  (never overwrite a past game)
- Invite: **no TTL**; host revoke; token 410 after Start

## Scenario inventory (for spec-author)

- Happy: 3-seat (2 human + 1 heuristic) invite → two Google users → Start → membership on both `/my-games`
- 6-seat all-human fill then one extra accept → 409, no spectator row
- All-heuristic or 1-human create → 4xx, no S3 group
- Same user accepts twice → idempotent same seat
- Unauthenticated accept → 401
- Start before human seats are full → 409
- Revoked token → 410/404
- `/my-games` never lists another user's group

Committed tests: Vitest against an `OnlinePort` (or HTTP handler ports) with
fake S3 / fake Google verify. Kit/S3 probes stay on `local-main`.

## Out of scope

Move submit / WebSocket notify / heuristic burst (P18), FE wiring (P19).
