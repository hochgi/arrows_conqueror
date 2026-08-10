# byok-turn-runner (experiment)

Local **plan → commit → validate** orchestrator for BYOK seats. Not LangGraph —
a tiny Node HTTP service on loopback.

## Abandon

This lives on branch `feat/byok-turn-orchestrator`.

```bash
git checkout main
git branch -D feat/byok-turn-orchestrator
# or: git reset --hard c1fcc62   # if you merged and regret it
```

## Run

Terminal A — your LiteLLM (already on `:4000`).

Terminal B:

```bash
pnpm byok-turn
# → http://127.0.0.1:4010
```

Terminal C — web:

```bash
pnpm --filter @arrows/web dev
```

In the lobby, for a BYOK seat: enable **Turn runner**, URL `http://127.0.0.1:4010`
(or leave empty under Vite — `/__turn` proxies to 4010).

## Protocol

`POST /v1/pick`

```json
{
  "upstream": "http://127.0.0.1:4000/v1",
  "apiKey": "…",
  "model": "nvidia-nemotron-3-ultra",
  "seat": "B",
  "moveCount": 4,
  "system": "…",
  "user": "STATE_JSON + LEGAL_MOVES …",
  "plan": true
}
```

Response:

```json
{
  "ok": true,
  "move": 0,
  "why": "toward unclaimed spawner",
  "trace": [
    { "step": "plan", "ms": 1200, "ok": true, "detail": "tentative=0" },
    { "step": "commit", "ms": 800, "ok": true, "detail": "move=0" },
    { "step": "validate", "ok": true, "detail": "move=0" }
  ]
}
```

Keys stay on the request; the runner does not log them.
