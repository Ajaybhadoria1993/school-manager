import { describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { hashPassword } from "../../../utils/authUtils";
import { plannedClasses } from "../../academics/constants";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { NOTIFICATION_KINDS, Notification } from "../../notifications/models/Notification";
import { Audience } from "../../notifications/services/audience";
import { NotificationService } from "../../notifications/services/notification.service";
import { Tenant, type IMediumPlan } from "../../tenants/models/Tenant";
import { ReviewService } from "../../tenants/services/review.service";
import { createTenant } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { Teacher } from "../models/Teacher";

/**
 * A teacher who teaches in English Medium and Hindi Medium is one person with one login. They have a record on each side (their classes,
 * timetable and attendance are that side's), both pointing to the same login, and they move between the two from the top bar.
 */

const PASSWORD = "Sch00l@Admin";
const TEACHER_PASSWORD = "Sch00l@Teach1";
const passwordHash = hashPassword(PASSWORD);
const auth = (token: string, medium?: string) => ({ Authorization: `Bearer ${token}`, ...(medium ? { "X-School-Medium": medium } : {}) });
const api = "/api/v1/staff/teachers";

const plan = (medium: IMediumPlan["medium"], startHour: number): IMediumPlan => ({
  medium,
  lowestClass: "1",
  highestClass: "2",
  seniorStreams: [],
  classes: plannedClasses("1", "2").map((c) => ({ name: c.name, sections: 1, seats: 30 })),
  week: { days: [1, 2, 3, 4, 5], usual: [{ kind: "period", label: "", start: startHour * 60, end: startHour * 60 + 40 }], saturday: null },
});

let serial = 0;

async function school(mediums: IMediumPlan["medium"][] = ["English", "Hindi"]) {
  serial += 1;
  const email = `admin${serial}@tm.example`;
  const tenant = await createTenant({ name: `Medium School ${serial}`, contactEmail: email, approvalStatus: "pending", source: "signup" });
  await Tenant.updateOne({ _id: tenant._id }, { $set: { "profile.boardEntries": [{ board: "CBSE", mediums, plans: mediums.map((m, i) => plan(m, 8 + i * 4)) }] } });
  await AcademicYearService.saveOnboardingYear(tenant._id, { name: "2026-2027", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") });
  await User.create({ name: "Asha", email, passwordHash: await passwordHash, role: "school_admin", tenantId: tenant._id });
  await ReviewService.approve(tenant._id.toString(), new Types.ObjectId().toString());
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  const sides = await Tenant.find({ parentTenantId: tenant._id }).sort({ _id: 1 }).select("_id").lean();
  return { tenantId: tenant._id.toString(), token: login.body.data.accessToken as string, hindi: sides[0]?._id.toString() ?? "" };
}

let mobile = 9000000000;
function person(over: object = {}) {
  mobile += 1;
  serial += 1;
  return { name: "Meena Singh", mobile: String(mobile), login: { username: `meena_${serial}`, password: TEACHER_PASSWORD }, ...over };
}

async function addTeacher(s: { token: string }, over: object = {}, medium?: string) {
  const input = person(over) as ReturnType<typeof person>;
  const res = await request(app).post(api).set(auth(s.token, medium)).send(input);
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, username: input.login?.username, mobile: input.mobile };
}

const addTo = (token: string, id: string, mediumId: string) => request(app).post(`${api}/${id}/mediums`).set(auth(token)).send({ mediumId });
const signIn = (identifier: string) => request(app).post("/api/v1/auth/login").send({ identifier, password: TEACHER_PASSWORD });
const patch = (token: string, id: string, body: object, medium?: string) => request(app).patch(`${api}/${id}`).set(auth(token, medium)).send(body);

async function teacherInBoth() {
  const s = await school();
  const t = await addTeacher(s);
  expect((await addTo(s.token, t.id, s.hindi)).status).toBe(201);
  const login = await signIn(t.username);
  return { ...s, teacher: t, login, teacherToken: login.body.data.accessToken as string };
}

describe("adding a teacher to another medium", () => {
  it("makes their record on that side with the same login, and no second login", async () => {
    const s = await school();
    const t = await addTeacher(s, { email: "meena@tm.example", qualification: "M.Sc.", designation: "TGT" });
    const logins = await User.countDocuments({ username: t.username });

    expect((await addTo(s.token, t.id, s.hindi)).status).toBe(201);

    const here = await Teacher.findOne({ tenantId: s.tenantId, _id: t.id }).lean();
    const there = await Teacher.findOne({ tenantId: s.hindi, mobile: t.mobile }).lean();
    expect(there).toMatchObject({ name: "Meena Singh", email: "meena@tm.example", qualification: "M.Sc.", designation: "TGT", isActive: true });
    expect(there?.userId?.toString()).toBe(here?.userId?.toString());
    expect(await User.countDocuments({ username: t.username })).toBe(logins);
  });

  it("does not carry over what belongs to one side: subjects, limits, days off", async () => {
    const s = await school();
    const subject = await request(app).post("/api/v1/subjects").set(auth(s.token)).send({ name: "Maths" });
    const t = await addTeacher(s, { subjectIds: [subject.body.data.id], maxPeriodsPerDay: 5, offDays: [6] });
    await addTo(s.token, t.id, s.hindi);
    expect(await Teacher.findOne({ tenantId: s.hindi, mobile: t.mobile }).lean()).toMatchObject({ subjectIds: [], maxPeriodsPerDay: null, offDays: [] });
  });

  it("adding again changes nothing", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    expect((await addTo(token, teacher.id, hindi)).status).toBe(201);
    expect(await Teacher.countDocuments({ tenantId: hindi, mobile: teacher.mobile })).toBe(1);
  });

  it("brings them back on that side if they had left it", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    await patch(token, there!._id.toString(), { isActive: false }, hindi);
    await addTo(token, teacher.id, hindi);
    expect((await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean())?.isActive).toBe(true);
  });

  it("joins a record already on that side with the same mobile and no login", async () => {
    const s = await school();
    const t = await addTeacher(s);
    const noLogin = await request(app).post(api).set(auth(s.token, s.hindi)).send({ name: "Meena S", mobile: t.mobile, login: undefined });
    // The same number on the other side is fine while it has no login of its own.
    expect(noLogin.status).toBe(201);
    expect((await addTo(s.token, t.id, s.hindi)).status).toBe(201);
    const here = await Teacher.findOne({ tenantId: s.tenantId, _id: t.id }).lean();
    expect((await Teacher.findOne({ tenantId: s.hindi, mobile: t.mobile }).lean())?.userId?.toString()).toBe(here?.userId?.toString());
    expect(await Teacher.countDocuments({ tenantId: s.hindi, mobile: t.mobile })).toBe(1);
  });

  it("needs a login first", async () => {
    const s = await school();
    const made = await request(app).post(api).set(auth(s.token)).send({ name: "No Login", mobile: "9111111111" });
    const res = await addTo(s.token, made.body.data.id, s.hindi);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_HAS_NO_LOGIN");
  });

  it("refuses a teacher who has left", async () => {
    const s = await school();
    const t = await addTeacher(s);
    await patch(s.token, t.id, { isActive: false });
    const res = await addTo(s.token, t.id, s.hindi);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_HAS_LEFT");
  });

  it("refuses a medium of another school, and the medium they are already on", async () => {
    const s = await school();
    const other = await school();
    const t = await addTeacher(s);
    expect((await addTo(s.token, t.id, other.hindi)).status).toBe(404);
    expect((await addTo(s.token, t.id, other.tenantId)).status).toBe(404);
    expect((await addTo(s.token, t.id, s.tenantId)).status).toBe(404);
  });

  it("is for the school's administrator only", async () => {
    const s = await school();
    const t = await addTeacher(s);
    const email = `principal${serial}@tm.example`;
    await User.create({ name: "Principal", email, passwordHash: await passwordHash, role: "principal", tenantId: s.tenantId });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect((await addTo(login.body.data.accessToken, t.id, s.hindi)).status).toBe(403);
  });

  it("works from either side", async () => {
    const s = await school();
    const t = await addTeacher(s, {}, s.hindi);
    const res = await request(app).post(`${api}/${t.id}/mediums`).set(auth(s.token, s.hindi)).send({ mediumId: s.tenantId });
    expect(res.status).toBe(201);
    expect(await Teacher.countDocuments({ tenantId: s.tenantId, mobile: t.mobile })).toBe(1);
  });
});

describe("the list of mediums on a teacher's page", () => {
  const list = (token: string, id: string, medium?: string) => request(app).get(`${api}/${id}/mediums`).set(auth(token, medium));

  it("says where they teach and which one this is", async () => {
    const s = await school();
    const t = await addTeacher(s);
    expect((await list(s.token, t.id)).body.data.items).toEqual([
      { id: s.tenantId, label: "English Medium", here: true, teaches: true },
      { id: s.hindi, label: "Hindi Medium", here: false, teaches: false },
    ]);
    await addTo(s.token, t.id, s.hindi);
    expect((await list(s.token, t.id)).body.data.items[1]).toMatchObject({ teaches: true });
  });

  it("is empty for a school with one medium", async () => {
    const s = await school(["English"]);
    const t = await addTeacher(s);
    expect((await list(s.token, t.id)).body.data.items).toEqual([]);
  });

  it("is not found for a teacher of another side's list", async () => {
    const s = await school();
    const t = await addTeacher(s, {}, s.hindi);
    expect((await list(s.token, t.id)).status).toBe(404);
  });
});

describe("one login, two mediums", () => {
  it("tells the teacher their mediums when they sign in, the one they belong to first", async () => {
    const { login, tenantId, hindi } = await teacherInBoth();
    expect(login.body.data.tenant.mediums).toEqual([
      { id: tenantId, label: "English Medium" },
      { id: hindi, label: "Hindi Medium" },
    ]);
  });

  it("the same in /auth/me", async () => {
    const { teacherToken } = await teacherInBoth();
    const me = await request(app).get("/api/v1/auth/me").set(auth(teacherToken));
    expect(me.body.data.tenant.mediums).toHaveLength(2);
  });

  it("a teacher of one medium has nothing to switch", async () => {
    const s = await school();
    const t = await addTeacher(s);
    expect((await signIn(t.username)).body.data.tenant.mediums).toEqual([]);
  });

  it("answers for the medium the teacher opens: their own record on each side", async () => {
    const { teacherToken, teacher, hindi } = await teacherInBoth();
    const here = await request(app).get(`${api}/me`).set(auth(teacherToken));
    const there = await request(app).get(`${api}/me`).set(auth(teacherToken, hindi));
    expect(here.body.data.id).toBe(teacher.id);
    expect(there.status).toBe(200);
    expect(there.body.data.id).not.toBe(teacher.id);
  });

  it("refuses a medium they do not teach in", async () => {
    const s = await school();
    const t = await addTeacher(s);
    const token = (await signIn(t.username)).body.data.accessToken;
    const res = await request(app).get(`${api}/me`).set(auth(token, s.hindi));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("MEDIUM_NOT_FOUND");
  });

  it("refuses a medium they have left", async () => {
    const { token, teacherToken, teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    await patch(token, there!._id.toString(), { isActive: false }, hindi);
    expect((await request(app).get(`${api}/me`).set(auth(teacherToken, hindi))).status).toBe(403);
  });

  it("refuses another school, and nonsense", async () => {
    const { teacherToken } = await teacherInBoth();
    const other = await school();
    expect((await request(app).get(`${api}/me`).set(auth(teacherToken, other.tenantId))).status).toBe(403);
    expect((await request(app).get(`${api}/me`).set(auth(teacherToken, "nonsense"))).status).toBe(403);
  });

  it("a new username or password is the one login's, wherever it is changed", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    serial += 1;
    const username = `meena_new_${serial}`;
    expect((await request(app).patch(`${api}/${there!._id}/login`).set(auth(token, hindi)).send({ username })).status).toBe(200);
    expect((await signIn(username)).status).toBe(200);
    expect((await request(app).get(`${api}/${teacher.id}`).set(auth(token))).body.data.login.username).toBe(username);
  });

  it("the name, mobile and email changed on one side change on the other", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    await patch(token, teacher.id, { name: "Meena Rao", mobile: "9222222222", email: "rao@tm.example" });
    expect(await Teacher.findOne({ tenantId: hindi, userId: { $ne: null } }).lean()).toMatchObject({ name: "Meena Rao", nameKey: "meena rao", mobile: "9222222222", email: "rao@tm.example" });
  });

  it("the school can find them by username on either side", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    const res = await request(app).get(api).query({ search: teacher.username }).set(auth(token, hindi));
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe("leaving one medium", () => {
  it("keeps the login open while they still teach in the other", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    await patch(token, there!._id.toString(), { isActive: false }, hindi);
    const again = await signIn(teacher.username);
    expect(again.status).toBe(200);
    expect(again.body.data.tenant.mediums).toEqual([]);
  });

  it("leaving the side the login belongs to moves the login to the other side", async () => {
    const { token, teacher, hindi, tenantId } = await teacherInBoth();
    await patch(token, teacher.id, { isActive: false });
    const again = await signIn(teacher.username);
    expect(again.status).toBe(200);
    expect(again.body.data.user.tenantId).toBe(hindi);
    expect(again.body.data.user.tenantId).not.toBe(tenantId);
    const mine = await request(app).get(`${api}/me`).set(auth(again.body.data.accessToken));
    expect(mine.status).toBe(200);
  });

  it("closes the login when they have left every medium", async () => {
    const { token, teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    await patch(token, there!._id.toString(), { isActive: false }, hindi);
    await patch(token, teacher.id, { isActive: false });
    expect((await signIn(teacher.username)).status).not.toBe(200);
  });

  it("coming back opens the login again", async () => {
    const s = await school();
    const t = await addTeacher(s);
    await patch(s.token, t.id, { isActive: false });
    await patch(s.token, t.id, { isActive: true });
    expect((await signIn(t.username)).status).toBe(200);
  });

  it("in a school with one medium, leaving closes the login as it always did", async () => {
    const s = await school(["English"]);
    const t = await addTeacher(s);
    await patch(s.token, t.id, { isActive: false });
    expect((await signIn(t.username)).status).not.toBe(200);
  });
});

describe("no second login for the same person", () => {
  it("Add teacher on the other medium with their mobile is refused, under the mobile box", async () => {
    const s = await school();
    const t = await addTeacher(s);
    const res = await request(app).post(api).set(auth(s.token, s.hindi)).send(person({ mobile: t.mobile }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_LOGIN_IN_OTHER_MEDIUM");
    expect(res.body.details[0]).toMatchObject({ path: "mobile" });
    expect(res.body.details[0].message).toContain("English Medium");
    expect(await Teacher.countDocuments({ tenantId: s.hindi, mobile: t.mobile })).toBe(0);
  });

  it("Make a login for a record whose mobile already has a login on the other side is refused", async () => {
    const s = await school();
    const t = await addTeacher(s);
    const noLogin = await request(app).post(api).set(auth(s.token, s.hindi)).send({ name: "Meena S", mobile: t.mobile });
    serial += 1;
    const res = await request(app).post(`${api}/${noLogin.body.data.id}/login`).set(auth(s.token, s.hindi)).send({ username: `second_${serial}`, password: TEACHER_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TEACHER_LOGIN_IN_OTHER_MEDIUM");
  });

  it("a different person on the other medium is fine", async () => {
    const s = await school();
    await addTeacher(s);
    await addTeacher(s, {}, s.hindi);
  });
});

describe("what a teacher hears", () => {
  const first = NOTIFICATION_KINDS[0];

  it("a message for them on the other side reaches them", async () => {
    const { teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    await NotificationService.send(hindi, null, [{ to: await Audience.teacherLogins(hindi, [there!._id]), kind: first, title: "For Meena" }]);
    expect(await Notification.countDocuments({ tenantId: hindi, userId: there!.userId })).toBe(1);
  });

  it("everyone on a side includes the teachers who also work there", async () => {
    const { teacher, hindi } = await teacherInBoth();
    const there = await Teacher.findOne({ tenantId: hindi, mobile: teacher.mobile }).lean();
    expect(await Audience.everyone(hindi)).toContain(there!.userId!.toString());
  });
});
