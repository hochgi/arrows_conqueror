# P16 — Online infra (SAM + CI + DNS)

> **Status:** queued. **Depends on:** P14. **Unblocks:** P17–P19.

## Intent

AWS SAM skeleton on the **owner’s personal AWS account only**: private S3
bucket, HTTP API, WebSocket API, Lambdas, IAM, ACM hooks; GitHub Actions OIDC
deploy; Namecheap CNAME checklist for `api.games.hochgi.com` and
`ws.games.hochgi.com`.

## Hard constraint

**Never deploy arrows-conqueror to employer / Versatile AWS.** Wait until the
personal account and credentials are the active target.

## Out of scope

Business handlers (P17–P18), Pages Sign-In UI (P19), any non-personal cloud.
