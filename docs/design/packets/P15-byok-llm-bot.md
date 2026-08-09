# P15 — Local BYOK LLM bot

> **Status:** landed (adapter). Can ship before any online work.
>
> **Layer:** web adapter only. **Depends on:** P11. **Does not touch:** rules-core.

## Intent

Optional OpenAI-compatible opponent for local vs-bot playtest. The player
supplies `base_url` + `api_key` + `model`. Calls run **only in the browser**;
the key never leaves the session and is never written into match logs.

Motivation: a stronger seat surfaces rules/UX issues before backend contracts
harden.

## Behaviour

1. Lobby: when "Play against bot" is on, optional BYOK fields.
2. Each bot decision: build a prompt with a short rules summary, a compact state
   snapshot, and an **exhaustive numbered** `legalMoves` list.
3. Model replies with a move **index**; client accepts only if ∈ that list.
4. Illegal / network / parse failure → fall back to the heuristic `chooseMove`
   for that step (never invent a move).
5. Config lives in `sessionStorage` only.

## Out of scope

- Server-side proxies, key storage, conversation memory across turns beyond the
  current decision
- Changing `Move` / `GameState` contracts
- Online multiplayer (P14+)
