import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, WheelEvent } from 'react';
import { makeLayout, makeMatch, makeTiling } from '@arrows/geometry-tiling';
import type { GameState } from '@arrows/contracts';
import { makeRules } from '@arrows/rules-core';
import { Board } from './Board';
import { cullArrows, cullVertices } from './cull';
import { hitArrow } from './hit';
import { Hud } from './Hud';
import type { InputMode, InputSnapshot } from './input/modes';
import { createInputMode } from './input/modes';
import type { Viewport } from './viewport';
import { createViewport, panBy, resize, zoomAt } from './viewport';

const geometry = makeTiling();
const layout = makeLayout();
const rules = makeRules(geometry);

const startMatch = (): GameState => makeMatch();

const applyPending = (state: GameState, snap: InputSnapshot): GameState => {
  if (snap.pending === undefined || state.winner !== undefined) return state;
  try {
    return rules.apply(state, snap.pending);
  } catch {
    return state;
  }
};

const idleSnap = (): InputSnapshot => ({
  phase: { kind: 'idle' },
  highlights: { targets: new Set() },
});

export const App = (): ReactElement => {
  const [state, setState] = useState<GameState>(startMatch);
  const [mode, setMode] = useState<InputMode>(() => createInputMode('galcon'));
  const [snap, setSnap] = useState<InputSnapshot>(idleSnap);
  const [viewport, setViewport] = useState<Viewport>(() => createViewport(800, 600));
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shellRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setViewport((v) => resize(v, Math.max(320, width), Math.max(240, height)));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const arrows = useMemo(() => cullArrows(geometry, viewport), [viewport]);
  const vertices = useMemo(() => cullVertices(geometry, viewport), [viewport]);

  const commitSnap = useCallback((next: InputSnapshot) => {
    setSnap(next);
    if (next.pending !== undefined) {
      setState((s) => applyPending(s, next));
      setSnap(mode.reset());
    }
  }, [mode]);

  const switchMode = (id: string): void => {
    const next = createInputMode(id);
    setMode(next);
    setSnap(next.reset());
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag.current === null) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
    if (!drag.current.moved) return;
    setViewport((v) => panBy(v, dx, dy));
    drag.current = { x: e.clientX, y: e.clientY, moved: true };
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>): void => {
    const wasDrag = drag.current?.moved === true;
    drag.current = null;
    if (wasDrag || state.winner !== undefined) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const arrow = hitArrow(layout, viewport, sx, sy, arrows);
    if (arrow === undefined) {
      commitSnap(mode.onBackgroundClick());
      return;
    }
    commitSnap(mode.onArrowClick(arrow, state, rules));
  };

  const onWheel = (e: WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setViewport((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
  };

  return (
    <div className="app">
      <Hud
        state={state}
        mode={mode}
        phase={snap.phase}
        onModeChange={switchMode}
        onEndTurn={() => {
          commitSnap(mode.requestEndTurn());
        }}
        onSkip={() => {
          commitSnap(mode.requestSkip(state, rules));
        }}
        onPortion={(n) => {
          commitSnap(mode.choosePortion(n));
        }}
        onNewMatch={() => {
          setState(startMatch());
          setSnap(mode.reset());
        }}
      />
      <div className="stage" ref={shellRef}>
        <Board
          geometry={geometry}
          layout={layout}
          state={state}
          viewport={viewport}
          arrows={arrows}
          vertices={vertices}
          highlights={snap.highlights}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        />
      </div>
    </div>
  );
};
