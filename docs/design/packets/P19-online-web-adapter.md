# P19 — Online web adapter

> **Status:** landed on `hochgi/conquarrow` (`9898041`, PR #5). Shell is P25.
> **Depends on:** P17, P18.

## Intent

GitHub Pages **adapter** (`createOnlinePages`): GIS session, hash routes, REST,
WS wake-up — tested against fakes, not React.

Env: `VITE_API_BASE=https://api.games.hochgi.com/conquarrow`,
`VITE_WS_URL=wss://ws.games.hochgi.com/conquarrow`,
`VITE_GOOGLE_CLIENT_ID`.

## Out of scope (discharged by P25)

React shell wiring (`App.tsx` / `Lobby.tsx`). Host forwards GIS credentials and
WS `stateChanged` frames into the adapter.
