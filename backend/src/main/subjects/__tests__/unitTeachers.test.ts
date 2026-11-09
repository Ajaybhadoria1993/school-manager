import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague } from "../../../test/schools";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { Notification } from "../../notifications/models/Notification";
import { NotificationService } from "../../notifications/services/notification.service";

/**
 * The teachers of a class (2026-11-06): each subject has a **main teacher** (priority 1, the one the timetable uses) and, if the school wants,
 * **backup teachers** in order (2, 3...) who manage when the main teacher does not come. The class's page saves the class teacher and every
 * subject's teachers in ONE request, all or nothing (it has a Save button now).
 */

const assignUrl = "/api/v1/subjects/allotments/teacher";
const teachersUrl = "/api/v1/subjects/allotments/teachers";
const assign = (token: string, body: object) => request(app).put(assignUrl).set(auth(token)).send(body);
const saveTeachers = (token: string, body: object) => request(app).put(teachersUrl).set(auth(token)).send(body);
const get = (token: string, unit: { classId: string; sectionId: string | null }) => request(app).get(`/api/v1/subjects/allotments?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
type Row = { subjectName: string; teacherId: string | null; teacherName: string | null; backups: { id: string; name: string }[] };
const rowOf = (res: request.Response, subject: string) => (res.body.data.rows as Row[]).find((r) => r.subjectName === subject)!;

async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  await addTiming(s.token);
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const names = ["Meena Singh", "Dev Patel", "Kiran Rao", "Anita Desai", "Rajesh Kumar", "Suman Tiwari"];
  const t: Record<string, string> = {};
  for (const [i, name] of names.entries()) t[name.split(" ")[0].toLowerCase()] = await addTeacher(s.token, name, { mobile: `90000000${String(i + 1).padStart(2, "0")}`, login: { username: `jr.${name.split(" ")[0].toLowerCase()}`, password: "Sch00l@Login1" } });
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const b = { classId: class5.id, sectionId: class5.sections[1].id };
  await saveAllotments(s.token, a, [
    { subjectId: maths, periodsPerWeek: 6, teacherId: t.meena },
    { subjectId: english, periodsPerWeek: 5 },
  ]);
  return { ...s, class5, a, b, maths, english, t };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a subject with backup teachers", () => {
  it("keeps the main teacher and the backups in the order given, and reads them back (priority 1, 2, 3)", async () => {
    const r = await ready();
    const res = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [r.t.kiran, r.t.anita] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(rowOf(res, "English")).toMatchObject({ teacherName: "Dev Patel", backups: [{ id: r.t.kiran, name: "Kiran Rao" }, { id: r.t.anita, name: "Anita Desai" }] });
    expect(rowOf(await get(r.token, r.a), "English").backups.map((b) => b.name)).toEqual(["Kiran Rao", "Anita Desai"]);
    // The order is the school's word: changing it is kept.
    const swapped = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [r.t.anita, r.t.kiran] });
    expect(rowOf(swapped, "English").backups.map((b) => b.name)).toEqual(["Anita Desai", "Kiran Rao"]);
  });

  it("a subject with no backups says so (an empty list); an empty list takes the backups off", async () => {
    const r = await ready();
    expect(rowOf(await get(r.token, r.a), "Mathematics").backups).toEqual([]);
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.dev] });
    const off = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [] });
    expect(rowOf(off, "Mathematics").backups).toEqual([]);
  });

  it("changing only the main teacher keeps the backups; saving the whole list without them keeps them too", async () => {
    const r = await ready();
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.dev, r.t.kiran] });
    const moved = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.anita });
    expect(rowOf(moved, "Mathematics")).toMatchObject({ teacherName: "Anita Desai", backups: [{ name: "Dev Patel" }, { name: "Kiran Rao" }] });
    const whole = await saveAllotments(r.token, r.a, [
      { subjectId: r.maths, periodsPerWeek: 6, teacherId: r.t.anita },
      { subjectId: r.english, periodsPerWeek: 5 },
    ]);
    expect(rowOf(whole, "Mathematics").backups.map((b) => b.name)).toEqual(["Dev Patel", "Kiran Rao"]);
  });

  it("the same list given to the class's other sections does not give them the backups", async () => {
    const r = await ready();
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.dev] });
    const same = await saveAllotments(
      r.token,
      r.a,
      [
        { subjectId: r.maths, periodsPerWeek: 6, teacherId: r.t.meena },
        { subjectId: r.english, periodsPerWeek: 5 },
      ],
      { alsoSections: [r.b.sectionId], withTeachers: true }
    );
    expect(same.status).toBe(200);
    expect(rowOf(await get(r.token, r.b), "Mathematics")).toMatchObject({ teacherName: "Meena Singh", backups: [] });
  });

  it("refuses what cannot be: no main teacher, the main teacher as a backup, one teacher twice, a teacher who has left, a teacher of another school, too many", async () => {
    const r = await ready();
    const noMain = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: null, backupTeacherIds: [r.t.dev] });
    expect(noMain.status).toBe(400);
    expect(details(noMain).map((d) => d.message)).toContain("Choose the main teacher first");

    const same = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [r.t.dev] });
    expect(details(same).map((d) => d.message)).toContain("Dev Patel is the main teacher already");
    const twice = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [r.t.kiran, r.t.kiran] });
    expect(details(twice).map((d) => d.message)).toContain("Kiran Rao is in the list twice");

    await request(app).patch(`/api/v1/staff/teachers/${r.t.anita}`).set(auth(r.token)).send({ isActive: false });
    const left = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [r.t.anita] });
    expect(details(left).map((d) => d.message)).toContain("Anita Desai is no longer teaching here");

    const other = await timetableSchool("Moonrise Public School");
    const stranger = await addTeacher(other.token, "Outsider");
    const foreign = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.dev, backupTeacherIds: [stranger] });
    expect(foreign.status).toBe(400);

    const many = await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.t.meena, backupTeacherIds: [r.t.dev, r.t.kiran, r.t.rajesh, r.t.suman, r.t.anita] });
    expect(many.status).toBe(400);
    // Nothing of that was kept.
    expect(rowOf(await get(r.token, r.a), "English").backups).toEqual([]);
  });

  it("a backup teacher is not asked to be free at the lessons: only the main teacher is (a backup may teach another class at that period)", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.b, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.t.dev }]);
    const grid = (unit: object, cells: object[]) => request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells });
    await grid(r.a, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);
    await grid(r.b, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);
    const res = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.dev] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe("the class's teachers saved in one request", () => {
  it("the class teacher and every subject's main and backup teachers, together; the answer is the class's list as it is now", async () => {
    const r = await ready();
    const res = await saveTeachers(r.token, {
      ...r.a,
      classTeacherId: r.t.dev,
      subjects: [
        { subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.kiran] },
        { subjectId: r.english, teacherId: r.t.anita, backupTeacherIds: [r.t.dev, r.t.rajesh] },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(rowOf(res, "English")).toMatchObject({ teacherName: "Anita Desai", backups: [{ name: "Dev Patel" }, { name: "Rajesh Kumar" }] });
    expect(res.body.data.classTeacher).toEqual({ id: r.t.dev, name: "Dev Patel" });
    const overview = await request(app).get(`/api/v1/students/class-overview?classId=${r.class5.id}`).set(auth(r.token));
    expect(overview.body.data.classes[0].sections.find((s: { id: string }) => s.id === r.a.sectionId).classTeacher).toEqual({ id: r.t.dev, name: "Dev Patel" });
  });

  it("a class teacher left out stays; null takes the class teacher away; a subject left out keeps its teachers", async () => {
    const r = await ready();
    await saveTeachers(r.token, { ...r.a, classTeacherId: r.t.dev, subjects: [{ subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.kiran] }] });
    const same = await saveTeachers(r.token, { ...r.a, subjects: [{ subjectId: r.english, teacherId: r.t.anita, backupTeacherIds: [] }] });
    expect(same.body.data.classTeacher).toEqual({ id: r.t.dev, name: "Dev Patel" });
    expect(rowOf(same, "Mathematics").backups.map((b) => b.name)).toEqual(["Kiran Rao"]);
    const none = await saveTeachers(r.token, { ...r.a, classTeacherId: null, subjects: [] });
    expect(none.body.data.classTeacher).toBeNull();
  });

  it("all or nothing: one bad teacher and neither the class teacher nor any subject changes", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/staff/teachers/${r.t.anita}`).set(auth(r.token)).send({ isActive: false });
    const res = await saveTeachers(r.token, {
      ...r.a,
      classTeacherId: r.t.dev,
      subjects: [
        { subjectId: r.maths, teacherId: r.t.kiran, backupTeacherIds: [] },
        { subjectId: r.english, teacherId: r.t.anita, backupTeacherIds: [] },
      ],
    });
    expect(res.status).toBe(400);
    const now = await get(r.token, r.a);
    expect(rowOf(now, "Mathematics").teacherName).toBe("Meena Singh");
    const overview = await request(app).get(`/api/v1/students/class-overview?classId=${r.class5.id}`).set(auth(r.token));
    expect(overview.body.data.classes[0].sections.find((s: { id: string }) => s.id === r.a.sectionId).classTeacher).toBeNull();
  });

  it("a bad class teacher stops the subjects too (nothing is half saved)", async () => {
    const r = await ready();
    await request(app).patch(`/api/v1/staff/teachers/${r.t.anita}`).set(auth(r.token)).send({ isActive: false });
    const res = await saveTeachers(r.token, { ...r.a, classTeacherId: r.t.anita, subjects: [{ subjectId: r.maths, teacherId: r.t.kiran, backupTeacherIds: [] }] });
    expect(res.status).toBe(400);
    expect(rowOf(await get(r.token, r.a), "Mathematics").teacherName).toBe("Meena Singh");
  });

  it("keeps the timetable's rules: a main teacher busy at a period the subject is taught is refused, and nothing changes", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.b, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.t.dev }]);
    const grid = (unit: object, cells: object[]) => request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells });
    await grid(r.a, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);
    await grid(r.b, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);
    const clash = await saveTeachers(r.token, { ...r.a, classTeacherId: r.t.kiran, subjects: [{ subjectId: r.maths, teacherId: r.t.dev, backupTeacherIds: [] }] });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("TIMETABLE_CLASHES");
    expect(rowOf(await get(r.token, r.a), "Mathematics").teacherName).toBe("Meena Singh");
    const overview = await request(app).get(`/api/v1/students/class-overview?classId=${r.class5.id}`).set(auth(r.token));
    expect(overview.body.data.classes[0].sections.find((s: { id: string }) => s.id === r.a.sectionId).classTeacher).toBeNull();
  });

  it("a subject the class does not study, a duplicate subject, a class of another school: refused", async () => {
    const r = await ready();
    const hindi = await addSubject(r.token, "Hindi");
    const unknown = await saveTeachers(r.token, { ...r.a, subjects: [{ subjectId: hindi, teacherId: r.t.dev, backupTeacherIds: [] }] });
    expect(unknown.status).toBe(400);
    expect(details(unknown).map((d) => d.message)).toContain("Class 5 - A does not study this subject");
    const twice = await saveTeachers(r.token, { ...r.a, subjects: [{ subjectId: r.maths, teacherId: r.t.dev, backupTeacherIds: [] }, { subjectId: r.maths, teacherId: r.t.kiran, backupTeacherIds: [] }] });
    expect(twice.status).toBe(400);
    const other = await timetableSchool("Moonrise Public School");
    expect((await saveTeachers(other.token, { ...r.a, subjects: [] })).status).toBe(404);
  });

  it("is for the people who run the school: the principal; not a teacher, a parent-less stranger or nobody", async () => {
    const r = await ready();
    const body = { ...r.a, subjects: [{ subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [] }] };
    expect((await saveTeachers(await addColleague(r.tenantId, "principal"), body)).status).toBe(200);
    expect((await saveTeachers(await addColleague(r.tenantId, "teacher"), body)).status).toBe(403);
    expect((await saveTeachers(await addColleague(r.tenantId, "accountant"), body)).status).toBe(403);
    expect((await request(app).put(teachersUrl).send(body)).status).toBe(401);
  });

  it("a class that is not split is its own unit (no section)", async () => {
    const r = await ready();
    const class1 = await addClass(r.token, "Class 1");
    const one = { classId: class1.id, sectionId: null };
    await saveAllotments(r.token, one, [{ subjectId: r.maths, periodsPerWeek: 5 }]);
    const res = await saveTeachers(r.token, { ...one, classTeacherId: r.t.dev, subjects: [{ subjectId: r.maths, teacherId: r.t.meena, backupTeacherIds: [r.t.kiran] }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.classTeacher.name).toBe("Dev Patel");
  });
});

describe("who is told", () => {
  async function bell(token: string) {
    await NotificationService.idle();
    return ((await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as { kind: string; title: string }[]).map((i) => i.title);
  }
  const login = async (name: string) => (await request(app).post("/api/v1/auth/login").send({ identifier: `jr.${name}`, password: "Sch00l@Login1" })).body.data.accessToken as string;

  it("a new main teacher, the one before, the new class teacher and each new backup hear of it; the others hear nothing; the same save again tells nobody", async () => {
    const r = await ready();
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: r.tenantId });
    const body = { ...r.a, classTeacherId: r.t.dev, subjects: [{ subjectId: r.english, teacherId: r.t.anita, backupTeacherIds: [r.t.kiran] }] };
    expect((await saveTeachers(r.token, body)).status).toBe(200);
    expect(await bell(await login("dev"))).toEqual(["You are the class teacher of Class 5 - A"]);
    expect(await bell(await login("anita"))).toEqual(["You teach English in Class 5 - A"]);
    expect(await bell(await login("kiran"))).toEqual(["You are the backup teacher of English in Class 5 - A"]);
    expect(await bell(await login("rajesh"))).toEqual([]);

    await Notification.deleteMany({ tenantId: r.tenantId });
    expect((await saveTeachers(r.token, body)).status).toBe(200);
    expect(await bell(await login("dev"))).toEqual([]);
    expect(await bell(await login("anita"))).toEqual([]);
    expect(await bell(await login("kiran"))).toEqual([]);
  });
});
