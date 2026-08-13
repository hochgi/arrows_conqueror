# P16 — Online infra (SAM + CI + DNS)

> **Status:** queued. **Depends on:** P14 (ADR accepted). **Unblocks:** P17–P19.

## Intent

AWS SAM skeleton on the **owner's personal AWS account only**: private S3
bucket, HTTP API, WebSocket API, Lambdas (stubs ok), IAM, ACM hooks; GitHub
Actions OIDC deploy from **`hochgi/arrows_conqueror`**; Namecheap CNAME
checklist for `api.games.hochgi.com` and `ws.games.hochgi.com`.

API Gateway **base-path mapping** `/arrows_conqueror` on both custom domains so
a later game adds another mapping instead of another subdomain.

## Layout

- `infra/template.yaml` (SAM)
- `packages/online-api/` — handler package (hello/`/health` is enough here)
- `.github/workflows/api.yml` — path filter `infra/**`, `packages/online-api/**`,
  `packages/rules-core/**`, `packages/contracts/**`, `packages/geometry-*/**`

## Hard constraint

**Never deploy arrows-conqueror to employer / Versatile AWS.** Wait until the
personal account and credentials are the active target. OIDC role trusts
`repo:hochgi/arrows_conqueror:*` (optionally `main` only). Do not put that
role on `shalevhoch/arrows_conqueror`.

## Scenario inventory (for spec-author)

- Health (or empty) HTTP route under `/arrows_conqueror` on the custom domain
- Lambdas: HTTP + WS, **60s timeout / 1024 MB** on the move function (P18 burst)
- WS connect URL is `wss://ws.games.hochgi.com/arrows_conqueror`
- Bucket is private; Lambdas can read/write the `arrows_conqueror/` prefix
- Docs list the Namecheap CNAMEs (API, WS, ACM validation) without NS-delegating `games`
- CI no-ops on docs-only pushes

## Out of scope

Business handlers (P17–P18), Pages Sign-In (P19), any non-personal cloud.
