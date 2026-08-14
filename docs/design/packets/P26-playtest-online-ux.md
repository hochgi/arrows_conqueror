# P26 — Playtest online UX (first-two-minutes)

> **Status:** shipping. **Depends on:** P17, P18, P19, P25.
> First family playtest (2026-08-14): the match worked; the lobby lied.

## Intent

Fix the online lobby and HUD so two humans can sit down without reading the
ADR. Not a new game rule. Not a second auth. Not an admin panel.

## Out of scope (answered, not built)

- **Under-18 / Family Link Sign-In.** Google blocks GIS ID tokens for
  supervised accounts. Publishing the OAuth consent screen to **Production**
  (non-sensitive `openid` / `email` / `profile`) is when *any 18+ Gmail* can
  play without Test users — do that after the lobby UX is not embarrassing.
  Designed-for-families / COPPA is a later compliance project, not this
  packet. Wish stays on [P20](./P20-deferred-online-followons.md).
- **Admin panel.** Family scale: S3 prefixes under `conquarrow/` plus
  CloudWatch on the Lambdas. Wish on P20.

## BSSN (locked here)

- **GET `/games/{groupHash}/{gameNumber}`** includes `seats` (the game meta
  `InviteSeat[]`). Same chairs as the invite. Google `sub` still never
  appears. A hash-boot or a second device no longer invents `human` for a
  heuristic chair.
- **410 `started`** also carries `groupHash` and `gameNumber` when the invite
  record has them (additive; `reason` stays required). The waiting host can
  open the match the other human Started.
- **Accept is not offered** when `/me` `userHash` already occupies a human
  chair. Creator is bound at create — they must not need to Accept their own
  invite. Idempotent accept remains on the API.
- **Seat plan is frozen** once an invite token is live. Guests and the host
  see the **invite roster** (Player / AI / waiting / you), not live dropdowns
  that rewrite everyone else's chairs.
- **Display copy:** `human` → **Player**, `heuristic` → **AI**. Internal
  kinds and API JSON stay `human` | `heuristic`.
- **Lobby liveness:** while an invite token is held and no board is open, the
  shell ticks `refreshLobby` (peek invite + `/my-games`). Peek is the
  unauthenticated GET already allowed. No new WS message type. No always-on
  extra AWS.
- **`visibilitychange` visible** also peeks that invite and refreshes the
  library (not only GET of an open game).
- **Online auto-pass:** when the GET board is the caller's turn and
  `legalMoves` has no `step`, the shell POSTs `endTurn` (same adapter
  `submitMove`, no local `apply`). The HUD "No steps left — passing…" must
  not lie. Heuristic burst stays on the server.
- **HUD clip:** `html` / `body` / `#root` / `.app` do not scroll horizontally;
  pan stays on the SVG stage. No new layout framework.

## Scenario inventory

- GET game body includes seats; two clients show the same A/B/C kinds
- 410 started includes groupHash/gameNumber; waiting host opens that game
- Creator signed in on their invite: Accept is not offered
- Guest on an open invite: Accept is offered until they occupy a chair
- After create, seat dropdowns are not offered; roster shows waiting vs you vs AI
- refreshLobby peeks the invite; newly bound human enables Start
- Online exhausted human turn POSTs endTurn
- Local auto-pass unchanged (in-process `passIfExhausted`)
