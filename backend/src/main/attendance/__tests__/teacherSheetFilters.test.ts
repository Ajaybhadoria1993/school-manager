import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";

/**
 * Attendance > Teacher for the school, with a class and a search (2026-11-22, asked for: "search bar lagao aur filter bhi, jisse all teacher dekh
 * paye, ya class dalu to usi class ke teacher show ho"). `GET /attendance/teachers?from&to&classId&search`: a class keeps the teachers of that class
 * this year (its class teachers and the teachers of its subjects, any section); a search keeps the teachers whose name, code or post holds the words.
 * The counts on top are of the class picked (or the school), never of the search. classroomSchool: Meena is the class teacher of Class 5 - A and
 * teaches its Maths, Dev teaches its English, Kiran teaches nothing; Class 1 has nobody.
 */

const api = "/api/v1/attendance/teachers";
const THU = "2026-11-05";
const sheet = (token: string, query: Record<string, string> = {}) => request(app).get(api).query({ from: THU, to: THU, ...query }).set(auth(token));
const names = (res: request.Response) => (res.body.data.teachers as { name: string }[]).map((t) => t.name);

beforeEach(async () => {
  await seedSuperAdmin();
  vi.spyOn(clock, "now").mockReturnValue(new Date(`${THU}T16:00:00+05:30`));
});
afterEach(() => vi.restoreAllMocks());

describe("the teachers' sheet with a class", () => {
  it("no class: every teacher of the school", async () => {
    const s = await classroomSchool();
    expect(names(await sheet(s.token))).toEqual(["Dev Patel", "Kiran Rao", "Meena Singh"]);
  });

  it("a class: its class teacher and the teachers of its subjects (any section); the counts are of that class", async () => {
    const s = await classroomSchool();
    const res = await sheet(s.token, { classId: s.a.classId });
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(["Dev Patel", "Meena Singh"]);
    expect(res.body.data.summary.teachers).toBe(2);
    // Class 1 has no teacher yet.
    expect(names(await sheet(s.token, { classId: s.one.classId }))).toEqual([]);
  });

  it("a class that is not this school's is not found", async () => {
    const s = await classroomSchool();
    const other = await classroomSchool("Moonlight Public School", "moon.");
    const res = await sheet(other.token, { classId: s.a.classId });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLASS_NOT_FOUND");
  });
});

describe("the teachers' sheet with a search", () => {
  it("keeps the teachers whose name holds the words (any case); the counts stay the school's", async () => {
    const s = await classroomSchool();
    const res = await sheet(s.token, { search: " MEEN " });
    expect(names(res)).toEqual(["Meena Singh"]);
    expect(res.body.data.summary.teachers).toBe(3);
    expect(names(await sheet(s.token, { search: "zzz" }))).toEqual([]);
    // Plain text, not a pattern.
    expect(names(await sheet(s.token, { search: "a(.*[" }))).toEqual([]);
  });

  it("works inside a class", async () => {
    const s = await classroomSchool();
    expect(names(await sheet(s.token, { classId: s.a.classId, search: "dev" }))).toEqual(["Dev Patel"]);
    expect(names(await sheet(s.token, { classId: s.a.classId, search: "kiran" }))).toEqual([]);
  });

  it("a search over 60 letters is refused", async () => {
    const s = await classroomSchool();
    expect((await sheet(s.token, { search: "a".repeat(61) })).status).toBe(400);
  });
});
