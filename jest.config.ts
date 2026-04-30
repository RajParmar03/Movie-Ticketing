import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true } }],
  },
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    'src/utils/**/*.ts',
    'src/middleware/**/*.ts',
    '!src/**/*.types.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: { lines: 70 },
  },
  coverageDirectory: 'coverage',
  setupFilesAfterFramework: [],
  testTimeout: 30000,
  verbose: true,
};

export default config;
