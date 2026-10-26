import { defineConfig } from 'vitest/config';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://concierge:concierge_secret@localhost:5432/concierge_iq_test';

export default defineConfig({
  // Use the workspace packages' TypeScript source, as `pnpm dev` does, instead of their build.
  resolve: { conditions: ['development'] },
  ssr: { resolve: { conditions: ['development'] } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      GUEST_APP_URL: 'https://guest.test',
    },
  },
});
