import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests (the pure helpers in src/utils) and component tests (a component with its helpers, in a browser-like DOM).
// No server and no network: a test that needs the API belongs to the backend's own tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // The app's CSS is not needed to test what a component does.
    css: false,
    restoreMocks: true,
    // A page test types and clicks through HeroUI in a simulated browser: slow when several files run at once.
    testTimeout: 15000,
    // A whole address for the API (no dev server to forward "/api" here); the page tests answer every request themselves.
    env: { VITE_API_BASE_URL: "http://localhost/api/v1" },
  },
});
