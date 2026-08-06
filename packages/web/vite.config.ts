import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: { port: 5173 },
  resolve: {
    // Workspace packages export .ts sources; Vite handles them directly.
    dedupe: ['react', 'react-dom'],
  },
});
