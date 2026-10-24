import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { env } from "../config/env";
import { User } from "../main/users/models/User";
import { AuthToken } from "../main/auth/models/AuthToken";
import { RefreshToken } from "../main/auth/models/RefreshToken";
import { Tenant } from "../main/tenants/models/Tenant";
import { AcademicYear } from "../main/academics/models/AcademicYear";
import { Department } from "../main/academics/models/Department";
import { SchoolClass } from "../main/academics/models/SchoolClass";
import { Section } from "../main/academics/models/Section";
import { AdmissionCounter } from "../main/students/models/AdmissionCounter";
import { Enrolment } from "../main/students/models/Enrolment";
import { Guardian } from "../main/students/models/Guardian";
import { Student } from "../main/students/models/Student";

beforeAll(async () => {
  // Safety net: this setup wipes and drops the database, so it must only ever be a local test database.
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.mongodbUri) || !env.mongodbUri.includes("_test")) {
    throw new Error(`Refusing to run tests against ${env.mongodbUri.replace(/\/\/.*@/, "//<creds>@")}`);
  }
  await mongoose.connect(env.mongodbUri);
  // Unique and TTL indexes are part of the behaviour under test.
  await Promise.all([
    User.syncIndexes(),
    AuthToken.syncIndexes(),
    RefreshToken.syncIndexes(),
    Tenant.syncIndexes(),
    Department.syncIndexes(),
    SchoolClass.syncIndexes(),
    Section.syncIndexes(),
    AcademicYear.syncIndexes(),
    Student.syncIndexes(),
    Guardian.syncIndexes(),
    Enrolment.syncIndexes(),
    AdmissionCounter.syncIndexes(),
  ]);
});

afterEach(async () => {
  // Isolate cases from each other: wipe every collection's documents (indexes stay).
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
