import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Pure packages stay on node. The web adapter's unit tests are also pure
    // (viewport / cull / input machines) — React stays out of vitest.
    environment: 'node',
    globals: false,
  },
});
