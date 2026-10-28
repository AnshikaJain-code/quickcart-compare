import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/tests/globalSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-chars-long',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/quickcart-compare-test',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
