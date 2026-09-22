import { createServer } from "http";
import mongoose from "mongoose";
import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { initSocket } from "./realtime/socket";
import { logger, reportError } from "./utils/logger";

async function main() {
  await connectDB();
  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(env.port, () => {
    logger.info(`School ERP API + realtime listening on http://localhost:${env.port}`, { env: env.nodeEnv });
  });

  async function shutdown(signal: string) {
    logger.info("Shutting down", { signal });
    httpServer.close(() => logger.info("HTTP server closed"));
    await mongoose.disconnect();
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// A crash here means the process is in an unknown state — log it clearly
// and exit so the process manager (pm2/systemd/k8s) restarts a clean one,
// rather than silently continuing with corrupted state.
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
