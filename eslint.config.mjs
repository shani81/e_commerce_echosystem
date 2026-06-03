// Flat ESLint config shared across the monorepo (ESLint 9).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/.turbo/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // NOTE: `consistent-type-imports` is intentionally NOT enabled — its autofix
      // rewrites NestJS constructor-injected providers / DTOs to `import type`,
      // which erases the decorator metadata Nest DI + ValidationPipe rely on.
    },
  },
);
