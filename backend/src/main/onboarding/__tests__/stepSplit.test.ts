import { describe, expect, it } from "vitest";
import { plannedClasses } from "../../academics/constants";
import { step1Schema, step2Schema } from "../schemas/onboarding.schemas";

/**
 * The form's first two steps: step 1 is the school and where it is (its name, type, size, numbers, address and contact), step 2 is the
 * academic year and what the school runs in it (its boards, mediums, classes and timing).
 */

const school = {
  schoolName: "Sunrise Public School",
  schoolType: "Private",
  approxStudents: 850,
  udiseCode: "27210100101",
  establishedYear: 1998,
};
const address = {
  addressLine1: "12 MG Road",
  addressLine2: "Near City Mall",
  city: "Pune",
  state: "Maharashtra",
  division: "Pune",
  district: "Pune",
  pincode: "411001",
  schoolPhone: "2012345678",
  schoolEmail: "office@sunrise.example",
  website: "https://sunrise.example",
};
const plan = {
  medium: "English",
  lowestClass: "1",
  highestClass: "2",
  seniorStreams: [],
  classes: plannedClasses("1", "2").map((c) => ({ name: c.name, sections: 1, seats: 40 })),
  week: { days: [1, 2, 3, 4, 5], usual: [{ kind: "period", label: "", start: "08:00", end: "08:40" }], saturday: null },
};
const year = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };
const academic = { boards: [{ board: "CBSE", mediums: ["English"], plans: [plan] }], academicYear: year };

const problems = (schema: typeof step1Schema | typeof step2Schema, body: unknown): Record<string, string> => {
  const result = schema.safeParse(body);
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("step 1: the school and where it is", () => {
  it("takes the school and its address and contact together", () => {
    expect(problems(step1Schema, { ...school, ...address })).toEqual({});
  });

  it("does not ask for boards or the academic year", () => {
    const parsed = step1Schema.parse({ ...school, ...address });
    expect(parsed).not.toHaveProperty("boards");
    expect(parsed).not.toHaveProperty("academicYear");
  });

  it("says what is missing from the school and from the address, each under its own box", () => {
    const found = problems(step1Schema, { ...school, ...address, schoolName: "", schoolType: "Nope", city: "", pincode: "12", schoolEmail: "x" });
    expect(Object.keys(found).sort()).toEqual(["city", "pincode", "schoolEmail", "schoolName", "schoolType"]);
  });

  it("keeps the optional boxes optional: UDISE+ code, year established, area, division, website", () => {
    const bare = { ...school, ...address, udiseCode: "", establishedYear: "", addressLine2: "", division: "", website: "" };
    expect(problems(step1Schema, bare)).toEqual({});
  });

  it("checks the number of students and the UDISE+ code", () => {
    expect(problems(step1Schema, { ...school, ...address, approxStudents: 0, udiseCode: "123" })).toEqual({
      approxStudents: "Enter the number of students",
      udiseCode: "UDISE+ code is 11 digits",
    });
  });
});

describe("step 2: the academic year and what runs in it", () => {
  it("takes the year and the boards together", () => {
    expect(problems(step2Schema, academic)).toEqual({});
  });

  it("does not ask for the school's name or address", () => {
    expect(problems(step2Schema, academic)).toEqual({});
    expect(step2Schema.parse(academic)).not.toHaveProperty("schoolName");
  });

  it("needs the year, with a message per box", () => {
    const { academicYear: _year, ...noYear } = academic;
    expect(Object.keys(problems(step2Schema, noYear))).toContain("academicYear");
    expect(Object.keys(problems(step2Schema, { ...academic, academicYear: { name: "", startDate: "", endDate: "" } })).length).toBeGreaterThan(0);
  });

  it("reads the month the session starts in, and the first and last class, from what was given", () => {
    const parsed = step2Schema.parse({ ...academic, academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" } });
    expect(parsed.sessionStartMonth).toBe(6);
    expect([parsed.lowestClass, parsed.highestClass]).toEqual(["1", "2"]);
  });

  it("needs at least one board", () => {
    expect(problems(step2Schema, { ...academic, boards: [] })).toEqual({ boards: "Add at least one board" });
  });
});
