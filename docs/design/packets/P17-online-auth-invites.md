# P17 — Online auth, invites, discovery

> **Status:** queued. **Depends on:** P14, P16.

## Intent

- Verify Google ID tokens in Lambda
- `GET /me`, `POST /invites`, `POST /invites/:token/accept`
- Membership pointers + `GET /my-games` (aggregated metas)

## Out of scope

Move submit / WebSocket notify (P18), FE wiring (P19).
