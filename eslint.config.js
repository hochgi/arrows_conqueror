import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The purity guard.
 *
 * ADR 0001 and AGENTS.md: no clocks, no randomness, no I/O anywhere in the
 * rules core. This is a product property, not a testing convenience — SPEC.md
 * contains no randomness by design, and the appeal of the multi-prong bonus and
 * the spawner rhythm is that an attentive player can compute them.
 *
 * This catches the loud violations. It does NOT catch the realistic ones —
 * iteration over an unordered collection feeding an ordered decision, or a
 * `sort` whose ties break on identity. Those pass every unit test and surface
 * only as replay drift, which is why P10 lands early.
 */
const impureGlobals = [
  { name: 'Date', message: 'The core is pure (ADR 0001). No clocks.' },
  { name: 'fetch', message: 'The core is pure (ADR 0001). No I/O.' },
  { name: 'crypto', message: 'The core is pure (ADR 0001). No randomness.' },
  { name: 'process', message: 'The core is pure (ADR 0001). No environment.' },
];

const impureProperties = [
  { object: 'Math', property: 'random', message: 'The core is pure (ADR 0001). No randomness.' },
  { object: 'Date', property: 'now', message: 'The core is pure (ADR 0001). No clocks.' },
  {
    object: 'performance',
    property: 'now',
    message: 'The core is pure (ADR 0001). No clocks.',
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root tooling config lives outside any package's tsconfig.
          allowDefaultProject: ['vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Phase-2 skeletons name their parameters so the signature documents
      // itself, then ignore them. `_`-prefixed is the marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The core and its contracts. Adapters (renderer, input) are exempt — they
    // are where the impure world is supposed to live.
    files: ['packages/contracts/**/*.ts', 'packages/rules-core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...impureGlobals],
      'no-restricted-properties': ['error', ...impureProperties],
    },
  },
  {
    // Root tooling config. Type-aware linting buys nothing here and these files
    // sit outside every package's tsconfig by design.
    files: ['**/*.js', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
