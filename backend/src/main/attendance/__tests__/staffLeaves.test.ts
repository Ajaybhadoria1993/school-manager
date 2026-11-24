import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { LOGIN_PASSWORD, classroomSchool, signInAs } from "../../../test/classroom";
import { addTiming, auth } from "../../../test/timetable";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";
import { StaffMember } from "../../staff/models/StaffMember";
import { everyoneAddedToTheApp } from "../../../test/teachers";

/**
 * The leave of the teachers and the staff (2026-11-24, user: "teacher login karega to leave daal sake; admin side teacher aur staff ki leaves aa jayein
 * reason ke saath, application jaisi, aur status"). A person applies from their own login for today or days to come; the school (admin or principal)
 * approves or declines with a note; an approved leave makes the person "on leave" (attendance reads Leave, not Absent). Today is Tuesday 10 November
 * 2026, 09:00 in India; school runs Monday to Friday, 8:30 AM to 2:20 PM.
 */

const api = "/api/v1/attendance/leaves";
const TODAY = "2026-11-10";
const TOMORROW = "2026-11-11";
const at = (day: string, hhmm: string) => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));

async function setUp() {
  const s = await classroomSchool();
  await addTiming(s.token);
  const addStaff = async (name: string, role: string, username: string) => {
    const res = await request(app)
      .post("/api/v1/staff/members")
      .set(auth(s.token))
      .send({ name, role, mobile: `98765${String(43210 + username.length + name.length).padStart(5, "0")}`, login: { username, password: LOGIN_PASSWORD } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  };
  const desk = await addStaff("Asha Rao", "receptionist", "sun.desk");
  const head = await addStaff("Pooja Sharma", "principal", "sun.head");
  // Everyone joined at the start of the year, so the days asked about count.
  await StaffMember.collection.updateMany({ tenantId: new Types.ObjectId(s.tenantId) }, { $set: { createdAt: new Date("2026-04-01T00:00:00.000Z"), joiningDate: new Date("2026-04-01T00:00:00.000Z") } });
  await everyoneAddedToTheApp(s.tenantId);
  return { s, desk, head, tokens: { ...s.tokens, desk: await signInAs("sun.desk"), head: await signInAs("sun.head") } };
}

const apply = (token: string, body: object) => request(app).post(`${api}/mine`).set(auth(token)).send(body);
const mine = (token: string) => request(app).get(`${api}/mine`).set(auth(token));
const cancel = (token: string, id: string) => request(app).post(`${api}/mine/${id}/cancel`).set(auth(token));
const list = (token: string, query: Record<string, string> = {}) => request(app).get(api).query(query).set(auth(token));
const decide = (token: string, id: string, body: object) => request(app).post(`${api}/${id}/decide`).set(auth(token)).send(body);
type Leave = { id: string; kind: string; name: string; roleLabel: string; fromDate: string; toDate: string; days: number; reason: string; status: string; note: string | null; decidedBy: { name: string; role: string } | null; canCancel: boolean };
const leaves = (res: request.Response) => res.body.data.items as Leave[];

beforeEach(async () => {
  await seedSuperAdmin();
  at(TODAY, "09:00");
});
afterEach(() => vi.restoreAllMocks());

describe("a teacher or a staff member applies for leave", () => {
  it("a teacher applies for a day to come: a waiting application with their name, their role, the reason and the days", async () => {
    const { tokens } = await setUp();
    const res = await apply(tokens.meena, { fromDate: TOMORROW, reason: "Sister's wedding" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ kind: "teacher", name: "Meena Singh", roleLabel: "Teacher", fromDate: TOMORROW, toDate: TOMORROW, days: 1, reason: "Sister's wedding", status: "pending", note: null, canCancel: true });
  });

  it("with a last day it is that many days; today is allowed (a teacher who is ill this morning)", async () => {
    const { tokens } = await setUp();
    const res = await apply(tokens.meena, { fromDate: TODAY, toDate: "2026-11-12", reason: "Fever" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fromDate: TODAY, toDate: "2026-11-12", days: 3 });
  });

  it("a staff member applies too, with their role as the title", async () => {
    const { tokens } = await setUp();
    const res = await apply(tokens.desk, { fromDate: TOMORROW, reason: "Family function" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ kind: "staff", name: "Asha Rao", roleLabel: "Receptionist" });
  });

  it("the person sees their own applications, newest first, and only theirs", async () => {
    const { tokens } = await setUp();
    await apply(tokens.meena, { fromDate: TOMORROW, reason: "First" });
    await apply(tokens.meena, { fromDate: "2026-11-20", reason: "Second" });
    await apply(tokens.dev, { fromDate: TOMORROW, reason: "Dev's" });
    expect(leaves(await mine(tokens.meena)).map((l) => l.reason)).toEqual(["Second", "First"]);
    expect(leaves(await mine(tokens.dev)).map((l) => l.reason)).toEqual(["Dev's"]);
  });

  it("refuses a day that is over, a last day before the first, no reason, a reason that is too long, and more than 60 days", async () => {
    const { tokens } = await setUp();
    const bad = async (body: object) => (await apply(tokens.meena, body)).status;
    expect(await bad({ fromDate: "2026-11-09", reason: "Late" })).toBe(400);
    expect(await bad({ fromDate: TOMORROW, toDate: TODAY, reason: "Backwards" })).toBe(400);
    expect(await bad({ fromDate: TOMORROW, reason: "   " })).toBe(400);
    expect(await bad({ fromDate: TOMORROW })).toBe(400);
    expect(await bad({ fromDate: TOMORROW, reason: "x".repeat(301) })).toBe(400);
    expect(await bad({ fromDate: TOMORROW, toDate: "2027-02-20", reason: "Long" })).toBe(400);
    expect(await bad({ fromDate: "2026-02-30", reason: "Not a day" })).toBe(400);
    expect(leaves(await mine(tokens.meena))).toEqual([]);
  });

  it("their own waiting or approved leaves cannot overlap; a declined or taken-back one does not stop a new one", async () => {
    const { s, tokens } = await setUp();
    const first = await apply(tokens.meena, { fromDate: "2026-11-12", toDate: "2026-11-13", reason: "Trip" });
    const clash = await apply(tokens.meena, { fromDate: "2026-11-13", toDate: "2026-11-14", reason: "Again" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("LEAVE_OVERLAP");
    expect(clash.body.message).toBe("You already have a leave for 12 Nov to 13 Nov.");
    expect((await decide(s.token, first.body.data.id, { status: "declined", note: "Exams" })).status).toBe(200);
    expect((await apply(tokens.meena, { fromDate: "2026-11-13", reason: "Again" })).status).toBe(201);
  });

  it("only a teacher or a staff member applies: the school admin and a parent are refused", async () => {
    const { s, tokens } = await setUp();
    expect((await apply(s.token, { fromDate: TOMORROW, reason: "x" })).status).toBe(403);
    expect((await apply(tokens.ravi, { fromDate: TOMORROW, reason: "x" })).status).toBe(403);
    expect((await mine(tokens.ravi)).status).toBe(403);
    expect((await request(app).post(`${api}/mine`).send({ fromDate: TOMORROW, reason: "x" })).status).toBe(401);
  });
});

describe("the school sees the applications and answers them", () => {
  it("lists the waiting ones with who, their role, the reason and the days (the oldest day first), and how many are waiting; All shows the answered too", async () => {
    const { s, tokens } = await setUp();
    await apply(tokens.meena, { fromDate: "2026-11-20", reason: "Later" });
    const soon = await apply(tokens.desk, { fromDate: TOMORROW, reason: "Sooner" });
    const waiting = await list(s.token);
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200);
    expect(leaves(waiting).map((l) => `${l.name} · ${l.roleLabel} · ${l.reason}`)).toEqual(["Asha Rao · Receptionist · Sooner", "Meena Singh · Teacher · Later"]);
    expect(waiting.body.data.waiting).toBe(2);
    await decide(s.token, soon.body.data.id, { status: "approved" });
    expect(leaves(await list(s.token)).map((l) => l.name)).toEqual(["Meena Singh"]);
    const all = await list(s.token, { status: "all" });
    expect(leaves(all).map((l) => `${l.name} ${l.status}`)).toEqual(["Asha Rao approved", "Meena Singh pending"]);
    expect(all.body.data.waiting).toBe(1);
  });

  it("can be narrowed to teachers or to staff", async () => {
    const { s, tokens } = await setUp();
    await apply(tokens.meena, { fromDate: TOMORROW, reason: "T" });
    await apply(tokens.desk, { fromDate: TOMORROW, reason: "S" });
    expect(leaves(await list(s.token, { who: "teacher" })).map((l) => l.name)).toEqual(["Meena Singh"]);
    expect(leaves(await list(s.token, { who: "staff" })).map((l) => l.name)).toEqual(["Asha Rao"]);
  });

  it("approve: the leave is approved with who answered and when; decline keeps the school's note; the person's list says so", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.meena, { fromDate: TOMORROW, reason: "Wedding" });
    const approved = await decide(s.token, a.body.data.id, { status: "approved" });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data).toMatchObject({ status: "approved", note: null, decidedBy: { role: "school_admin" } });
    expect(approved.body.data.decidedBy.name).toBeTruthy();
    const b = await apply(tokens.desk, { fromDate: "2026-11-16", reason: "Trip" });
    const declined = await decide(s.token, b.body.data.id, { status: "declined", note: "Exams that week" });
    expect(declined.body.data).toMatchObject({ status: "declined", note: "Exams that week" });
    expect(leaves(await mine(tokens.desk))[0]).toMatchObject({ status: "declined", note: "Exams that week", canCancel: false });
  });

  it("an answered leave is not answered again; one whose days are over is not answered; a note is up to 300 letters", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.meena, { fromDate: TODAY, reason: "Fever" });
    expect((await decide(s.token, a.body.data.id, { status: "approved" })).status).toBe(200);
    const again = await decide(s.token, a.body.data.id, { status: "declined" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("LEAVE_ANSWERED");
    const b = await apply(tokens.desk, { fromDate: TOMORROW, reason: "Trip" });
    expect((await decide(s.token, b.body.data.id, { status: "declined", note: "x".repeat(301) })).status).toBe(400);
    expect((await decide(s.token, b.body.data.id, { status: "maybe" })).status).toBe(400);
    // Two days later nobody can answer it any more.
    at("2026-11-13", "09:00");
    const over = await decide(s.token, b.body.data.id, { status: "approved" });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LEAVE_OVER");
  });

  it("the principal answers others' leave but never their own: another admin does", async () => {
    const { s, tokens } = await setUp();
    const own = await apply(tokens.head, { fromDate: TOMORROW, reason: "Conference" });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    const mineToo = await decide(tokens.head, own.body.data.id, { status: "approved" });
    expect(mineToo.status).toBe(403);
    expect(mineToo.body.code).toBe("OWN_LEAVE");
    const theirs = await apply(tokens.meena, { fromDate: TOMORROW, reason: "Wedding" });
    expect((await decide(tokens.head, theirs.body.data.id, { status: "approved" })).status).toBe(200);
    expect((await decide(s.token, own.body.data.id, { status: "approved" })).status).toBe(200);
  });

  it("only the people who run the school see and answer: a teacher, a staff member and a parent are refused", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.meena, { fromDate: TOMORROW, reason: "x" });
    for (const t of [tokens.meena, tokens.desk, tokens.ravi]) {
      expect((await list(t)).status).toBe(403);
      expect((await decide(t, a.body.data.id, { status: "approved" })).status).toBe(403);
    }
    expect((await list(s.token)).status).toBe(200);
    // 404 before 400: a leave that is not there is said so before its answer is looked at.
    expect((await decide(s.token, "64b64b64b64b64b64b64b64b", { status: "maybe" })).status).toBe(404);
  });
});

describe("a person takes a leave back", () => {
  it("a waiting leave goes with no word to the school; an approved one that has not begun goes and the school hears it", async () => {
    const { s, tokens } = await setUp();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const waiting = await apply(tokens.meena, { fromDate: TOMORROW, reason: "x" });
    const out = await cancel(tokens.meena, waiting.body.data.id);
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect(out.body.data.status).toBe("cancelled");
    const ok = await apply(tokens.desk, { fromDate: "2026-11-16", reason: "Trip" });
    await decide(s.token, ok.body.data.id, { status: "approved" });
    expect((await cancel(tokens.desk, ok.body.data.id)).body.data.status).toBe("cancelled");
    await NotificationService.idle();
    const kinds = (await Notification.find({ tenantId: s.tenantId, kind: { $in: ["staff_leave.cancelled"] } }).lean()).map((n) => n.title);
    // One bell for each person who runs the school (the admin and the principal), none for the waiting leave Meena took back.
    expect([...new Set(kinds)]).toEqual(["Leave taken back: Asha Rao"]);
  });

  it("an approved leave that has begun is not taken back by the person; an answered or another's leave is refused", async () => {
    const { s, tokens } = await setUp();
    const begun = await apply(tokens.meena, { fromDate: TODAY, toDate: TOMORROW, reason: "Fever" });
    await decide(s.token, begun.body.data.id, { status: "approved" });
    const refused = await cancel(tokens.meena, begun.body.data.id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("LEAVE_BEGUN");
    const declined = await apply(tokens.desk, { fromDate: "2026-11-16", reason: "Trip" });
    await decide(s.token, declined.body.data.id, { status: "declined" });
    expect((await cancel(tokens.desk, declined.body.data.id)).status).toBe(409);
    expect((await cancel(tokens.dev, begun.body.data.id)).status).toBe(404);
    expect((await cancel(s.token, begun.body.data.id)).status).toBe(403);
  });
});

describe("the people are told", () => {
  it("the school hears an application (who, their role, the days and the reason); the person hears the answer with the school's note", async () => {
    const { s, tokens } = await setUp();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    const a = await apply(tokens.meena, { fromDate: TOMORROW, toDate: "2026-11-12", reason: "Wedding" });
    await NotificationService.idle();
    const heard = (await request(app).get("/api/v1/notifications").set(auth(s.token))).body.data.items as { kind: string; title: string; body: string; link: string }[];
    expect(heard.find((n) => n.kind === "staff_leave.applied")).toMatchObject({ title: "Leave request: Meena Singh", link: "/school/arrangements?view=leave" });
    expect(heard.find((n) => n.kind === "staff_leave.applied")!.body).toBe("Teacher · 11 Nov to 12 Nov · Wedding");
    await decide(s.token, a.body.data.id, { status: "declined", note: "Exams" });
    await NotificationService.idle();
    const mineHeard = (await request(app).get("/api/v1/notifications").set(auth(tokens.meena))).body.data.items as { kind: string; title: string; body: string; link: string }[];
    const answer = mineHeard.find((n) => n.kind === "staff_leave.decided")!;
    expect(answer.title).toMatch(/ declined your leave$/);
    expect(answer.body).toBe("11 Nov to 12 Nov · Exams");
    expect(answer.link).toBe("/my-leave");
  });
});

describe("an approved leave is Leave in the attendance, not Absent", () => {
  const sheetOf = async (token: string, path: string, day: string) => (await request(app).get(path).query({ from: day, to: day }).set(auth(token))).body.data;

  it("a teacher on an approved leave is Leave for the day even after school ends; a waiting or declined one is Absent as before", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.meena, { fromDate: TODAY, reason: "Fever" });
    await apply(tokens.dev, { fromDate: TODAY, reason: "Waiting" });
    const c = await apply(tokens.kiran, { fromDate: TODAY, reason: "Declined" });
    await decide(s.token, a.body.data.id, { status: "approved" });
    await decide(s.token, c.body.data.id, { status: "declined" });
    // After school ends nobody has marked.
    at(TODAY, "15:00");
    const sheet = await sheetOf(s.token, "/api/v1/attendance/teachers", TODAY);
    const statusOf = (name: string) => (sheet.teachers as { name: string; records: { status: string }[] }[]).find((t) => t.name === name)!.records[0].status;
    expect(statusOf("Meena Singh")).toBe("leave");
    expect(statusOf("Dev Patel")).toBe("absent");
    expect(statusOf("Kiran Rao")).toBe("absent");
    // Her own day says why.
    const own = (await request(app).get("/api/v1/attendance/teachers/me").set(auth(tokens.meena))).body.data;
    expect(own).toMatchObject({ status: "leave", canCheckIn: false, why: "On approved leave" });
  });

  it("a day of the leave that school is shut (Sunday, a holiday) stays a day off; the days before and after it are as they were", async () => {
    const { s, tokens } = await setUp();
    // Friday 13 Nov to Monday 16 Nov: Saturday and Sunday are not working days.
    const a = await apply(tokens.meena, { fromDate: "2026-11-13", toDate: "2026-11-16", reason: "Trip" });
    await decide(s.token, a.body.data.id, { status: "approved" });
    at("2026-11-20", "15:00");
    const res = await request(app).get("/api/v1/attendance/teachers").query({ from: "2026-11-12", to: "2026-11-17" }).set(auth(s.token));
    const row = (res.body.data.teachers as { name: string; records: { date: string; status: string }[] }[]).find((t) => t.name === "Meena Singh")!;
    expect(row.records.map((r) => `${r.date.slice(8)} ${r.status}`)).toEqual(["12 absent", "13 leave", "14 off", "15 off", "16 leave", "17 absent"]);
  });

  it("a staff member on an approved leave is Leave on the staff's sheet and in their own day", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.desk, { fromDate: TODAY, reason: "Fever" });
    await decide(s.token, a.body.data.id, { status: "approved" });
    at(TODAY, "15:00");
    const sheet = await sheetOf(s.token, "/api/v1/attendance/staff", TODAY);
    expect((sheet.staff as { name: string; records: { status: string }[] }[]).find((r) => r.name === "Asha Rao")!.records[0].status).toBe("leave");
    const own = (await request(app).get("/api/v1/attendance/staff/me").set(auth(tokens.desk))).body.data;
    expect(own).toMatchObject({ status: "leave", why: "On approved leave" });
  });

  it("taking the leave back puts the days back as they were", async () => {
    const { s, tokens } = await setUp();
    const a = await apply(tokens.meena, { fromDate: "2026-11-16", reason: "Trip" });
    await decide(s.token, a.body.data.id, { status: "approved" });
    await cancel(tokens.meena, a.body.data.id);
    at("2026-11-17", "15:00");
    const sheet = await sheetOf(s.token, "/api/v1/attendance/teachers", "2026-11-16");
    expect((sheet.teachers as { name: string; records: { status: string }[] }[]).find((t) => t.name === "Meena Singh")!.records[0].status).toBe("absent");
  });
});
