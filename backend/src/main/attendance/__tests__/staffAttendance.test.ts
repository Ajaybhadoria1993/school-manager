import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { LOGIN_PASSWORD, classroomSchool, signInAs } from "../../../test/classroom";
import { addTiming, auth } from "../../../test/timetable";
import { StaffMember } from "../../staff/models/StaffMember";
import { postStaff } from "../../../test/logins";

/**
 * Staff attendance (2026-11-22, asked for: "staff me bhi aisa karo, class ka filter mat, department rakho: reception, management, kaam karne wale;
 * admin present, absent, leave sab dekh sake"; then: "staff apne login se present karega, admin nahi lagayenge, bas dekhega"). A staff member marks
 * themselves present in the app (the time is kept, Late after school starts); one who has not by the time school ends is Absent; the school ONLY
 * reads the sheet for any days, by department (the staff member's role) and with a search: it never marks a staff day. A staff member who also
 * teaches is on the teachers' sheet, not here. 5 Nov 2026 is a Thursday; school runs Monday to Friday, 8:30 AM to 2:20 PM.
 */

const api = "/api/v1/attendance/staff";
const THU = "2026-11-05";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  const add = async (name: string, role: string, username: string, over: object = {}) => {
    const res = await postStaff(s.token, { name, role, mobile: `98765${String(43210 + username.length + name.length).padStart(5, "0")}`, login: { username, password: LOGIN_PASSWORD }, ...over });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };
  // (classroomSchool's parents already have "sun.ravi", "sun.sita" and "sun.anil".)
  const asha = await add("Asha Rao", "receptionist", "sun.desk");
  const ravi = await add("Ravi Kumar", "accountant", "sun.accounts");
  const ramesh = await add("Ramesh Yadav", "peon", "sun.helper");
  // A vice principal who also teaches: one of the teachers (their sheet), not of the staff.
  await add("Neha Joshi", "vice_principal", "sun.vice", { alsoTeacher: true });
  // Everyone joined at the start of the year, so the days asked about count.
  await StaffMember.collection.updateMany({ tenantId: new Types.ObjectId(s.tenantId) }, { $set: { createdAt: new Date("2026-04-01T00:00:00.000Z"), joiningDate: new Date("2026-04-01T00:00:00.000Z") } });
  const tokens = { asha: await signInAs("sun.desk@mail.test"), ravi: await signInAs("sun.accounts@mail.test"), ramesh: await signInAs("sun.helper@mail.test") };
  return { s, ids: { asha, ravi, ramesh }, tokens };
}

const present = (token: string) => request(app).post(`${api}/me/present`).set(auth(token));
const mine = (token: string) => request(app).get(`${api}/me`).set(auth(token));
const sheet = (token: string, query: Record<string, string> = {}) => request(app).get(api).query({ from: THU, to: THU, ...query }).set(auth(token));
type Row = { id: string; name: string; department: { key: string; label: string }; records: { status: string; checkedInTime: string | null; note: string | null }[] };
const rows = (res: request.Response) => res.body.data.staff as Row[];

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("a staff member marks themselves present", () => {
  it("before school starts: Present with the time; after it starts: Late, and by how much; a second tap changes nothing", async () => {
    const { tokens } = await setUp();
    at(THU, "08:10");
    const first = await present(tokens.asha);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data).toMatchObject({ date: THU, status: "present", checkedInTime: "08:10", lateByMinutes: 0, alreadyMarked: false, canCheckIn: false });
    at(THU, "09:00");
    expect((await present(tokens.ravi)).body.data).toMatchObject({ status: "late", checkedInTime: "09:00", lateByMinutes: 30 });
    const again = await present(tokens.asha);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ checkedInTime: "08:10", alreadyMarked: true });
  });

  it("their day: Not yet while school runs (with the button), Absent once it is over (and the mark is refused)", async () => {
    const { tokens } = await setUp();
    at(THU, "08:00");
    expect((await mine(tokens.ramesh)).body.data).toMatchObject({ status: "pending", canCheckIn: true, school: { start: "08:30", end: "14:20" } });
    at(THU, "14:30");
    expect((await mine(tokens.ramesh)).body.data).toMatchObject({ status: "absent", canCheckIn: false });
    const late = await present(tokens.ramesh);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe("SCHOOL_TIME_OVER");
  });

  it("a teacher or a parent is not a staff member: their own staff day is refused", async () => {
    const { s } = await setUp();
    at(THU, "09:00");
    expect((await mine(s.tokens.meena)).status).toBe(403);
    expect((await present(s.tokens.ravi)).status).toBe(403);
  });
});

describe("the school's sheet of the staff", () => {
  it("every staff member who does not teach, with their department and their day; the counts; the departments the school has", async () => {
    const { s, tokens } = await setUp();
    at(THU, "08:10");
    await present(tokens.asha);
    at(THU, "09:00");
    await present(tokens.ravi);
    at(THU, "16:00");
    const res = await sheet(s.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(rows(res).map((r) => [r.name, r.department.label, r.records[0].status])).toEqual([
      ["Asha Rao", "Receptionist", "present"],
      ["Ramesh Yadav", "Peon / attendant", "absent"],
      ["Ravi Kumar", "Accountant", "late"],
    ]);
    expect(res.body.data.summary).toEqual({ staff: 3, present: 1, late: 1, absent: 1, leave: 0 });
    // In the order of the roles, with how many each has.
    expect(res.body.data.departments).toEqual([
      { key: "accountant", label: "Accountant", count: 1 },
      { key: "receptionist", label: "Receptionist", count: 1 },
      { key: "peon", label: "Peon / attendant", count: 1 },
    ]);
  });

  it("a department picked is only that department (its counts too); the list of departments stays whole; a search finds by name", async () => {
    const { s } = await setUp();
    at(THU, "16:00");
    const reception = await sheet(s.token, { role: "receptionist" });
    expect(rows(reception).map((r) => r.name)).toEqual(["Asha Rao"]);
    expect(reception.body.data.summary.staff).toBe(1);
    expect(reception.body.data.departments).toHaveLength(3);
    const found = await sheet(s.token, { search: "KUM" });
    expect(rows(found).map((r) => r.name)).toEqual(["Ravi Kumar"]);
    // The counts are of the department (here every one), not of the search.
    expect(found.body.data.summary.staff).toBe(3);
    expect(rows(await sheet(s.token, { search: "a(.*[" }))).toEqual([]);
  });

  it("a department that is not a role, or a search over 60 letters, is refused", async () => {
    const { s } = await setUp();
    expect((await sheet(s.token, { role: "pilot" })).status).toBe(400);
    expect((await sheet(s.token, { search: "a".repeat(61) })).status).toBe(400);
  });

  it("the school only LOOKS (2026-11-22: \"admin nahi lagayenge, bas dekhega\"): there is no way for it to mark or change a staff member's day", async () => {
    const { s, ids } = await setUp();
    at(THU, "16:00");
    const tried = await request(app).put(`${api}/${ids.asha}/day`).set(auth(s.token)).send({ date: THU, status: "present", time: "08:10" });
    expect(tried.status).toBe(404);
    // Asha did not mark herself: she is still Absent for the day.
    expect(rows(await sheet(s.token)).find((r) => r.name === "Asha Rao")?.records[0]).toMatchObject({ status: "absent", checkedInTime: null });
  });

  it("is for the people who run the school: a staff member or a teacher cannot read it", async () => {
    const { s, tokens } = await setUp();
    at(THU, "16:00");
    expect((await sheet(s.token)).status).toBe(200);
    expect((await sheet(tokens.asha)).status).toBe(403);
    expect((await sheet(s.tokens.meena)).status).toBe(403);
  });
});
