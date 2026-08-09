# P18 — Online moves + WebSocket notify

> **Status:** queued. **Depends on:** P14, P16, P17. Bundles rules-core into Lambda.

## Intent

- `POST /games/.../moves` — authz, `apply`, conditional S3 put, append log
- `$connect` / `$disconnect` + `connections/<userHash>/<connectionId>` in S3
- On successful move: `PostToConnection` `{ type: "stateChanged", version, ... }`

## Out of scope

Pages client (P19).
