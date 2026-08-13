# P11 — Renderer & hot-seat input

> The only shipping adapter. Draws the unbounded board, accepts moves, alternates
> two players on one machine.

**Depends on:** P03, P09. **SPEC:** §1 (hot-seat), §5 (reading the board), §4
(Galcon-like interaction).

## In scope

- Web app (`packages/web`) — Vite + React, SVG board.
- Pan + limited zoom; cull via `GeometryPort.window` around the viewport centre.
- Trail at **50% opacity**, territory **full colour** (§5).
- Pluggable input modes (swap without touching the board): **Galcon**
  (source → dest → slider popup) and **HoMM-style** (source → dest preview →
  second click → slider). Easy to replace later.
- Hot-seat loop over `makeMatch` + `makeRules` + `legalMoves` / `apply`.

## Out of scope

- AI (P12 / post-MVP).
- Persistence / netcode.
- Multi-step pathfinding beyond one `step` (preview highlights one legal exit).

## Decisions (human, 2026-08-06)

| # | Choice |
|---|---|
| D1 | Player pans; zoom clamped so the board is neither a sea of dots nor one tile |
| D2 | Web (SVG) |
| D3 | Galcon default; HoMM double-confirm available; input behind a mode interface |
| D4 | Trail 50% opacity; territory solid fill |

## Layout boundary

Layout stays in `@conquarrow/geometry-tiling` (lattice space). This package owns
viewport, hit-testing, and style — never the reverse.
