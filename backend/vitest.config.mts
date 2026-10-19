import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      NODE_ENV: "test",
      // Always the LOCAL docker mongo (docker compose up -d), never a cloud database:
      // the test setup drops this database when it finishes.
      MONGODB_URI: "mongodb://127.0.0.1:27017/school_erp_test",
      JWT_SECRET: "test-only-access-secret-not-for-production-use",
      REFRESH_TOKEN_SECRET: "test-only-refresh-secret-not-for-production-use",
      CLIENT_URL: "http://localhost:3000",
      SUPER_ADMIN_NAME: "Super Admin",
      SUPER_ADMIN_EMAIL: "superadmin@example.com",
      SUPER_ADMIN_PASSWORD: "Admin@123",
      // Rate limiters are skipped in tests unless a test flips DISABLE_RATE_LIMIT to "0".
      DISABLE_RATE_LIMIT: "1",
      LOGIN_RATE_LIMIT_MAX: "5",
      SMTP_HOST: "",
    },
    // Several suites wipe shared collections between cases, so files must not run in parallel.
    fileParallelism: false,
  },
});
