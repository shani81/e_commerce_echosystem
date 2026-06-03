// ESLint config for @aicos/api (NestJS).
//
// Extends the shared monorepo config but DISABLES `consistent-type-imports`:
// NestJS relies on `emitDecoratorMetadata`, so constructor-injected providers,
// `@Body()`/`@Query()` DTOs, and base classes MUST be imported as runtime
// values. Rewriting them to `import type` (which the rule's autofix does) erases
// the metadata and breaks dependency injection / validation at runtime.
import rootConfig from '../../eslint.config.mjs';

export default [
  ...rootConfig,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
