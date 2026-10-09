import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    // Starting the in-memory MongoDB replica set (and downloading it the first time) is slow.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // Tests connect to mongodb-memory-server; this URI only satisfies the env schema.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/lms_unused_in_tests',
      JWT_SECRET: 'test-only-jwt-secret-not-used-anywhere-else',
      CORS_ORIGINS: 'http://localhost:3000',
      TRUST_PROXY_HOPS: '1',
      LOG_LEVEL: 'silent',
    },
  },
});
