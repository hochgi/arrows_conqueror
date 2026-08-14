# P25 — Pages online shell

> **Status:** shipping. PR to `hochgi/conquarrow`. **Depends on:** P19.

## Intent

Make `games.hochgi.com/conquarrow/` actually offer Online: instantiate
`createOnlinePages`, bind GIS / `hashchange` / `visibilitychange` / WebSocket
`onmessage`, and render Local | Online lobby plus the GET board.

P19 already owns adapter behaviour. This packet is the **host**: DOM events,
GIS script, Vite env on Pages, and the existing `Lobby` / `App` chrome.

## BSSN (locked here, not escalate)

- No React Testing Library. Tests drive a DOM-free **host binder**
  (`createOnlineHost`) that owns window/document/GIS/WebSocket facades and
  calls the P19 port. `App.tsx` / `Lobby.tsx` stay thin.
- GIS: Google Identity Services (`accounts.google.com/gsi/client`), not
  Firebase. `gis.prompt()` loads/initializes with `VITE_GOOGLE_CLIENT_ID` and
  yields the ID token into `deliverGoogleCredential`.
- Real `fetch` and `WebSocket` factories wrap the P19 facades. WS `onmessage`
  JSON `{ type: "stateChanged", ... }` → `receiveStateChanged`. Invalid JSON
  is ignored.
- `hashchange` → `boot()`. `visibilitychange` to visible → `becomeVisible()`.
- Lobby: one screen, **Local | Online**. Online hides BYOK. Sign-In required
  before Create. Copy-invite after create. **Start enabled** when every human
  seat on `inviteSeats()` is bound (heuristic may remain). Local Start is
  today's `startMatch` (never AWS).
- Online play: HUD/board from `adapter.board()`; pointer moves call
  `submitMove`; no local `apply`, no `playBotTurn`. 422 shows a short
  "illegal" string in the shell (port has no error channel — host tracks last
  POST status).
- HTTP 410 on invite: gone even if `reason` is missing (adapter boy-scout from
  P19 review). Parsed `revoked` / `started` still preferred for copy.
- Pages workflow injects `VITE_API_BASE`, `VITE_WS_URL`, and
  `VITE_GOOGLE_CLIENT_ID` (`vars.VITE_GOOGLE_CLIENT_ID`). Missing client id
  keeps Online hidden (P19). **Not a new AWS cost.**
- Rematch / auto-replay remain P20+.

## Scenario inventory

- Missing Vite env: Online toggle absent; Local Start still works
- Local 1-human+AI Start never fetches / never opens WS
- Signed-in Online: GIS yield stores session key and opens WS
- Hash `#/invite/<token>` unsigned: peek then GIS
- Copy-invite URL uses Pages pathname
- Online Start disabled while a human seat is unbound; enabled when all humans bound
- WS frame → GET open game
- `visibilitychange` visible → GET open game
- `hashchange` to `#/g/…` → GET
- Online step POSTs then board is the GET (not local apply)
- My-games row sets `#/g/…`
- Sign-out: lobby hash, no session key, socket closed
- 410 invite without reason: accept is not POSTed

## Out of scope

Elo, juice, viewers, fork, arena, auto-replay, online BYOK, N-player other than 3/6.
No new Lambda / Dynamo / always-on compute.
