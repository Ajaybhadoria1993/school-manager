import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { env } from "../config/env";
import { User } from "../main/users/models/User";
import { AuthToken } from "../main/auth/models/AuthToken";
import { RefreshToken } from "../main/auth/models/RefreshToken";
import { Tenant } from "../main/tenants/models/Tenant";

beforeAll(async () => {
  // Safety net: this setup wipes and drops the database, so it must only ever be a local test database.
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.mongodbUri) || !env.mongodbUri.includes("_test")) {
    throw new Error(`Refusing to run tests against ${env.mongodbUri.replace(/\/\/.*@/, "//<creds>@")}`);
  }
  await mongoose.connect(env.mongodbUri);
  // Unique and TTL indexes are part of the behaviour under test.
  await Promise.all([User.syncIndexes(), AuthToken.syncIndexes(), RefreshToken.syncIndexes(), Tenant.syncIndexes()]);
});

afterEach(async () => {
  // Isolate cases from each other: wipe every collection's documents (indexes stay).
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
