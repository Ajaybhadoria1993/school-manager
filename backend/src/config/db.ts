import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";

// Some Windows machines hand Node's resolver a link-local IPv6 DNS server
// that can't resolve the SRV records `mongodb+srv://` URIs depend on, even
// though the OS's own resolver (nslookup) works fine. Pointing Node at a
// public DNS server sidesteps that without touching OS-level DNS settings.
if (env.mongodbUri.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

export async function connectDB(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log(`[db] connected -> ${mongoose.connection.name}`);
}
