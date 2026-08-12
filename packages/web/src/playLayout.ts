/**
 * Shared tiling layout for playtest AI (heuristic + BYOK).
 * Intercept findings need Euclidean positions (P23 D14).
 */
import { makeLayout } from '@arrows/geometry-tiling';
import type { FindingsLayout } from './findings';

export const playLayout: FindingsLayout = makeLayout();
