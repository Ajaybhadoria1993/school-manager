import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { addClass, addSubject, addTeacher, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { AttendanceDay } from "../../classroom/models/AttendanceDay";
import { Student } from "../../students/models/Student";

/**
 * Looking at a past academic year (2026-11-08): a school admin picks a closed year and the screens of students, classes, attendance and
 * exams show THAT year, read only. The year travels in the `X-Academic-Year` header; nothing else about the API changes, and without
 * the header every answer is about the running year as before. The data of a closed year is never moved or changed by looking at it.
 */

const api = "/api/v1";
const YEAR_HEADER = "X-Academic-Year";
const as = (token: string, yearId?: string) => ({ ...auth(token), ...(yearId ? { [YEAR_HEADER]: yearId } : {}) });
const get = (token: string, path: string, yearId?: string) => request(app).get(`${api}${path}`).set(as(token, yearId));
const send = (method: "post" | "put" | "patch" | "delete", token: string, path: string, body: object = {}, yearId?: string) =>
  request(app)[method](`${api}${path}`).set(as(token, yearId)).send(body);

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

const admit = (token: string, classId: string, sectionId: string, firstName: string, mobile: string) =>
  send("post", token, "/students", {
    firstName,
    lastName: "Verma",
    gender: "Female",
    dateOfBirth: "2012-05-14",
    address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    previousSchool: { name: "Little Flower School" },
    classId,
    sectionId,
    guardians: [{ name: `Father of ${firstName}`, relation: "Father", isPrimary: true, mobile }],
  }).then((res) => {
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  });

/**
 * A school with two years. 2026-2027 is over (closed): Asha and Bina were in Class 5 - A, Chitra in Class 6 - A (the last class: she left),
 * Asha and Bina went on to Class 6 in 2027-2028, which is the running year. `old` is the closed year, `now` the running one.
 */
async function twoYears() {
  const s = await timetableSchool();
  const c5 = await addClass(s.token, "Class 5", ["A"]);
  const c6 = await addClass(s.token, "Class 6", ["A"]);
  const oldA5 = c5.sections[0].id;
  const oldA6 = c6.sections[0].id;
  const asha = await admit(s.token, c5.id, oldA5, "Asha", "9000000001");
  const bina = await admit(s.token, c5.id, oldA5, "Bina", "9000000002");
  const chitra = await admit(s.token, c6.id, oldA6, "Chitra", "9000000003");
  // Meena teaches Mathematics to Class 6 - A and is its class teacher, in the year that is about to end (the next year starts without it).
  const maths = await addSubject(s.token, "Mathematics");
  const meena = await addTeacher(s.token, "Meena Singh", { mobile: "9000000092" });
  const given = await saveAllotments(s.token, { classId: c6.id, sectionId: oldA6 }, [{ subjectId: maths, periodsPerWeek: 6, teacherId: meena }]);
  expect(given.status, JSON.stringify(given.body)).toBe(200);
  const head = await send("put", s.token, "/staff/class-teachers", { classId: c6.id, sectionId: oldA6, teacherId: meena });
  expect(head.status, JSON.stringify(head.body)).toBeLessThan(300);
  // An exam of the old year, made while it ran.
  const exam = await send("post", s.token, "/exams", { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26", schoolStart: "08:00", schoolEnd: "12:30" });
  expect(exam.status, JSON.stringify(exam.body)).toBe(201);
  // Attendance taken in the old year, for the section Chitra was in (written as the class teacher's save would).
  await AttendanceDay.create({
    tenantId: s.tenantId,
    academicYearId: s.yearId,
    classId: c6.id,
    sectionId: oldA6,
    date: new Date("2026-11-03T00:00:00.000Z"),
    marks: [{ studentId: chitra, status: "absent", reason: "Fever" }],
    markedBy: { name: "Meena Singh", role: "teacher" },
  });

  const next = (await send("post", s.token, "/academics/academic-years", { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" })).body.data as { id: string };
  const promotion = (await send("post", s.token, "/students/promotions", { toAcademicYearId: next.id })).body.data as { id: string };
  await send("post", s.token, `/students/promotions/${promotion.id}/submit`);
  await send("post", s.token, `/students/promotions/${promotion.id}/approve`);
  const activated = await send("post", s.token, `/academics/academic-years/${next.id}/activate`);
  expect(activated.status, JSON.stringify(activated.body)).toBe(200);
  return { ...s, old: s.yearId, now: next.id, c5, c6, oldA5, oldA6, asha, bina, chitra, maths, meena, examId: exam.body.data.id as string };
}
type School = Awaited<ReturnType<typeof twoYears>>;

type Row = { name: string; place: { className: string; sectionId: string | null; sectionName: string | null } };
const where = (rows: Row[]) => rows.map((r) => `${r.name} ${r.place.className}-${r.place.sectionName}`);

describe("the students of a past year", () => {
  it("without the header the list is the running year's, as always", async () => {
    const s = await twoYears();
    const res = await get(s.token, "/students?limit=50");
    expect(res.body.data.academicYear.name).toBe("2027-2028");
    expect(where(res.body.data.items)).toEqual(["Asha Verma Class 6-A", "Bina Verma Class 6-A"]);
  });

  it("with the closed year's id the list is that year's: everyone who sat in it, in the class they were in, even the one who has left", async () => {
    const s = await twoYears();
    const res = await get(s.token, "/students?limit=50", s.old);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.academicYear).toMatchObject({ id: s.old, name: "2026-2027" });
    expect(where(res.body.data.items)).toEqual(["Asha Verma Class 5-A", "Bina Verma Class 5-A", "Chitra Verma Class 6-A"]);
    expect(res.body.data.total).toBe(3);
    // The sections are the old year's own.
    expect(res.body.data.items[0].place.sectionId).toBe(s.oldA5);
  });

  it("search, class and section still work inside the past year", async () => {
    const s = await twoYears();
    expect(where((await get(s.token, `/students?classId=${s.c6.id}`, s.old)).body.data.items)).toEqual(["Chitra Verma Class 6-A"]);
    expect(where((await get(s.token, "/students?q=bina", s.old)).body.data.items)).toEqual(["Bina Verma Class 5-A"]);
    expect((await get(s.token, `/students?sectionId=${s.oldA5}`, s.old)).body.data.total).toBe(2);
  });

  it("the seat counts and the class overview are the past year's too", async () => {
    const s = await twoYears();
    expect((await get(s.token, "/students/capacity")).body.data.totals.students).toBe(2);
    const old = await get(s.token, "/students/capacity", s.old);
    expect(old.body.data.academicYear.name).toBe("2026-2027");
    expect(old.body.data.totals.students).toBe(3);
    const overview = await get(s.token, "/students/class-overview", s.old);
    expect(overview.status, JSON.stringify(overview.body)).toBe(200);
    expect(overview.body.data.academicYear.name).toBe("2026-2027");
  });

  it("a student's own page shows the year being looked at as 'this year'", async () => {
    const s = await twoYears();
    const now = (await get(s.token, `/students/${s.asha}`)).body.data;
    expect(now.place).toMatchObject({ className: "Class 6" });
    const then = (await get(s.token, `/students/${s.asha}`, s.old)).body.data;
    expect(then.place).toMatchObject({ className: "Class 5", sectionId: s.oldA5 });
    expect(then.enrolments.find((e: { current: boolean }) => e.current)).toMatchObject({ academicYear: { name: "2026-2027" } });
  });
});

describe("the classes of a past year", () => {
  it("the layout shows the old year's sections, and the class list and one class too", async () => {
    const s = await twoYears();
    const sectionIdsOf = (classes: { id: string; sections: { id: string }[] }[], classId: string) => classes.find((c) => c.id === classId)!.sections.map((x) => x.id);

    const nowLayout = (await get(s.token, "/academics/structure")).body.data;
    expect(nowLayout.academicYear.name).toBe("2027-2028");
    expect(sectionIdsOf(nowLayout.classes, s.c5.id)).not.toContain(s.oldA5);

    const oldLayout = (await get(s.token, "/academics/structure", s.old)).body.data;
    expect(oldLayout.academicYear).toMatchObject({ id: s.old, name: "2026-2027" });
    expect(sectionIdsOf(oldLayout.classes, s.c5.id)).toEqual([s.oldA5]);

    expect(sectionIdsOf((await get(s.token, "/academics/classes", s.old)).body.data.items, s.c6.id)).toEqual([s.oldA6]);
    expect((await get(s.token, `/academics/classes/${s.c5.id}`, s.old)).body.data.sections.map((x: { id: string }) => x.id)).toEqual([s.oldA5]);
  });

  it("the list of the school's years and the running year are not changed by looking at the past", async () => {
    const s = await twoYears();
    expect((await get(s.token, "/academics/academic-years/current", s.old)).body.data.year).toMatchObject({ id: s.now, status: "active" });
    const years = (await get(s.token, "/academics/academic-years", s.old)).body.data as { id: string; status: string }[];
    expect(years.map((y) => [y.id, y.status])).toEqual([[s.now, "active"], [s.old, "closed"]]);
  });
});

describe("the attendance of a past year", () => {
  const students = (s: School, sectionId: string, yearId?: string) =>
    get(s.token, `/attendance/students?classId=${s.c6.id}&sectionId=${sectionId}&from=2026-11-01&to=2026-11-07`, yearId);

  it("a section of a closed year is read with the year; the child who left is there with the marks of the days", async () => {
    const s = await twoYears();
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-08T10:00:00+05:30"));
    // Without the year the old section is history that is not opened from the running year.
    expect((await students(s, s.oldA6)).status).toBe(409);
    const res = await students(s, s.oldA6, s.old);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.label).toBe("Class 6 - A");
    expect(res.body.data.students.map((c: { name: string }) => c.name)).toEqual(["Chitra Verma"]);
    expect(res.body.data.students[0].records).toEqual([{ date: "2026-11-03", status: "absent", reason: "Fever" }]);
  });

  it("the whole class at once reads the sections of the year being looked at", async () => {
    const s = await twoYears();
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-08T10:00:00+05:30"));
    const res = await students(s, "all", s.old);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.students.map((c: { name: string; section: string }) => [c.name, c.section])).toEqual([["Chitra Verma", "A"]]);
    // The running year's Class 6 is Asha and Bina, with nothing taken yet.
    expect((await students(s, "all")).body.data.students.map((c: { name: string }) => c.name)).toEqual(["Asha Verma", "Bina Verma"]);
  });
});

describe("the exams of a past year", () => {
  it("the list is the year's own: the old year's exams with the year, none in the running year", async () => {
    const s = await twoYears();
    expect((await get(s.token, "/exams")).body.data.items).toEqual([]);
    const res = await get(s.token, "/exams", s.old);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.items.map((e: { name: string }) => e.name)).toEqual(["Half-Yearly Exam"]);
  });
});

describe("the timetable, the teachers and the subjects of a past year", () => {
  it("the timetable overview lists the old year's classes and sections; a section of the old year is opened with the year", async () => {
    const s = await twoYears();
    const unitsOf = (res: request.Response) => (res.body.data.units as { label: string; sectionId: string | null }[]).map((u) => [u.label, u.sectionId]);

    const now = await get(s.token, "/timetable/overview");
    expect(now.body.data.academicYear.name).toBe("2027-2028");
    expect(unitsOf(now).map(([label]) => label)).toEqual(["Class 5 - A", "Class 6 - A"]);
    expect(unitsOf(now).map(([, id]) => id)).not.toContain(s.oldA5);

    const old = await get(s.token, "/timetable/overview", s.old);
    expect(old.status, JSON.stringify(old.body)).toBe(200);
    expect(old.body.data.academicYear).toMatchObject({ id: s.old, name: "2026-2027" });
    expect(unitsOf(old)).toEqual([["Class 5 - A", s.oldA5], ["Class 6 - A", s.oldA6]]);

    const grid = `/timetable/grid?classId=${s.c6.id}&sectionId=${s.oldA6}`;
    expect((await get(s.token, grid)).status).toBe(409);
    const open = await get(s.token, grid, s.old);
    expect(open.status, JSON.stringify(open.body)).toBe(200);
    expect(open.body.data.unit).toMatchObject({ label: "Class 6 - A", academicYear: { name: "2026-2027" } });
  });

  it("what a class studies in the old year, and who teaches it", async () => {
    const s = await twoYears();
    const path = `/subjects/allotments?classId=${s.c6.id}&sectionId=${s.oldA6}`;
    expect((await get(s.token, path)).status).toBe(409);
    const res = await get(s.token, path, s.old);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body.data)).toContain("Mathematics");
    expect(JSON.stringify(res.body.data)).toContain(s.meena);
  });

  it("a teacher's page shows the classes they had in the year being looked at; the running year has none for them", async () => {
    const s = await twoYears();
    const path = `/staff/teachers/${s.meena}/classes`;
    expect((await get(s.token, path)).body.data).toEqual({ classTeacherOf: [], subjects: [] });
    const then = (await get(s.token, path, s.old)).body.data;
    expect(then.subjects).toHaveLength(1);
    expect(then.subjects[0]).toMatchObject({ subjectName: "Mathematics", sectionId: s.oldA6, academicYear: { name: "2026-2027" } });
    expect(then.classTeacherOf).toHaveLength(1);
    expect(then.classTeacherOf[0]).toMatchObject({ sectionId: s.oldA6 });
  });

  it("the class teacher on the class overview is the year's own", async () => {
    const s = await twoYears();
    const headOf = (res: request.Response) => (res.body.data.classes as { name: string; sections: { classTeacher: { name: string } | null }[] }[]).find((c) => c.name === "Class 6")!.sections[0].classTeacher?.name ?? null;
    expect(headOf(await get(s.token, "/students/class-overview"))).toBeNull();
    expect(headOf(await get(s.token, "/students/class-overview", s.old))).toBe("Meena Singh");
  });

  it("the teachers, the staff, the subjects and the calendar are only read too: no change is made while a past year is open", async () => {
    const s = await twoYears();
    for (const [method, path, body] of [
      ["post", "/staff/teachers", { name: "Dev Patel" }],
      ["patch", `/staff/teachers/${s.meena}`, { name: "Meena S" }],
      ["put", "/staff/class-teachers", { classId: s.c6.id, sectionId: s.oldA6, teacherId: s.meena }],
      ["post", "/staff/members", { name: "Zoya" }],
      ["post", "/subjects", { name: "Art" }],
      ["put", "/subjects/allotments", { classId: s.c6.id, sectionId: s.oldA6, rows: [] }],
      ["put", "/timetable/school-day", { slots: [] }],
      ["post", "/classroom/calendar", { title: "Holiday", kind: "holiday", startDate: "2026-12-01" }],
    ] as const) {
      const res = await send(method, s.token, path, body, s.old);
      expect(res.status, `${method} ${path}: ${JSON.stringify(res.body)}`).toBe(409);
      expect(res.body.code, `${method} ${path}`).toBe("YEAR_READ_ONLY");
    }
    // Looking at the year changed nothing: Meena is still Meena, the old allotment is still there.
    expect((await get(s.token, `/staff/teachers/${s.meena}/classes`, s.old)).body.data.subjects).toHaveLength(1);
  });

  it("the calendar is the same whichever year is open (a holiday is a date, not a session)", async () => {
    const s = await twoYears();
    const made = await send("post", s.token, "/classroom/calendar", { title: "Founders Day", kind: "event", startDate: "2026-12-01" });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const titles = async (yearId?: string) => ((await get(s.token, "/classroom/calendar?from=2026-12-01&to=2026-12-31", yearId)).body.data.items as { title: string }[]).map((e) => e.title);
    expect(await titles()).toContain("Founders Day");
    expect(await titles(s.old)).toContain("Founders Day");
  });
});

describe("a past year is only read", () => {
  it("anything that would change something is refused with the reason, and nothing changes", async () => {
    const s = await twoYears();
    const before = await Student.countDocuments({ tenantId: s.tenantId });
    for (const [method, path, body] of [
      ["post", "/students", { firstName: "Dev" }],
      ["patch", `/students/${s.asha}`, { firstName: "Asha" }],
      ["post", "/students/deactivate", { ids: [s.asha] }],
      ["put", "/academics/settings", { sectionDetailsRequired: false }],
      ["post", `/academics/classes/${s.c5.id}/sections`, { name: "B" }],
      ["post", "/exams", { name: "Annual", type: "annual", startDate: "2027-02-01" }],
      ["delete", `/exams/${s.examId}`, {}],
    ] as const) {
      const res = await send(method, s.token, path, body, s.old);
      expect(res.status, `${method} ${path}: ${JSON.stringify(res.body)}`).toBe(409);
      expect(res.body.code, `${method} ${path}`).toBe("YEAR_READ_ONLY");
      expect(res.body.message).toContain("2026-2027");
    }
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(before);
    expect((await get(s.token, "/exams", s.old)).body.data.items).toHaveLength(1);
  });

  it("two requests at the same moment each get their own year: looking at the past never leaks into someone else's screen", async () => {
    const s = await twoYears();
    const names = await Promise.all(
      Array.from({ length: 12 }, (_, i) => get(s.token, "/students?limit=50", i % 2 === 0 ? s.old : undefined).then((res) => res.body.data.academicYear.name as string))
    );
    expect(names).toEqual(Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? "2026-2027" : "2027-2028")));
  });

  it("the running year is the same as no header: it can be changed", async () => {
    const s = await twoYears();
    expect((await get(s.token, "/students?limit=50", s.now)).body.data.academicYear.name).toBe("2027-2028");
    const res = await send("post", s.token, `/academics/classes/${s.c5.id}/sections`, { name: "B" }, s.now);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });
});

describe("the year in the header is checked", () => {
  it("a year that is not a year, one that is not this school's, and one that has not started are refused", async () => {
    const s = await twoYears();
    const other = await twoYears2();
    const garbage = await get(s.token, "/students", "not-an-id");
    expect([garbage.status, garbage.body.code]).toEqual([400, "INVALID_YEAR"]);
    const stranger = await get(s.token, "/students", other.old);
    expect([stranger.status, stranger.body.code]).toEqual([404, "YEAR_NOT_FOUND"]);
    const unknown = await get(s.token, "/students", "64b64b64b64b64b64b64b64b");
    expect([unknown.status, unknown.body.code]).toEqual([404, "YEAR_NOT_FOUND"]);
    // A year that waits has no students yet: it is not something to look at.
    const waiting = (await send("post", s.token, "/academics/academic-years", { name: "2028-2029", startDate: "2028-04-01", endDate: "2029-03-31" })).body.data as { id: string };
    const early = await get(s.token, "/students", waiting.id);
    expect([early.status, early.body.code]).toEqual([409, "YEAR_NOT_STARTED"]);
  });

  it("another school's closed year shows nothing of that school", async () => {
    const s = await twoYears();
    const other = await twoYears2();
    const res = await get(s.token, "/students", other.old);
    expect(JSON.stringify(res.body)).not.toContain("Asha");
  });

  it("a page that has nothing to do with the year takes no notice of the header", async () => {
    const s = await twoYears();
    expect((await get(s.token, "/notifications", s.old)).status).toBe(200);
  });
});

/** A second school, with its own closed year (a name of its own, so the two can be told apart). */
async function twoYears2() {
  const s = await timetableSchool("Moonrise Public School");
  const c5 = await addClass(s.token, "Class 5", ["A"]);
  await admit(s.token, c5.id, c5.sections[0].id, "Zoya", "9000000099");
  const next = (await send("post", s.token, "/academics/academic-years", { name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" })).body.data as { id: string };
  const promotion = (await send("post", s.token, "/students/promotions", { toAcademicYearId: next.id })).body.data as { id: string };
  await send("post", s.token, `/students/promotions/${promotion.id}/submit`);
  await send("post", s.token, `/students/promotions/${promotion.id}/approve`);
  await send("post", s.token, `/academics/academic-years/${next.id}/activate`);
  return { ...s, old: s.yearId };
}
