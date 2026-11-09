import baseConfig from './jest.config';

/**
 * Integration suite: the full AppModule over HTTP against a real PostgreSQL (see
 * test/integration/global-setup.mjs). Only Clerk and Ollama are faked. Files run in band because
 * they share one database and truncate it between tests.
 */
export default {
    ...baseConfig,
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testRegex: '.*\\.int-spec\\.ts$',
    globalSetup: '<rootDir>/test/integration/global-setup.mjs',
    globalTeardown: '<rootDir>/test/integration/global-teardown.mjs',
    maxWorkers: 1,
    testTimeout: 30_000,
};
