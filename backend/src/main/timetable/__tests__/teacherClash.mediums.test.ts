import { describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { hashPassword } from "../../../utils/authUtils";
import { plannedClasses } from "../../academics/constants";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Teacher } from "../../staff/models/Teacher";
import { Tenant, type IMediumPlan } from "../../tenants/models/Tenant";
import { ReviewService } from "../../tenants/services/review.service";
import { createTenant } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";

/**
 * One teacher in two mediums (English and Hindi), booked at the same time on both sides (2026-11-18). A teacher who teaches in both is ONE person
 * with ONE login and a record on each side, and a medium is run on its own (its own classes, timings and timetables). Nobody is in two places at
 * the same moment whichever side asks: a lesson on one side takes the teacher's time on the other.
 */

const PASSWORD = "Sch00l@Admin";
const TEACHER_PASSWORD = "Sch00l@Teach1";
const side = (token: string, medium?: string) => ({ Authorization: `Bearer ${token}`, ...(medium ? { "X-School-Medium": medium } : {}) });

/** Both mediums start at 08:00 with one period of 40 minutes, Monday to Friday: the same hours on both sides. */
const plan = (medium: IMediumPlan["medium"]): IMediumPlan => ({
  medium,
  lowestClass: "1",
  highestClass: "2",
  seniorStreams: [],
  classes: plannedClasses("1", "2").map((c) => ({ name: c.name, sections: 1, seats: 30 })),
  week: { days: [1, 2, 3, 4, 5], usual: [{ kind: "period", label: "", start: 8 * 60, end: 8 * 60 + 40 }, { kind: "period", label: "", start: 8 * 60 + 40, end: 9 * 60 + 20 }], saturday: null },
});

let serial = 0;

async function twoMediums() {
  serial += 1;
  const email = `admin${serial}@clash.example`;
  const tenant = await createTenant({ name: `Clash School ${serial}`, contactEmail: email, approvalStatus: "pending", source: "signup" });
  await Tenant.updateOne({ _id: tenant._id }, { $set: { "profile.boardEntries": [{ board: "CBSE", mediums: ["English", "Hindi"], plans: [plan("English"), plan("Hindi")] }] } });
  await AcademicYearService.saveOnboardingYear(tenant._id, { name: "2026-2027", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") });
  await User.create({ name: "Asha", email, passwordHash: await hashPassword(PASSWORD), role: "school_admin", tenantId: tenant._id });
  await ReviewService.approve(tenant._id.toString(), new Types.ObjectId().toString());
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  if (!login.body.data) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  const token = login.body.data.accessToken as string;
  const sides = await Tenant.find({ parentTenantId: tenant._id }).sort({ _id: 1 }).select("_id").lean();
  return { tenantId: tenant._id.toString(), token, hindi: sides[0]?._id.toString() ?? "" };
}

/** A unit (Class 1, section A) of a side, with Maths on its list taught by the teacher of that side. */
async function unitWithMaths(token: string, medium: string | undefined, teacherId: string) {
  const structureRes = await request(app).get("/api/v1/academics/structure").set(side(token, medium));
  expect(structureRes.status, `structure ${medium ?? "english"}: ${JSON.stringify(structureRes.body)}`).toBe(200);
  const structure = structureRes.body.data;
  const klass = (structure.classes as { id: string; name: string; sections: { id: string }[] }[]).find((c) => c.name === "Class 1")!;
  const subjectRes = await request(app).post("/api/v1/subjects").set(side(token, medium)).send({ name: "Mathematics" });
  expect(subjectRes.status, `subject ${medium ?? "english"}: ${JSON.stringify(subjectRes.body)}`).toBe(201);
  const subject = subjectRes.body.data.id as string;
  const unit = { classId: klass.id, sectionId: klass.sections[0].id };
  const saved = await request(app).put("/api/v1/subjects/allotments").set(side(token, medium)).send({ ...unit, rows: [{ subjectId: subject, periodsPerWeek: 5, teacherId }] });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  return { unit, subject };
}

describe("a teacher in two mediums", () => {
  it("cannot be in the English side's class and the Hindi side's class at the same moment: the second timetable is refused, naming the other medium's class", async () => {
    const s = await twoMediums();
    const english = (await request(app).post("/api/v1/staff/teachers").set(side(s.token)).send({ name: "Meena Singh", mobile: "9000000011", login: { username: "meena_clash", password: TEACHER_PASSWORD } })).body.data.id as string;
    expect((await request(app).post(`/api/v1/staff/teachers/${english}/mediums`).set(side(s.token)).send({ mediumId: s.hindi })).status).toBe(201);
    const hindiTeacher = (await Teacher.findOne({ tenantId: s.hindi, mobile: "9000000011" }).lean())!._id.toString();

    const e = await unitWithMaths(s.token, undefined, english);
    const h = await unitWithMaths(s.token, s.hindi, hindiTeacher);
    const lessons = (subjectId: string) => [{ day: 1, period: 1, lessons: [{ subjectId }] }];

    const first = await request(app).put("/api/v1/timetable/grid").set(side(s.token)).send({ ...e.unit, cells: lessons(e.subject) });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    // Monday period 1 on the Hindi side is the same clock time (08:00-08:40): Meena is already teaching Class 1 on the English side.
    const second = await request(app).put("/api/v1/timetable/grid").set(side(s.token, s.hindi)).send({ ...h.unit, cells: lessons(h.subject) });
    expect(second.status, JSON.stringify(second.body)).toBe(409);
    expect(second.body.message).toContain("Meena Singh is teaching Class 1");

    // The same teacher at a different time on the other side is fine (period 2 on the Hindi side, 08:40-09:20).
    const later = await request(app).put("/api/v1/timetable/grid").set(side(s.token, s.hindi)).send({ ...h.unit, cells: [{ day: 1, period: 2, lessons: [{ subjectId: h.subject }] }] });
    expect(later.status, JSON.stringify(later.body)).toBe(200);
  });
});
