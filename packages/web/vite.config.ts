import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * GitHub Pages serves this package at `/arrows_conqueror/` under
 * `games.hochgi.com` (same pattern as `ninja_grip`). Use `--mode pages` for that
 * deploy; local `vite` / default `vite build` keep `/`.
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/arrows_conqueror/' : '/',
  plugins: [react()],
  root: '.',
  server: { port: 5173 },
  resolve: {
    // Workspace packages export .ts sources; Vite handles them directly.
    dedupe: ['react', 'react-dom'],
  },
}));
