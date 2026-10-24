import request from "supertest";
import app from "../app";
import { STUDENT_FORM_FIELDS, type FieldRules } from "../main/students/constants";
import { StudentSettings } from "../main/students/models/StudentSettings";
import { createTenant } from "../main/tenants/services/tenantFactory";
import { User, type UserRole } from "../main/users/models/User";
import { hashPassword } from "../utils/authUtils";

export const PASSWORD = "Sch00l@Admin";

// bcrypt is slow on purpose, so the same password is hashed once for the whole test file.
const passwordHash = hashPassword(PASSWORD);

/** A school as the tests see it: its id and the access token of someone who works there. */
export interface SchoolSession {
  tenantId: string;
  token: string;
}

async function signIn(email: string): Promise<string> {
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return login.body.data.accessToken as string;
}

/**
 * What the admission form of a test school needs: the address, as the software asked before each school could choose; every other
 * detail optional. The tests of the students module are about its rules, not about a school's choices, so they start from this;
 * `studentFields: "default"` gives a school the defaults a new school really gets (Manage school > Students > Fields).
 */
export const CLASSIC_STUDENT_FIELDS = Object.fromEntries(
  STUDENT_FORM_FIELDS.map((f) => [f.key, ["addressLine1", "addressCity", "addressState", "addressPincode"].includes(f.key) ? "required" : "optional"])
) as FieldRules;

/** An approved school with one person of the given role, signed in. */
export async function createSchool(name: string, role: UserRole = "school_admin", studentFields: "classic" | "default" = "classic"): Promise<SchoolSession> {
  const slug = name.toLowerCase().replace(/\W+/g, "");
  const tenant = await createTenant({ name, contactEmail: `admin@${slug}.example`, approvalStatus: "approved", source: "invite" });
  const email = `${role}@${slug}.example`;
  await User.create({ name: "Asha Verma", email, passwordHash: await passwordHash, role, tenantId: tenant._id });
  if (studentFields === "classic") {
    await StudentSettings.create({ tenantId: tenant._id, fields: STUDENT_FORM_FIELDS.map((f) => ({ key: f.key, mode: CLASSIC_STUDENT_FIELDS[f.key] })) });
  }
  return { tenantId: tenant._id.toString(), token: await signIn(email) };
}

/** The same school's other staff member (a teacher, say), signed in. */
export async function addColleague(tenantId: string, role: UserRole): Promise<string> {
  const email = `${role}.${tenantId}@school.example`;
  await User.create({ name: "Colleague", email, passwordHash: await passwordHash, role, tenantId });
  return signIn(email);
}
