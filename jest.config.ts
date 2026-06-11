import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/e2e/'],
  // angular-calendar and friends publish untranspiled ESM; let the preset
  // transform them instead of ignoring them like the rest of node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|angular-calendar|calendar-utils|date-fns|angular-draggable-droppable|angular-resizable-element))',
  ],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    // Pure declarations / wiring with no logic to unit test.
    '!src/app/**/*.routes.ts',
    '!src/app/**/*.config.ts',
    '!src/app/models/**',
    '!src/app/enums/**',
    '!src/app/interfaces/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};

export default config;
