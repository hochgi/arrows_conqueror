# P27 — Lobby follow-up (create wait, seats, Sign-In)

> **Status:** shipping. **Depends on:** P25, P26.
> Second family playtest pass (2026-08-14): match works; create feels hung;
> Local→Online still looks like a 1-human hot-seat; dismissed GIS One Tap
> dead-ends the Sign-In button.

## Intent

Three first-minute lobby fixes. Not a game rule. Not a second auth. Not AWS.

## BSSN (locked here)

- **Create wait.** `POST /invites` can take seconds (cold Lambda). While that
  POST is in flight the host reports `createInvitePending()`. Create is not
  offered (no second POST). The shell shows an hourglass and the exact copy
  `Creating your unique invite link - this may take a few moments…`
  (`CREATING_INVITE_COPY` in the web package). When the POST settles (2xx or
  not), pending is false. Failure does not invent a URL. No new AWS.
- **Online Player floor.** ADR 0002 already forbids 1-human online. On
  **Local → Online**, coerce the seat plan: indices **0 and 1 become `human`**
  (Player). Other chairs stay as they were, except `byok` becomes `heuristic`
  (Online still has no BYOK). Coerce runs on that mode switch only — not on
  every render — so a later Player→AI is possible when the floor allows.
- **Player → AI.** In Online mode, changing a `human` chair to `heuristic` is
  applied only when the plan currently has **≥ 3** `human` chairs (so ≥ 2
  remain). AI → Player is always applied. Local mode is unchanged (1 Player +
  2 AI stays legal). `createOffered` still requires ≥ 2 humans.
- **GIS after dismiss.** GIS One Tap `prompt()` is on an exponential cooldown
  after skip / dismiss / tap-outside, so a second `prompt()` is a no-op. The
  GIS facade gains `offerChooser()`: user-gesture Sign-In that still yields an
  ID token (GIS `renderButton` / account chooser — same `callback` JWT). Host
  `promptSignIn()` calls `offerChooser()`, not `prompt()`. Auto unsigned-invite
  / 401 still One Tap `prompt()`. Initialize One Tap with
  `cancel_on_tap_outside: false`. When One Tap reports not displayed, skipped,
  or dismissed, the GIS adapter still offers the chooser. Same public client;
  no Firebase; no client secret.

## Out of scope

- Speeding up invite create (provisioned concurrency). Spinner is the fix.
- Under-18 / Family Link (P20).
- Unfreezing the live-invite roster (P26).

## Scenario inventory

- Create in flight: pending, copy, Create not offered; one POST
- Create settles 2xx: not pending, invite URL present
- Create settles non-2xx: not pending, no URL
- Local → Online: seats 0 and 1 are Player
- Two Player chairs: Player → AI is not applied
- Three Player chairs: Player → AI is applied
- Local still allows one Player
- Sign-In click calls `offerChooser`
- One Tap skip/dismiss still offers the chooser
- Unsigned invite hash still One Tap `prompt()`
