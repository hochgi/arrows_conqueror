import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // The core is pure (ADR 0001). Nothing here needs a DOM, a clock, or a
    // network — if a test ever does, that is a boundary violation, not a
    // missing config option.
    environment: 'node',
    globals: false,
  },
});
