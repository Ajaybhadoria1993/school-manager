import { createServer } from "http";
import mongoose from "mongoose";
import app from "./app";
import { env, isEmailConfigured } from "./config/env";
import { connectDB } from "./config/db";
import { getDummyHash } from "./utils/authUtils";
import { PasswordService } from "./main/auth/services/password.service";
import { logger, reportError } from "./utils/logger";

async function main() {
  await connectDB();
  // Make sure unique/TTL indexes exist before taking traffic.
  await mongoose.connection.syncIndexes();
  // Pay the one-off cost of the stand-in password hash now, so the first sign-in with an unknown email
  // is not slower than the rest (which would give it away).
  await getDummyHash();

  const httpServer = createServer(app);
  httpServer.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}`, { env: env.nodeEnv });
    if (!isEmailConfigured) {
      logger.warn("Email is not configured: emails are only logged, not sent (set BREVO_API_KEY or SMTP_* in backend/.env).");
    }
  });

  async function shutdown(signal: string) {
    logger.info("Shutting down", { signal });
    httpServer.close();
    await PasswordService.idle(); // reset emails still being prepared after their response was sent
    await mongoose.disconnect();
    process.exit(0);
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

// An unhandled failure leaves the process in an unknown state: log it and exit so the
// process manager restarts a clean one.
process.on("unhandledRejection", (reason) => {
  reportError(reason, { source: "unhandledRejection" });
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  reportError(err, { source: "uncaughtException" });
  process.exit(1);
});

main().catch((err) => {
  reportError(err, { source: "startup" });
  process.exit(1);
});
