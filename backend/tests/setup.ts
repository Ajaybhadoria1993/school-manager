import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { env } from "../src/config/env";

beforeAll(async () => {
  await mongoose.connect(env.mongodbUri);
});

afterEach(async () => {
  // Isolate test cases from each other without paying for a fresh
  // connection/db per test — wipe every collection's documents.
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
