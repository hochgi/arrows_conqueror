# P14 — Online ADR (cheap async multiplayer)

> **Status:** queued (post-MVP). Tracked as a design packet — not a GitHub issue.
>
> **Layer:** architecture / docs. **Depends on:** ADR 0001, P10, P11.
> **Unblocks:** P16–P19.

## Intent

Freeze the cheap online architecture before any infra lands:

- DIY Google OIDC (no Cognito); `sub` → stable player id
- Lambda + S3 only (no DynamoDB); S3 keyspace is the index
- Content-addressed `groupHash` / `gameId`
- Invite links materialize groups when full
- API Gateway WebSocket for `stateChanged` (no client poll loop)
- FE on `games.hochgi.com` (Pages); API on `api.games.hochgi.com`; WS on `ws.games.hochgi.com`
- Namecheap CNAMEs only — no NS delegation of `games`

## Deliverable

`docs/adr/0002-cheap-async-online.md` + index note in `02-work-packets.md`.

## Out of scope

Implementation, SAM, client Sign-In (those are P16–P19).
