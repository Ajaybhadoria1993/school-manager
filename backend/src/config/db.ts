import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

// Some Windows machines hand Node's resolver a link-local IPv6 DNS server that can't resolve the
// SRV records `mongodb+srv://` URIs depend on, even though the OS's own resolver works fine.
// Opt-in (MONGO_DNS_SERVERS in .env) so a production host keeps its own DNS untouched.
if (env.mongoDnsServers.length > 0 && env.mongodbUri.startsWith("mongodb+srv://")) {
  dns.setServers(env.mongoDnsServers);
}

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 8000 });
  logger.info(`[db] connected -> ${mongoose.connection.name}`);
}
