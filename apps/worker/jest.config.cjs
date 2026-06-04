// Jest config for @aicos/worker (mirrors apps/api). CommonJS on purpose so no
// ts-node is needed; @swc/jest preserves NestJS decorator metadata.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2022',
          parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
      },
    ],
  },
  setupFiles: ['reflect-metadata'],
  testEnvironment: 'node',
};
