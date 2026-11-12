import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { hashPassword } from "../../../utils/authUtils";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { plannedClasses } from "../../academics/constants";
import { Section } from "../../academics/models/Section";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { NotificationService } from "../../notifications/services/notification.service";
import { NOTIFICATION_KINDS, Notification } from "../../notifications/models/Notification";
import { BellSchedule } from "../../timetable/models/BellSchedule";
import { classAfter } from "../../students/classNumber";
import { User } from "../../users/models/User";
import { Tenant, type IMediumPlan } from "../models/Tenant";
import { MediumService } from "../services/medium.service";
import { ReviewService } from "../services/review.service";
import { createTenant } from "../services/tenantFactory";
import { listTenants, statusCounts } from "../services/tenantQueries";

/**
 * A school that teaches in English and in Hindi runs them as two sides: each has its own classes, sections and timing, built when the
 * school is approved from what it filled in. People see one school; its administrator moves between the sides with `X-School-Medium`.
 */

const PASSWORD = "Sch00l@Admin";
const passwordHash = hashPassword(PASSWORD);
const auth = (token: string, medium?: string) => ({ Authorization: `Bearer ${token}`, ...(medium ? { "X-School-Medium": medium } : {}) });

const day = (startHour: number) => {
  const at = startHour * 60;
  return [
    { kind: "period" as const, label: "", start: at, end: at + 40 },
    { kind: "lunch" as const, label: "Lunch", start: at + 40, end: at + 70 },
    { kind: "period" as const, label: "", start: at + 70, end: at + 110 },
  ];
};

const plan = (medium: IMediumPlan["medium"], lowest: IMediumPlan["lowestClass"], highest: IMediumPlan["highestClass"], startHour: number, over: Partial<IMediumPlan> = {}): IMediumPlan => {
  const seniorStreams = over.seniorStreams ?? [];
  return {
    medium,
    lowestClass: lowest,
    highestClass: highest,
    seniorStreams,
    classes: plannedClasses(lowest, highest, seniorStreams).map((c) => ({ name: c.name, sections: 2, seats: 30 })),
    week: { days: [1, 2, 3, 4, 5], usual: day(startHour), saturday: null },
    ...over,
  };
};

const cbse = (...plans: IMediumPlan[]) => ({ board: "CBSE", mediums: plans.map((p) => p.medium), plans });
const mp = (...plans: IMediumPlan[]) => ({ board: "State Board", stateBoard: "M.P. Board", mediums: plans.map((p) => p.medium), plans });

let serial = 0;

async function approvedSchool(boards: object[]) {
  serial += 1;
  const email = `admin${serial}@sides.example`;
  const tenant = await createTenant({ name: `Sides School ${serial}`, contactEmail: email, approvalStatus: "pending", source: "signup" });
  await Tenant.updateOne({ _id: tenant._id }, { $set: { "profile.boardEntries": boards } });
  await AcademicYearService.saveOnboardingYear(tenant._id, { name: "2026-2027", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") });
  await User.create({ name: "Asha Verma", email, passwordHash: await passwordHash, role: "school_admin", tenantId: tenant._id });
  await ReviewService.approve(tenant._id.toString(), new Types.ObjectId().toString());
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return { tenantId: tenant._id.toString(), token: login.body.data.accessToken as string, tenant: login.body.data.tenant };
}

const childrenOf = (tenantId: string) => Tenant.find({ parentTenantId: tenantId }).sort({ _id: 1 }).lean();
const classNames = async (tenantId: string) => (await SchoolClass.find({ tenantId }).sort({ order: 1 }).lean()).map((c) => c.name);

beforeEach(() => {
  serial += 100;
});

describe("a school with one medium", () => {
  it("is one school with no sides: nothing to switch", async () => {
    const school = await approvedSchool([cbse(plan("English", "1", "3", 8))]);
    expect(await childrenOf(school.tenantId)).toEqual([]);
    expect((await Tenant.findById(school.tenantId).lean())?.medium).toBeUndefined();
    expect(school.tenant.mediums).toEqual([]);
    const me = await request(app).get("/api/v1/auth/me").set(auth(school.token));
    expect(me.body.data.tenant.mediums).toEqual([]);
  });

  it("starts with its classes, sections and seats, in the running year", async () => {
    const school = await approvedSchool([cbse(plan("English", "1", "2", 8))]);
    const year = await AcademicYear.findOne({ tenantId: school.tenantId, status: "active" }).lean();
    const classes = await SchoolClass.find({ tenantId: school.tenantId }).sort({ order: 1 }).lean();
    expect(classes.map((c) => [c.name, c.capacity])).toEqual([
      ["Class 1", 60],
      ["Class 2", 60],
    ]);
    const sections = await Section.find({ tenantId: school.tenantId, classId: classes[0]._id }).sort({ name: 1 }).lean();
    expect(sections.map((s) => [s.name, s.capacity, s.academicYearId?.toString()])).toEqual([
      ["A", 30, year?._id.toString()],
      ["B", 30, year?._id.toString()],
    ]);
  });

  it("the room the school gave a class is its first section's room: the others are left for Classes & Sections", async () => {
    const school = await approvedSchool([
      cbse(plan("English", "1", "2", 8, { classes: [{ name: "Class 1", sections: 2, seats: 30, room: "101" }, { name: "Class 2", sections: 1, seats: 30 }] })),
    ]);
    const classes = await SchoolClass.find({ tenantId: school.tenantId }).sort({ order: 1 }).lean();
    const roomsOf = async (classId: unknown) => (await Section.find({ tenantId: school.tenantId, classId }).sort({ name: 1 }).lean()).map((s) => [s.name, s.room ?? null]);
    expect(await roomsOf(classes[0]._id)).toEqual([["A", "101"], ["B", null]]);
    expect(await roomsOf(classes[1]._id)).toEqual([["A", null]]);
  });

  it("a class with no sections has no room to give", async () => {
    const school = await approvedSchool([cbse(plan("English", "1", "1", 8, { classes: [{ name: "Class 1", sections: 0, seats: 35, room: "101" }] }))]);
    expect(await Section.countDocuments({ tenantId: school.tenantId })).toBe(0);
  });

  it("a class with no sections keeps its seats on the class", async () => {
    const school = await approvedSchool([cbse(plan("English", "1", "1", 8, { classes: [{ name: "Class 1", sections: 0, seats: 35 }] }))]);
    const [klass] = await SchoolClass.find({ tenantId: school.tenantId }).lean();
    expect(klass.capacity).toBe(35);
    expect(await Section.countDocuments({ tenantId: school.tenantId })).toBe(0);
  });

  it("starts with its timing: the usual days, and Saturday's own", async () => {
    const halfDay = [{ kind: "period" as const, label: "", start: 480, end: 520 }];
    const school = await approvedSchool([cbse(plan("English", "1", "1", 8, { week: { days: [1, 2, 3, 4, 5, 6], usual: day(8), saturday: halfDay } }))]);
    const timings = await BellSchedule.find({ tenantId: school.tenantId }).sort({ _id: 1 }).lean();
    expect(timings.map((t) => [t.days, t.slots.length, t.scope])).toEqual([
      [[1, 2, 3, 4, 5], 3, "all"],
      [[6], 1, "all"],
    ]);
  });

  it("makes a class per stream in 11 and 12", async () => {
    const school = await approvedSchool([cbse(plan("English", "11", "12", 8, { seniorStreams: ["Science", "Arts"] }))]);
    expect(await classNames(school.tenantId)).toEqual(["Class 11 Science", "Class 11 Arts", "Class 12 Science", "Class 12 Arts"]);
  });

  it("makes a class for a stream the school named itself, and for Maths", async () => {
    const school = await approvedSchool([cbse(plan("English", "11", "12", 8, { seniorStreams: ["Maths", "Agriculture"] }))]);
    expect(await classNames(school.tenantId)).toEqual(["Class 11 Maths", "Class 11 Agriculture", "Class 12 Maths", "Class 12 Agriculture"]);
  });

  it("a stream's class moves up to the same stream next year", async () => {
    const classes = ["Class 11 Maths", "Class 11 Agriculture", "Class 12 Maths", "Class 12 Agriculture"].map((className) => ({ className }));
    expect(classAfter(classes, 1)?.className).toBe("Class 12 Agriculture");
    expect(classAfter(classes, 0)?.className).toBe("Class 12 Maths");
  });

  it("a school from before plans existed still gets its classes from its range", async () => {
    const tenant = await createTenant({ name: `Old School ${serial}`, contactEmail: `old${serial}@sides.example`, approvalStatus: "pending", source: "signup" });
    await Tenant.updateOne({ _id: tenant._id }, { $set: { "profile.lowestClass": "1", "profile.highestClass": "2", "profile.boardEntries": [{ board: "CBSE", mediums: ["English"] }] } });
    await ReviewService.approve(tenant._id.toString(), new Types.ObjectId().toString());
    expect(await classNames(tenant._id.toString())).toEqual(["Class 1", "Class 2"]);
  });
});

describe("a school with two mediums", () => {
  const twoMediums = () => approvedSchool([cbse(plan("English", "1", "7", 8), plan("Hindi", "Nursery", "2", 12))]);

  it("is one school: the second medium is a side of it, not another school", async () => {
    const school = await twoMediums();
    const [side, ...none] = await childrenOf(school.tenantId);
    expect(none).toEqual([]);
    expect(side).toMatchObject({ approvalStatus: "approved", isActive: true, medium: { label: "Hindi Medium" } });
    expect(side.name).toBe((await Tenant.findById(school.tenantId).lean())?.name);
    expect((await Tenant.findById(school.tenantId).lean())?.medium?.label).toBe("English Medium");
  });

  it("gives each medium its own classes: Class 1 exists on both sides, under the same name", async () => {
    const school = await twoMediums();
    const [side] = await childrenOf(school.tenantId);
    expect(await classNames(school.tenantId)).toEqual(["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7"]);
    expect(await classNames(side._id.toString())).toEqual(["Nursery", "LKG", "UKG", "Class 1", "Class 2"]);
  });

  it("gives each medium its own timing and its own running year", async () => {
    const school = await twoMediums();
    const [side] = await childrenOf(school.tenantId);
    expect((await BellSchedule.findOne({ tenantId: school.tenantId }).lean())?.slots[0].start).toBe(480);
    expect((await BellSchedule.findOne({ tenantId: side._id }).lean())?.slots[0].start).toBe(720);
    expect(await AcademicYear.findOne({ tenantId: side._id, status: "active" }).lean()).toMatchObject({ name: "2026-2027" });
  });

  it("tells its administrator the sides, this school's first", async () => {
    const school = await twoMediums();
    const [side] = await childrenOf(school.tenantId);
    expect(school.tenant.mediums).toEqual([
      { id: school.tenantId, label: "English Medium" },
      { id: side._id.toString(), label: "Hindi Medium" },
    ]);
  });

  it("with two boards, says the board too", async () => {
    const school = await approvedSchool([cbse(plan("English", "1", "2", 8)), mp(plan("Hindi", "1", "2", 12))]);
    expect(school.tenant.mediums.map((m: { label: string }) => m.label)).toEqual(["CBSE · English Medium", "M.P. Board · Hindi Medium"]);
  });

  it("two sides of the same medium under different boards are both kept", async () => {
    const school = await approvedSchool([cbse(plan("Hindi", "1", "2", 8)), mp(plan("Hindi", "1", "2", 12))]);
    expect(await childrenOf(school.tenantId)).toHaveLength(1);
  });

  describe("moving between the sides", () => {
    it("answers for the first medium with no header", async () => {
      const school = await twoMediums();
      const res = await request(app).get("/api/v1/academics/structure").set(auth(school.token));
      expect(res.body.data.classes).toHaveLength(7);
    });

    it("answers for the side named by the header, and only that side", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const res = await request(app).get("/api/v1/academics/structure").set(auth(school.token, side._id.toString()));
      expect(res.body.data.classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "UKG", "Class 1", "Class 2"]);
    });

    it("the header naming the first medium is the same as no header", async () => {
      const school = await twoMediums();
      const res = await request(app).get("/api/v1/academics/structure").set(auth(school.token, school.tenantId));
      expect(res.body.data.classes).toHaveLength(7);
    });

    it("what is written lands on the side that is open, and the other side does not see it", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const made = await request(app).post("/api/v1/academics/departments").set(auth(school.token, side._id.toString())).send({ name: "Hindi Wing" });
      expect(made.status).toBe(201);
      const there = await request(app).get("/api/v1/academics/structure").set(auth(school.token, side._id.toString()));
      const here = await request(app).get("/api/v1/academics/structure").set(auth(school.token));
      expect(there.body.data.departments.map((d: { name: string }) => d.name)).toContain("Hindi Wing");
      expect(here.body.data.departments.map((d: { name: string }) => d.name)).not.toContain("Hindi Wing");
    });

    it("/auth/me stays the school, whichever side is open", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const me = await request(app).get("/api/v1/auth/me").set(auth(school.token, side._id.toString()));
      expect(me.body.data.tenant.id).toBe(school.tenantId);
    });

    it("refuses a side of another school", async () => {
      const school = await twoMediums();
      const other = await twoMediums();
      const [foreign] = await childrenOf(other.tenantId);
      const res = await request(app).get("/api/v1/academics/structure").set(auth(school.token, foreign._id.toString()));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("MEDIUM_NOT_FOUND");
    });

    it("refuses another whole school named as a side", async () => {
      const school = await twoMediums();
      const other = await twoMediums();
      expect((await request(app).get("/api/v1/academics/structure").set(auth(school.token, other.tenantId))).status).toBe(403);
    });

    it("refuses nonsense instead of quietly showing the wrong side", async () => {
      const school = await twoMediums();
      const res = await request(app).get("/api/v1/academics/structure").set(auth(school.token, "not-an-id"));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("MEDIUM_NOT_FOUND");
    });

    it("only the administrator can move: a colleague of the school cannot", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const email = `principal${serial}@sides.example`;
      await User.create({ name: "Principal", email, passwordHash: await passwordHash, role: "principal", tenantId: school.tenantId });
      const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
      const res = await request(app).get("/api/v1/academics/structure").set(auth(login.body.data.accessToken, side._id.toString()));
      expect(res.status).toBe(403);
      expect(login.body.data.tenant.mediums).toEqual([]);
    });

    it("someone who works on one side signs in to that side", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const email = `teacher${serial}@sides.example`;
      await User.create({ name: "Teacher", email, passwordHash: await passwordHash, role: "principal", tenantId: side._id });
      const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      const res = await request(app).get("/api/v1/academics/structure").set(auth(login.body.data.accessToken));
      expect(res.body.data.classes.map((c: { name: string }) => c.name)).toEqual(["Nursery", "LKG", "UKG", "Class 1", "Class 2"]);
    });
  });

  describe("the school is still one school to the platform", () => {
    it("the super admin's list and counts show one school, not two", async () => {
      const school = await twoMediums();
            const listed = await listTenants({} as never);
      expect(listed.filter((t) => t.name === listed.find((x) => x.id === school.tenantId)?.name)).toHaveLength(1);
      const [side] = await childrenOf(school.tenantId);
      expect(listed.some((t) => t.id === side._id.toString())).toBe(false);
      const approved = await Tenant.countDocuments({ approvalStatus: "approved", parentTenantId: null });
      expect((await statusCounts()).approved).toBe(approved);
    });

    it("suspending the school closes every side, and reactivating opens them", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const actor = new Types.ObjectId().toString();
      await ReviewService.suspend(school.tenantId, actor, "Fees not paid for a long time");
      expect((await Tenant.findById(side._id).lean())?.isActive).toBe(false);
      await ReviewService.reactivate(school.tenantId, actor);
      expect((await Tenant.findById(side._id).lean())?.isActive).toBe(true);
    });

    it("the administrator hears what happens on a side, as well as the principal of that side", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const admin = await User.findOne({ tenantId: school.tenantId, role: "school_admin" }).lean();
      const principal = await User.create({ name: "Side Principal", email: `side${serial}@sides.example`, passwordHash: await passwordHash, role: "principal", tenantId: side._id });
      await NotificationService.send(side._id.toString(), null, [{ to: "admins", kind: NOTIFICATION_KINDS[0], title: "Leave asked for" }]);
      const told = await Notification.find({ tenantId: side._id }).lean();
      expect(told.map((n) => n.userId.toString()).sort()).toEqual([admin!._id.toString(), principal._id.toString()].sort());
    });

    it("a principal of the first side does not hear about the other side", async () => {
      const school = await twoMediums();
      const [side] = await childrenOf(school.tenantId);
      const first = await User.create({ name: "First Principal", email: `first${serial}@sides.example`, passwordHash: await passwordHash, role: "principal", tenantId: school.tenantId });
      await NotificationService.send(side._id.toString(), null, [{ to: "admins", kind: NOTIFICATION_KINDS[0], title: "Leave asked for" }]);
      expect(await Notification.countDocuments({ tenantId: side._id, userId: first._id })).toBe(0);
    });
  });

  describe("a side that could not be made", () => {
    it("is made the next time the administrator's session is read, and the sides that exist are left alone", async () => {
      const school = await approvedSchool([cbse(plan("English", "1", "2", 8), plan("Hindi", "1", "2", 12))]);
      const [side] = await childrenOf(school.tenantId);
      await SchoolClass.deleteMany({ tenantId: school.tenantId, name: "Class 2" });
      await Tenant.deleteOne({ _id: side._id });
      await SchoolClass.deleteMany({ tenantId: side._id });
      await BellSchedule.deleteMany({ tenantId: side._id });
      await AcademicYear.deleteMany({ tenantId: side._id });

      const me = await request(app).get("/api/v1/auth/me").set(auth(school.token));
      expect(me.body.data.tenant.mediums).toHaveLength(2);
      const [again] = await childrenOf(school.tenantId);
      expect(await classNames(again._id.toString())).toEqual(["Class 1", "Class 2"]);
      // The class the school took away on the first side stays away.
      expect(await classNames(school.tenantId)).toEqual(["Class 1"]);
    });

    it("building a side twice changes nothing", async () => {
      const school = await twoMediums();
      const before = await classNames(school.tenantId);
      await MediumService.addMissingSides(school.tenantId);
      expect(await childrenOf(school.tenantId)).toHaveLength(1);
      expect(await classNames(school.tenantId)).toEqual(before);
    });
  });
});
