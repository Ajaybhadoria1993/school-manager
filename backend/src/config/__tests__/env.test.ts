import { describe, it, expect, vi, afterEach } from "vitest";

// Keep the developer's real backend/.env out of these checks.
vi.mock("dotenv", () => ({ default: { config: () => ({}) } }));

const STRONG_ACCESS = "a".repeat(64);
const STRONG_REFRESH = "b".repeat(64);

/** Loads config/env.ts afresh with exactly these variables (undefined removes one). */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value);
  return (await import("../env.js")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("NODE_ENV", () => {
  it("lets development and test use the placeholder secrets", async () => {
    for (const nodeEnv of ["development", "test"]) {
      const env = await loadEnv({ NODE_ENV: nodeEnv, JWT_SECRET: undefined, REFRESH_TOKEN_SECRET: undefined });
      expect(env.isProduction).toBe(false);
    }
  });

  it("treats an unset or unknown NODE_ENV as production, which refuses the placeholder secrets", async () => {
    for (const nodeEnv of [undefined, "", "staging", "prod"]) {
      await expect(
        loadEnv({ NODE_ENV: nodeEnv, JWT_SECRET: undefined, REFRESH_TOKEN_SECRET: undefined })
      ).rejects.toThrow(/must be set to strong, unique values/);
    }
  });

  it("starts as production when NODE_ENV is missing but real secrets are set", async () => {
    const env = await loadEnv({ NODE_ENV: undefined, JWT_SECRET: STRONG_ACCESS, REFRESH_TOKEN_SECRET: STRONG_REFRESH });
    expect(env.isProduction).toBe(true);
  });

  it("refuses one secret used for both tokens in production", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", JWT_SECRET: STRONG_ACCESS, REFRESH_TOKEN_SECRET: STRONG_ACCESS })
    ).rejects.toThrow(/must be different/);
  });
});

describe("MONGO_DNS_SERVERS", () => {
  it("is empty unless set, and reads a comma separated list", async () => {
    expect((await loadEnv({ MONGO_DNS_SERVERS: undefined })).mongoDnsServers).toEqual([]);
    expect((await loadEnv({ MONGO_DNS_SERVERS: "8.8.8.8, 1.1.1.1," })).mongoDnsServers).toEqual(["8.8.8.8", "1.1.1.1"]);
  });
});
