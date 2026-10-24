import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

const DEV_ONLY_ACCESS_SECRET = "dev-only-insecure-access-secret-change-me";
const DEV_ONLY_REFRESH_SECRET = "dev-only-insecure-refresh-secret-change-me";

// Fail closed: only an explicit "development" or "test" relaxes anything. A server that forgot to set
// NODE_ENV (or mistyped it) is treated as production, so it can never run on the placeholder secrets.
const nodeEnv = process.env.NODE_ENV ?? "production";
const isProduction = nodeEnv !== "development" && nodeEnv !== "test";

export const env = {
  port: positiveInt("PORT", 5000),
  nodeEnv,
  isProduction,
  appName: process.env.APP_NAME ?? "EduShiksha",
  // First entry is the public URL of the web app, used to build links in emails (the React app: 5173 in development).
  clientUrls: (process.env.CLIENT_URL ?? "http://localhost:5173")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  mongodbUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/school_erp"),
  // Optional, for `mongodb+srv://` only: DNS servers Node should use to resolve the SRV records.
  mongoDnsServers: (process.env.MONGO_DNS_SERVERS ?? "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean),

  jwtSecret: required("JWT_SECRET", DEV_ONLY_ACCESS_SECRET),
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN ?? "15m",
  refreshTokenSecret: required("REFRESH_TOKEN_SECRET", DEV_ONLY_REFRESH_SECRET),
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? "30d",
  // An already-rotated refresh token presented again within this window is a double tab or a retry
  // after a lost response, not theft: it gets the same new token back instead of ending the session.
  refreshReuseGraceSeconds: positiveInt("REFRESH_REUSE_GRACE_SECONDS", 20),
  passwordResetTtlMinutes: positiveInt("PASSWORD_RESET_TTL_MINUTES", 15),
  inviteTokenTtlHours: positiveInt("INVITE_TOKEN_TTL_HOURS", 72),
  signupTokenTtlHours: positiveInt("SIGNUP_TOKEN_TTL_HOURS", 24),

  loginRateLimitMax: positiveInt("LOGIN_RATE_LIMIT_MAX", 20),

  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: positiveInt("SMTP_PORT", 465),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "",
  },
};

export const isSmtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);

// Refuse to boot in production with the placeholder secrets: a public default
// would let anyone forge a valid session token.
if (env.isProduction) {
  if (env.jwtSecret === DEV_ONLY_ACCESS_SECRET || env.refreshTokenSecret === DEV_ONLY_REFRESH_SECRET) {
    throw new Error(
      `JWT_SECRET and REFRESH_TOKEN_SECRET must be set to strong, unique values (NODE_ENV is "${nodeEnv}", which is treated as production; use NODE_ENV=development for local work).`
    );
  }
  if (env.jwtSecret === env.refreshTokenSecret) {
    throw new Error("JWT_SECRET and REFRESH_TOKEN_SECRET must be different.");
  }
}

/** Super admin credentials come from the environment and are only read by the seed script. */
export function getSuperAdminEnv() {
  return {
    name: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
    email: required("SUPER_ADMIN_EMAIL").trim().toLowerCase(),
    password: required("SUPER_ADMIN_PASSWORD"),
  };
}
