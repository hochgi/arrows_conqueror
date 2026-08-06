/**
 * Viewport: pan + clamped zoom over lattice space.
 *
 * Layout returns lattice coordinates; this module alone maps them to the screen.
 */

export interface Viewport {
  /** Lattice-space centre under the screen centre. */
  readonly cx: number;
  readonly cy: number;
  /** Pixels per lattice unit. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

/** PoC clamps — retune freely; nothing in the rules reads these. */
export const ZOOM = {
  min: 24,
  max: 96,
  default: 48,
} as const;

export const clampZoom = (scale: number): number =>
  Math.min(ZOOM.max, Math.max(ZOOM.min, scale));

export const createViewport = (
  width: number,
  height: number,
  centre: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
  scale: number = ZOOM.default,
): Viewport => ({
  cx: centre.x,
  cy: centre.y,
  scale: clampZoom(scale),
  width,
  height,
});

/** Lattice → screen. */
export const toScreen = (
  viewport: Viewport,
  x: number,
  y: number,
): { x: number; y: number } => ({
  x: (x - viewport.cx) * viewport.scale + viewport.width / 2,
  y: (y - viewport.cy) * viewport.scale + viewport.height / 2,
});

/** Screen → lattice. */
export const toLattice = (
  viewport: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } => ({
  x: (sx - viewport.width / 2) / viewport.scale + viewport.cx,
  y: (sy - viewport.height / 2) / viewport.scale + viewport.cy,
});

export const panBy = (viewport: Viewport, dScreenX: number, dScreenY: number): Viewport => ({
  ...viewport,
  cx: viewport.cx - dScreenX / viewport.scale,
  cy: viewport.cy - dScreenY / viewport.scale,
});

export const zoomAt = (
  viewport: Viewport,
  screenX: number,
  screenY: number,
  factor: number,
): Viewport => {
  const before = toLattice(viewport, screenX, screenY);
  const nextScale = clampZoom(viewport.scale * factor);
  const next: Viewport = { ...viewport, scale: nextScale };
  const after = toLattice(next, screenX, screenY);
  return {
    ...next,
    cx: next.cx + (before.x - after.x),
    cy: next.cy + (before.y - after.y),
  };
};

export const resize = (viewport: Viewport, width: number, height: number): Viewport => ({
  ...viewport,
  width,
  height,
});

/** Half-diagonal of the screen in lattice units (plus slack for chevron extent). */
export const visibleLatticeRadius = (viewport: Viewport, slack = 2): number => {
  const halfW = viewport.width / (2 * viewport.scale);
  const halfH = viewport.height / (2 * viewport.scale);
  return Math.ceil(Math.hypot(halfW, halfH) + slack);
};
