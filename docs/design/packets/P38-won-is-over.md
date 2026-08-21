# P38 — a won match is over

**Scope:** rules + adapter. **Resolves SPEC §11 item 46.** Depends on P37, P29, P32.

## The decision

The human, asked whether `legalMoves` and `apply` must refuse once `winner` is
set:

> what's the point to continue a game once it been won? Lets keep it simple.
> winning move only invoke "effects" (evaporation, vanishing, closures, …), and
> once all regular animations finish the celebration effect begins.

Two things, and they are not the same thing:

1. **A won state is terminal.** No further move. Not "only the pass" — nothing.
2. **The winning move is not truncated.** It resolves every effect it causes —
   closure, fill, conversion, cut evaporation, the loser vanishing — and *then*
   the match is over. The celebration begins when those effects have finished
   playing, not when the state changes.

## Why item 46 existed at all

P37 moved loss resolution to the tail of `apply`, so a match now ends on the move
that decides it. That exposed a window nothing had needed to think about: at the
moment `winner` is set, the winning seat is still mid-turn with allowance left.
`legalMoves` never consulted `winner`, so it kept offering steps.

Measured on the reported playtest log (`playtest-2026-08-20-D-wins.json`,
1247 moves):

| move | what | today |
|---|---|---|
| 1242 | D's step takes E's last territory | `winner = D`, `activePlayer` still D |
| 1243 | `endTurn` | **accepted** — a move in a finished match |
| 1244 | E steps a head E no longer has | refused, but for the wrong reason |

Move 1243 is the whole packet in one line. The fold stops at 1244 today only
because a dead seat happens to move there; nothing was stopping 1243, and nothing
would have stopped D taking three more steps instead.

Under P38 the record refuses at **1243**, and the reason is the right one.

## The adapter half is not cosmetic

`App.tsx` derives the celebration from state alone:

```ts
const victory = useMemo(
  () => (state === undefined ? { kind: 'playing' } : victoryFx(state, geometry)),
  [state],
);
```

So the celebration paints on the same frame the winning move commits, while that
move's own overlays are still queued and animating. The winning move is the most
spectacular move in the game — a closure that fills ground, converts a stack, and
vanishes a seat — and the *dim-everything-but-the-winner* treatment currently
lands on top of it rather than after it. The player sees the win announced and
misses the thing that won it.

This is a sequencing bug, not a taste call, and the human named it directly.

## Out of scope

- §11 item 45 (whether a vanishing seat's trail *evaporates* rather than clearing
  silently, and the flicker-then-fade the human asked for). **Resolved by P39.**
  P38 sequences whatever effects exist; P39 adds the vanish overlay.
- Retuning any `FX_MS` value or `MAJOR_SEQUENCE_MS`. Phase 2 measured that
  `timing.ts`'s claim *"the biggest sequence in the game … fits inside
  `MAJOR_SEQUENCE_MS`"* is false — `captureFresh` alone settles at 1200 ms against
  a stated 700. The numbers stay; the comment is corrected, and the celebration's
  ceiling is taken from the queue rather than from that constant.
- The celebration's *content* — P29 owns dim / shine / pulse / banner. P38 owns
  only *when it starts*.
- Whether a finished match can be replayed or restarted from the UI (P20+).
