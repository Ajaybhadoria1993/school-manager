import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ["./tests/setup.ts"],
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017/school_erp_test",
      JWT_SECRET: "test-only-secret-not-for-production-use",
      CLIENT_URL: "http://localhost:3000",
    },
    // Runs suites one at a time — several tests clear shared collections
    // between cases, so parallel files would stomp on each other's data.
    fileParallelism: false,
  },
});
