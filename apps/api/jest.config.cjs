// Jest config for @aicos/api.
//
// Authored as CommonJS (.cjs) rather than .ts on purpose: a `jest.config.ts`
// would require `ts-node` to parse, which is intentionally NOT in this app's
// dependency set. The active transform is @swc/jest, which preserves NestJS
// decorator metadata (`emitDecoratorMetadata` -> `design:*` reflect-metadata)
// that the DI container and guards rely on at test time.
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
          parser: {
            syntax: 'typescript',
            decorators: true,
            dynamicImport: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
          baseUrl: '.',
          paths: {
            '@/*': ['*'],
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
