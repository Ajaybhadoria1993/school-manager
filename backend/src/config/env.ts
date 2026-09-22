import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DEV_ONLY_JWT_SECRET = "dev-only-insecure-secret-change-me";

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:3000",
  mongodbUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/school_erp"),
  jwtSecret: required("JWT_SECRET", DEV_ONLY_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  },
  isRazorpayConfigured: Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ),
};

// Refuse to boot in production with the placeholder secret — a leaked
// public default would let anyone forge a valid session token.
if (env.nodeEnv === "production" && env.jwtSecret === DEV_ONLY_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set to a strong, unique value in production (see backend/.env.example).");
}
