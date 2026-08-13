# P19 — Online web adapter

> **Status:** queued. **Depends on:** P17, P18.

## Intent

GitHub Pages client on `games.hochgi.com/arrows_conqueror/`:

- Google Sign-In (public client id)
- Online lobby: 3 or 6, mark seats human/heuristic, copy invite link
- Claim next human seat from `#/invite/<token>`
- Host Start; play via REST; refresh on WS `stateChanged` and on `visibilitychange`
- `GET /my-games` library; open a game (in progress or finished) at its URL
- Keep hot-seat / heuristic / BYOK **local** paths

Finished games: members can open the **current/final** position. Auto-replay
button is P20+.

Env: `VITE_API_BASE=https://api.games.hochgi.com/arrows_conqueror`,
`VITE_WS_URL=wss://ws.games.hochgi.com/arrows_conqueror`,
`VITE_GOOGLE_CLIENT_ID`.

## Scenario inventory (for spec-author)

- Signed-out invite link → Sign-In then accept
- Full lobby shows "game full", does not enter as viewer
- Local 1-human+AI and all-AI still start in the browser and never call the API
- Online create/Start requires ≥2 human seats, all bound
- WS message → GET state; board updates without a poll loop
- My-games lists only memberships; resume opens the stored version

## Out of scope

Elo, juice, N-player other than 3/6, viewers, fork, arena, auto-replay, online BYOK.
