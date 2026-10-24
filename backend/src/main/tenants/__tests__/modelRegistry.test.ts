import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { isTenantScoped } from "../plugins/tenantScope";

/**
 * The models that are NOT one school's own records: the platform's people and schools, and the tokens
 * that belong to a person. Everything else must apply the tenantScope plugin.
 *
 * Adding a name here is a decision, and a reviewer should see it: say why in the value. A model that
 * holds a school's data (students, fees, staff, notices, ...) never belongs on this list.
 */
const PLATFORM_MODELS: Record<string, string> = {
  User: "the login account; tenantId is null for the platform's super admin, and an email is unique across schools",
  Tenant: "is the school itself",
  AuthToken: "invite and reset tokens, found by the token and tied to a user",
  RefreshToken: "a user's session, found by the token and tied to a user",
};

/**
 * The school-owned models that do NOT belong to an academic year: a school's lasting layout and people, which stay the same when a
 * new session starts. Every other school-owned model (a student's enrolment, attendance, exam results, fees, a teacher's assignment
 * for a session, a section) is a record of ONE session and must carry `academicYearId`, or a new session would overwrite last year's.
 *
 * Adding a name here is a decision, and a reviewer should see it: say why in the value. A record that is about a session (anything
 * with "this year" in its description) never belongs on this list.
 */
const YEAR_FREE_MODELS: Record<string, string> = {
  AcademicYear: "is the session itself",
  Department: "a label of the school's layout; the same every year",
  SchoolClass: "Class 5 exists every year; only its sections and the students in them change",
  Student: "the person (name, birthday, admission number, guardians) is the same every year; their class in a year is an Enrolment",
  Guardian: "a parent or guardian is the same person every year, linked to their children (and later their login by mobile)",
  StudentSettings: "how a school keeps its students' records (which details it needs, its export's columns) does not change with the session",
};

const modulesDir = resolve(__dirname, "../..");

/** Every file src/main/<module>/models/*.ts, so a model that nothing has imported yet is still checked. */
function modelFiles(): string[] {
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((dir) => {
      const modelsDir = join(modulesDir, dir.name, "models");
      try {
        return readdirSync(modelsDir)
          .filter((file) => file.endsWith(".ts"))
          .map((file) => join(modelsDir, file));
      } catch {
        return []; // this module has no models
      }
    });
}

async function loadAllModels(): Promise<string[]> {
  await Promise.all(modelFiles().map((file) => import(pathToFileURL(file).href)));
  return mongoose.modelNames();
}

describe("every model says whose data it holds", () => {
  it("finds the models it is meant to check", async () => {
    const names = await loadAllModels();
    expect(names).toEqual(expect.arrayContaining([...Object.keys(PLATFORM_MODELS), "Department", "SchoolClass", "Section"]));
  });

  it("applies tenantScope to every model that is not on the platform list", async () => {
    const problems: string[] = [];
    for (const name of await loadAllModels()) {
      if (name in PLATFORM_MODELS) continue;
      const schema = mongoose.model(name).schema;
      if (!isTenantScoped(schema) || !schema.path("tenantId")?.isRequired) {
        problems.push(
          `${name}: add schema.plugin(tenantScope) (src/main/tenants/plugins/tenantScope.ts). ` +
            `Only if it is not one school's data, list it in PLATFORM_MODELS with the reason.`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("makes every school-owned model say whether it belongs to an academic year", async () => {
    const problems: string[] = [];
    for (const name of await loadAllModels()) {
      if (name in PLATFORM_MODELS || name in YEAR_FREE_MODELS) continue;
      if (!mongoose.model(name).schema.path("academicYearId")) {
        problems.push(
          `${name}: it is a school's record but has no academicYearId. If it is about one session (enrolment, attendance, marks, fees, ` +
            `a teacher's assignment...) add academicYearId (ref "AcademicYear", required for new records). Only if it is the school's lasting ` +
            `layout or people, list it in YEAR_FREE_MODELS with the reason.`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps the year-free list honest: every name on it exists, and none carries an academicYearId", async () => {
    const names = await loadAllModels();
    for (const name of Object.keys(YEAR_FREE_MODELS)) {
      expect(names, `${name} is on YEAR_FREE_MODELS but no such model exists any more`).toContain(name);
      expect(mongoose.model(name).schema.path("academicYearId"), `${name} has an academicYearId, so it should not be on YEAR_FREE_MODELS`).toBeUndefined();
    }
    expect(names).toContain("Section");
    expect(mongoose.model("Section").schema.path("academicYearId")).toBeDefined();
  });

  it("makes a student's yearly place and the admission counter belong to one academic year, required", async () => {
    const names = await loadAllModels();
    for (const name of ["Enrolment", "AdmissionCounter"]) {
      expect(names).toContain(name);
      expect(mongoose.model(name).schema.path("academicYearId")?.isRequired, `${name}.academicYearId must be required`).toBe(true);
    }
  });

  it("keeps the platform list honest: every name on it exists, and none is scoped to a school", async () => {
    const names = await loadAllModels();
    for (const name of Object.keys(PLATFORM_MODELS)) {
      expect(names, `${name} is on PLATFORM_MODELS but no such model exists any more`).toContain(name);
      expect(isTenantScoped(mongoose.model(name).schema), `${name} applies tenantScope, so it should not be on PLATFORM_MODELS`).toBe(false);
    }
  });
});
