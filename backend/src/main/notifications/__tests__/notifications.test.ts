import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool as makeSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { User } from "../../users/models/User";
import { Notification } from "../models/Notification";
import { NotificationService } from "../services/notification.service";

/**
 * Who hears of what (docs/notifications.md): the people who run the school hear of everything that happens in it (but not of what they
 * did themselves); a teacher hears of their classes (a leave to answer, a class or subject given to them, the calendar); a parent hears of
 * their own children (the leave answered, absent or late, homework, tests and marks) and the calendar.
 */

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  childId: string | null;
  readAt: string | null;
  createdAt: string;
}

const api = "/api/v1";

async function bell(token: string, query = "") {
  await NotificationService.idle();
  const res = await request(app).get(`${api}/notifications${query}`).set(auth(token));
  expect(res.status).toBe(200);
  return res.body.data as { items: Item[]; unread: number; hasMore: boolean };
}
const kinds = async (token: string) => (await bell(token)).items.map((i) => i.kind);

/** The school of test/classroom.ts with an empty bell for everyone (making it gave Meena her class, which she was told of). */
async function classroomSchool() {
  const s = await makeSchool();
  await NotificationService.idle();
  await Notification.deleteMany({ tenantId: s.tenantId });
  return s;
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a parent's leave", () => {
  it("reaches the child's class teacher and the school, and nobody else", async () => {
    const s = await classroomSchool();
    const sent = await request(app).post(`${api}/parent/children/${s.asha.id}/leaves`).set(auth(s.tokens.ravi)).send({ fromDate: "2026-11-12", toDate: "2026-11-13", reason: "Family wedding" });
    expect(sent.status).toBe(201);

    const meena = await bell(s.tokens.meena);
    expect(meena.items).toHaveLength(1);
    expect(meena.unread).toBe(1);
    expect(meena.items[0]).toMatchObject({ kind: "leave.applied", title: "Leave request: Asha Verma", link: "/leaves", readAt: null });
    expect(meena.items[0].body).toContain("Class 5 - A");
    expect(meena.items[0].body).toContain("12 Nov to 13 Nov");
    expect(meena.items[0].body).toContain("Family wedding");
    expect(await kinds(s.tokens.admin)).toEqual(["leave.applied"]);
    for (const other of [s.tokens.dev, s.tokens.kiran, s.tokens.ravi, s.tokens.sita, s.tokens.anil]) expect(await kinds(other)).toEqual([]);
  });

  it("answered by the class teacher: the parent hears it (with the note), the school too; the teacher not of their own answer", async () => {
    const s = await classroomSchool();
    const leave = (await request(app).post(`${api}/parent/children/${s.asha.id}/leaves`).set(auth(s.tokens.ravi)).send({ fromDate: "2026-11-12", reason: "Fever" })).body.data;
    const answer = await request(app).post(`${api}/classroom/leaves/${leave.id}/decide`).set(auth(s.tokens.meena)).send({ status: "declined", note: "Exams that day" });
    expect(answer.status).toBe(200);

    const ravi = await bell(s.tokens.ravi);
    expect(ravi.items).toHaveLength(1);
    expect(ravi.items[0]).toMatchObject({ kind: "leave.decided", title: "Leave declined: Asha Verma", link: `/my-children/${s.asha.id}`, childId: s.asha.id });
    expect(ravi.items[0].body).toContain("Meena Singh");
    expect(ravi.items[0].body).toContain("Exams that day");
    const admin = await bell(s.tokens.admin);
    expect(admin.items.map((i) => i.kind)).toEqual(["leave.decided", "leave.applied"]);
    expect(admin.items[0].title).toBe("Meena Singh declined Asha Verma's leave");
    expect(await kinds(s.tokens.meena)).toEqual(["leave.applied"]);
    expect(await kinds(s.tokens.sita)).toEqual([]);
  });

  it("answered by the school: the class teacher hears it too", async () => {
    const s = await classroomSchool();
    const leave = (await request(app).post(`${api}/parent/children/${s.asha.id}/leaves`).set(auth(s.tokens.ravi)).send({ fromDate: "2026-11-12", reason: "Fever" })).body.data;
    await request(app).post(`${api}/classroom/leaves/${leave.id}/decide`).set(auth(s.tokens.admin)).send({ status: "approved" });
    expect((await bell(s.tokens.ravi)).items[0].title).toBe("Leave approved: Asha Verma");
    expect(await kinds(s.tokens.meena)).toEqual(["leave.decided", "leave.applied"]);
    expect(await kinds(s.tokens.admin)).toEqual(["leave.applied"]);
  });

  it("taken back by the parent: the class teacher and the school hear it", async () => {
    const s = await classroomSchool();
    const leave = (await request(app).post(`${api}/parent/children/${s.asha.id}/leaves`).set(auth(s.tokens.ravi)).send({ fromDate: "2026-11-12", reason: "Fever" })).body.data;
    await request(app).post(`${api}/parent/children/${s.asha.id}/leaves/${leave.id}/cancel`).set(auth(s.tokens.ravi));
    const meena = await bell(s.tokens.meena);
    expect(meena.items[0]).toMatchObject({ kind: "leave.cancelled", title: "Leave taken back: Asha Verma" });
    expect(await kinds(s.tokens.admin)).toEqual(["leave.cancelled", "leave.applied"]);
  });
});

describe("attendance", () => {
  it("the school hears the day's counts; a parent hears when their child is absent or late, once per change", async () => {
    const s = await classroomSchool();
    const today = todayInIndia();
    const save = (asha: string) =>
      request(app)
        .put(`${api}/classroom/attendance`)
        .set(auth(s.tokens.meena))
        .send({ ...s.a, date: today, marks: [{ studentId: s.asha.id, status: asha }, { studentId: s.kabir.id, status: "present" }] });
    expect((await save("absent")).status).toBe(200);

    const admin = await bell(s.tokens.admin);
    expect(admin.items[0]).toMatchObject({ kind: "attendance.saved", title: "Attendance of Class 5 - A", link: `/class-work/${s.a.classId}?section=${s.a.sectionId}&tab=attendance` });
    expect(admin.items[0].body).toContain("1 present, 1 absent, 0 late, 0 on leave");
    expect(admin.items[0].body).toContain("Meena Singh");
    const ravi = await bell(s.tokens.ravi);
    expect(ravi.items).toHaveLength(1);
    expect(ravi.items[0]).toMatchObject({ kind: "attendance.saved", title: "Asha Verma was absent", link: `/my-children/${s.asha.id}`, childId: s.asha.id });
    expect(await kinds(s.tokens.sita)).toEqual([]);
    expect(await kinds(s.tokens.meena)).toEqual([]);

    await save("absent"); // saved again, nothing changed for Asha
    expect((await bell(s.tokens.ravi)).items).toHaveLength(1);
    await save("late");
    expect((await bell(s.tokens.ravi)).items[0].title).toBe("Asha Verma came late");
  });
});

describe("the diary", () => {
  it("reaches the parents of the class and the school; saved again unchanged it says nothing more", async () => {
    const s = await classroomSchool();
    const today = todayInIndia();
    const write = (homework: string) =>
      request(app).put(`${api}/classroom/diary`).set(auth(s.tokens.dev)).send({ ...s.a, date: today, subjectId: s.english, taught: "Poem: The Rain", homework });
    expect((await write("Learn the poem")).status).toBe(200);

    for (const parent of [s.tokens.ravi, s.tokens.sita]) {
      const items = (await bell(parent)).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "diary.saved", title: "Homework in English", body: "Learn the poem" });
    }
    expect((await bell(s.tokens.ravi)).items[0].link).toBe(`/my-children/${s.asha.id}`);
    expect((await bell(s.tokens.admin)).items[0]).toMatchObject({ kind: "diary.saved", title: "English diary of Class 5 - A" });
    expect(await kinds(s.tokens.anil)).toEqual([]);
    expect(await kinds(s.tokens.meena)).toEqual([]);

    await write("Learn the poem");
    expect((await bell(s.tokens.ravi)).items).toHaveLength(1);
    await write("Learn the poem and draw the rain");
    expect((await bell(s.tokens.ravi)).items).toHaveLength(2);
  });
});

describe("tests and marks", () => {
  it("a new test, its marks and taking it off reach the parents and the school", async () => {
    const s = await classroomSchool();
    const today = todayInIndia();
    const test = (await request(app).post(`${api}/classroom/tests`).set(auth(s.tokens.meena)).send({ ...s.a, subjectId: s.maths, date: today, topic: "Fractions", maxMarks: 20 })).body.data;
    const ravi = await bell(s.tokens.ravi);
    expect(ravi.items[0].kind).toBe("test.added");
    expect(ravi.items[0].title).toMatch(/^Mathematics test on \d{1,2} [A-Z][a-z]{2}$/);
    expect(ravi.items[0].body).toBe("Fractions · out of 20");
    expect(await kinds(s.tokens.sita)).toEqual(["test.added"]);
    expect((await bell(s.tokens.admin)).items[0]).toMatchObject({ kind: "test.added", title: "Mathematics test for Class 5 - A", link: `/class-work/${s.a.classId}?section=${s.a.sectionId}&tab=tests` });

    const marks = await request(app).put(`${api}/classroom/tests/${test.id}/marks`).set(auth(s.tokens.meena)).send({ marks: [{ studentId: s.asha.id, marks: 15, absent: false }] });
    expect(marks.status).toBe(200);
    expect((await bell(s.tokens.ravi)).items[0]).toMatchObject({ kind: "marks.saved", title: "Asha Verma: 15 / 20 in Mathematics", childId: s.asha.id });
    expect(await kinds(s.tokens.sita)).toEqual(["test.added"]); // Kabir's marks are not in yet
    expect((await bell(s.tokens.admin)).items[0]).toMatchObject({ kind: "marks.saved", title: "Marks of Mathematics: Fractions" });

    await request(app).delete(`${api}/classroom/tests/${test.id}`).set(auth(s.tokens.meena));
    expect((await bell(s.tokens.sita)).items[0]).toMatchObject({ kind: "test.removed" });
    expect(await kinds(s.tokens.anil)).toEqual([]);
  });
});

describe("the calendar", () => {
  it("a holiday reaches every teacher and parent of the school, not the admin who put it there", async () => {
    const s = await classroomSchool();
    const made = await request(app).post(`${api}/classroom/calendar`).set(auth(s.tokens.admin)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10" });
    expect(made.status).toBe(201);
    for (const who of [s.tokens.meena, s.tokens.dev, s.tokens.kiran, s.tokens.ravi, s.tokens.sita, s.tokens.anil]) {
      const items = (await bell(who)).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "calendar.added", title: "Holiday: Diwali", body: "8 Nov to 10 Nov", link: "/calendar" });
    }
    expect(await kinds(s.tokens.admin)).toEqual([]);

    await request(app).delete(`${api}/classroom/calendar/${made.body.data.id}`).set(auth(s.tokens.admin));
    expect((await bell(s.tokens.ravi)).items[0]).toMatchObject({ kind: "calendar.removed", title: "Taken off the calendar: Diwali" });
  });

  it("taking a standard festival off the calendar, and bringing it back, is heard by the school; doing it twice is not", async () => {
    const s = await classroomSchool();
    const set = (shown: boolean) => request(app).put(`${api}/classroom/calendar/standard/2026-03-04-holi`).set(auth(s.tokens.admin)).send({ shown });
    expect((await set(false)).status).toBe(200);
    expect((await bell(s.tokens.ravi)).items[0]).toMatchObject({ kind: "calendar.removed", title: "Taken off the calendar: Holi", body: "4 Mar", link: "/calendar" });
    expect((await bell(s.tokens.meena)).items).toHaveLength(1);
    await set(false);
    await NotificationService.idle();
    expect((await bell(s.tokens.ravi)).items).toHaveLength(1);
    await set(true);
    expect((await bell(s.tokens.ravi)).items[0]).toMatchObject({ kind: "calendar.added", title: "Holiday: Holi" });
    expect(await kinds(s.tokens.admin)).toEqual([]);
  });

  it("a closed login hears nothing", async () => {
    const s = await classroomSchool();
    const raviId = (await request(app).get(`${api}/auth/me`).set(auth(s.tokens.ravi))).body.data.user.id as string;
    await User.updateOne({ _id: raviId }, { $set: { isActive: false } });
    await request(app).post(`${api}/classroom/calendar`).set(auth(s.tokens.admin)).send({ title: "Sports day", kind: "event", startDate: "2026-12-01" });
    await NotificationService.idle();
    expect(await Notification.countDocuments({ tenantId: s.tenantId, userId: raviId })).toBe(0);
    expect(await kinds(s.tokens.sita)).toEqual(["calendar.added"]);
  });
});

describe("a teacher given a class or a subject", () => {
  it("hears they are the class teacher; the one it was taken from hears that too", async () => {
    const s = await classroomSchool();
    const set = await request(app).put(`${api}/staff/class-teachers`).set(auth(s.tokens.admin)).send({ ...s.a, teacherId: s.dev });
    expect(set.status).toBe(200);
    expect((await bell(s.tokens.dev)).items[0]).toMatchObject({ kind: "class.assigned", title: "You are the class teacher of Class 5 - A", link: `/class-work/${s.a.classId}?section=${s.a.sectionId}` });
    expect((await bell(s.tokens.meena)).items[0]).toMatchObject({ kind: "class.assigned", title: "You are no longer the class teacher of Class 5 - A" });
    expect(await kinds(s.tokens.kiran)).toEqual([]);
    expect(await kinds(s.tokens.admin)).toEqual([]);
  });

  it("hears they teach a subject; the teacher it was taken from hears that too", async () => {
    const s = await classroomSchool();
    const given = await request(app).put(`${api}/subjects/allotments/teacher`).set(auth(s.tokens.admin)).send({ ...s.a, subjectId: s.english, teacherId: s.kiran });
    expect(given.status).toBe(200);
    expect((await bell(s.tokens.kiran)).items[0]).toMatchObject({ kind: "subject.assigned", title: "You teach English in Class 5 - A" });
    expect((await bell(s.tokens.dev)).items[0]).toMatchObject({ kind: "subject.assigned", title: "You no longer teach English in Class 5 - A" });
    expect(await kinds(s.tokens.meena)).toEqual([]);
  });
});

describe("the bell", () => {
  it("newest first in pages, with the unread count; reads one or all; another person's cannot be read", async () => {
    const s = await classroomSchool();
    for (const title of ["Diwali", "Christmas", "Holi"]) {
      await request(app).post(`${api}/classroom/calendar`).set(auth(s.tokens.admin)).send({ title, kind: "holiday", startDate: "2026-12-01" });
    }
    const first = await bell(s.tokens.meena, "?limit=2");
    expect(first.items.map((i) => i.title)).toEqual(["Holiday: Holi", "Holiday: Christmas"]);
    expect(first).toMatchObject({ unread: 3, hasMore: true });
    const older = await bell(s.tokens.meena, `?limit=2&before=${first.items[1].id}`);
    expect(older.items.map((i) => i.title)).toEqual(["Holiday: Diwali"]);
    expect(older.hasMore).toBe(false);

    const one = await request(app).post(`${api}/notifications/${first.items[0].id}/read`).set(auth(s.tokens.meena));
    expect(one.status).toBe(200);
    expect(one.body.data.unread).toBe(2);
    expect((await bell(s.tokens.meena)).items[0].readAt).not.toBeNull();

    expect((await request(app).post(`${api}/notifications/${first.items[1].id}/read`).set(auth(s.tokens.dev))).status).toBe(404);
    expect((await bell(s.tokens.meena)).unread).toBe(2);

    const all = await request(app).post(`${api}/notifications/read-all`).set(auth(s.tokens.meena));
    expect(all.body.data.unread).toBe(0);
    expect((await bell(s.tokens.meena)).unread).toBe(0);
    expect((await bell(s.tokens.dev)).unread).toBe(3);
  });
});
