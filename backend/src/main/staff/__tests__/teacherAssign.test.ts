import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";

/**
 * Giving teachers their classes, from wherever the school is: a teacher's page ("give this teacher Class 5 - A's Maths"), a class's page
 * (each subject's teacher, and the class teacher) and the timetable, which reads the same list. A class teacher is one teacher for a
 * section (or a class that has none) in a year.
 */

const classTeachers = "/api/v1/staff/class-teachers";
const assignUrl = "/api/v1/subjects/allotments/teacher";
const setClassTeacher = (token: string, body: object) => request(app).put(classTeachers).set(auth(token)).send(body);
const assign = (token: string, body: object) => request(app).put(assignUrl).set(auth(token)).send(body);
const classesOf = (token: string, teacherId: string) => request(app).get(`/api/v1/staff/teachers/${teacherId}/classes`).set(auth(token));
const overview = (token: string, classId: string) => request(app).get(`/api/v1/students/class-overview?classId=${classId}`).set(auth(token));
const list = (token: string, query = "") => request(app).get(`/api/v1/staff/teachers${query}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

async function ready() {
  const s = await timetableSchool();
  const class5 = await addClass(s.token, "Class 5", ["A", "B"]);
  const class1 = await addClass(s.token, "Class 1");
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const meena = await addTeacher(s.token, "Meena Singh", { mobile: "9876543210" });
  const dev = await addTeacher(s.token, "Dev Patel", { mobile: "9876500000" });
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const b = { classId: class5.id, sectionId: class5.sections[1].id };
  const one = { classId: class1.id, sectionId: null };
  return { ...s, class5, class1, maths, english, meena, dev, a, b, one };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the class teacher", () => {
  it("is set for a section, and the class's page and the teacher's page both show it", async () => {
    const r = await ready();
    const res = await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ...r.a, label: "Class 5 - A", teacher: { id: r.meena, name: "Meena Singh" } });

    const sections = (await overview(r.token, r.class5.id)).body.data.classes[0].sections;
    expect(sections.map((s: { name: string; classTeacher: unknown }) => [s.name, s.classTeacher])).toEqual([
      ["A", { id: r.meena, name: "Meena Singh" }],
      ["B", null],
    ]);
    const mine = (await classesOf(r.token, r.meena)).body.data;
    expect(mine.classTeacherOf).toEqual([expect.objectContaining({ ...r.a, label: "Class 5 - A", academicYear: { id: r.yearId, name: "2026-2027" } })]);
    expect((await list(r.token)).body.data.items.find((t: { id: string }) => t.id === r.meena).classTeacherOf).toEqual(["Class 5 - A"]);
  });

  it("is set for a class that has no sections, on the class itself", async () => {
    const r = await ready();
    expect((await setClassTeacher(r.token, { ...r.one, teacherId: r.dev })).status).toBe(200);
    expect((await overview(r.token, r.class1.id)).body.data.classes[0].classTeacher).toEqual({ id: r.dev, name: "Dev Patel" });
  });

  it("changes to another teacher, and goes with null", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    expect((await setClassTeacher(r.token, { ...r.a, teacherId: r.dev })).body.data.teacher).toEqual({ id: r.dev, name: "Dev Patel" });
    expect((await classesOf(r.token, r.meena)).body.data.classTeacherOf).toEqual([]);
    const cleared = await setClassTeacher(r.token, { ...r.a, teacherId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.teacher).toBeNull();
    expect((await overview(r.token, r.class5.id)).body.data.classes[0].sections[0].classTeacher).toBeNull();
  });

  it("can be the class teacher of two sections (a small school), and the list says both", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    await setClassTeacher(r.token, { ...r.b, teacherId: r.meena });
    expect((await list(r.token)).body.data.items.find((t: { id: string }) => t.id === r.meena).classTeacherOf).toEqual(["Class 5 - A", "Class 5 - B"]);
  });

  it("with releaseOthers the teacher moves: they leave every other class they were the class teacher of (this year), and the answer names them", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    await setClassTeacher(r.token, { ...r.one, teacherId: r.meena });
    const moved = await setClassTeacher(r.token, { ...r.b, teacherId: r.meena, releaseOthers: true });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.data).toMatchObject({ ...r.b, label: "Class 5 - B", teacher: { id: r.meena, name: "Meena Singh" } });
    expect([...(moved.body.data.released as string[])].sort()).toEqual(["Class 1", "Class 5 - A"]);
    // Only Class 5 - B is hers now: the others have no class teacher.
    expect((await classesOf(r.token, r.meena)).body.data.classTeacherOf).toEqual([expect.objectContaining({ ...r.b, label: "Class 5 - B" })]);
    const sections = (await overview(r.token, r.class5.id)).body.data.classes[0].sections;
    expect(sections.map((s: { name: string; classTeacher: unknown }) => [s.name, s.classTeacher])).toEqual([["A", null], ["B", { id: r.meena, name: "Meena Singh" }]]);
    expect((await overview(r.token, r.class1.id)).body.data.classes[0].classTeacher).toBeNull();
  });

  it("releaseOthers also replaces the class teacher who was there, and leaves other teachers' classes alone", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    await setClassTeacher(r.token, { ...r.b, teacherId: r.dev });
    const moved = await setClassTeacher(r.token, { ...r.b, teacherId: r.meena, releaseOthers: true });
    expect(moved.body.data.released).toEqual(["Class 5 - A"]);
    expect((await classesOf(r.token, r.dev)).body.data.classTeacherOf).toEqual([]);
    expect((await classesOf(r.token, r.meena)).body.data.classTeacherOf.map((u: { label: string }) => u.label)).toEqual(["Class 5 - B"]);
  });

  it("releaseOthers for a teacher with no other class releases nothing; without it a teacher keeps all their classes (a small school)", async () => {
    const r = await ready();
    const first = await setClassTeacher(r.token, { ...r.a, teacherId: r.meena, releaseOthers: true });
    expect(first.body.data.released).toEqual([]);
    const second = await setClassTeacher(r.token, { ...r.b, teacherId: r.meena });
    expect(second.body.data.released).toBeUndefined();
    expect((await classesOf(r.token, r.meena)).body.data.classTeacherOf).toHaveLength(2);
  });

  it("a refused request releases nothing: a teacher who has left is not made the class teacher, and the others keep their classes", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.dev });
    await setClassTeacher(r.token, { ...r.one, teacherId: r.meena });
    // Meena has a class, so she cannot leave: give it up, then she leaves.
    await setClassTeacher(r.token, { ...r.one, teacherId: null });
    await request(app).patch(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token)).send({ isActive: false });
    const refused = await setClassTeacher(r.token, { ...r.b, teacherId: r.meena, releaseOthers: true });
    expect(refused.status).toBe(400);
    expect((await classesOf(r.token, r.dev)).body.data.classTeacherOf).toHaveLength(1);
  });

  it("refuses a teacher who has left, one of another school, a class with sections without one, and a section of another class", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonrise Public School");
    const stranger = await addTeacher(other.token, "Stranger");
    const gone = await addTeacher(r.token, "Gone Teacher");
    await request(app).patch(`/api/v1/staff/teachers/${gone}`).set(auth(r.token)).send({ isActive: false });

    const left = await setClassTeacher(r.token, { ...r.a, teacherId: gone });
    expect(left.status).toBe(400);
    expect(details(left)).toEqual([{ path: "teacherId", message: "Gone Teacher is no longer teaching here" }]);
    const foreign = await setClassTeacher(r.token, { ...r.a, teacherId: stranger });
    expect(foreign.status).toBe(400);
    expect(details(foreign)).toEqual([{ path: "teacherId", message: "Choose a teacher from your school's list" }]);
    expect((await setClassTeacher(r.token, { classId: r.class5.id, sectionId: null, teacherId: r.meena })).body.code).toBe("UNIT_NEEDS_SECTION");
    expect((await setClassTeacher(r.token, { classId: r.class1.id, sectionId: r.a.sectionId, teacherId: r.meena })).status).toBe(404);
    expect((await setClassTeacher(r.token, { classId: r.class5.id, teacherId: r.meena })).status).toBe(400);
  });

  it("is let go when the teacher leaves, and goes to the new teacher when the classes are given to one", async () => {
    const r = await ready();
    await setClassTeacher(r.token, { ...r.a, teacherId: r.meena });
    await setClassTeacher(r.token, { ...r.b, teacherId: r.dev });

    const replace = await request(app).post(`/api/v1/timetable/teachers/${r.dev}/replace`).set(auth(r.token)).send({ withTeacherId: r.meena, deactivate: false });
    expect(replace.status).toBe(200);
    expect((await overview(r.token, r.class5.id)).body.data.classes[0].sections.map((s: { classTeacher: { name: string } | null }) => s.classTeacher?.name ?? null)).toEqual(["Meena Singh", "Meena Singh"]);

    expect((await request(app).patch(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token)).send({ isActive: false })).status).toBe(200);
    expect((await overview(r.token, r.class5.id)).body.data.classes[0].sections.map((s: { classTeacher: unknown }) => s.classTeacher)).toEqual([null, null]);
  });

  it("is for the people who run the school", async () => {
    const r = await ready();
    const teacherLogin = await addTeacher(r.token, "Signs In", { mobile: "9000000001", login: { username: "signs.in", password: "Sch00l@Teach1" } });
    expect(teacherLogin).toBeTruthy();
    const session = await request(app).post("/api/v1/auth/login").send({ identifier: "signs.in", password: "Sch00l@Teach1" });
    expect((await setClassTeacher(session.body.data.accessToken, { ...r.a, teacherId: r.meena })).status).toBe(403);
  });
});

describe("giving a teacher a subject of a class", () => {
  it("names the teacher of a subject the section already studies, and leaves everything else as it was", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6 }, { subjectId: r.english, periodsPerWeek: 5, teacherId: r.dev }]);
    const res = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.meena });
    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((row: { subjectName: string; periodsPerWeek: number; teacherName: string | null }) => [row.subjectName, row.periodsPerWeek, row.teacherName])).toEqual([
      ["Mathematics", 6, "Meena Singh"],
      ["English", 5, "Dev Patel"],
    ]);
    const mine = (await classesOf(r.token, r.meena)).body.data.subjects;
    expect(mine).toEqual([expect.objectContaining({ ...r.a, label: "Class 5 - A", subjectId: r.maths, subjectName: "Mathematics", periodsPerWeek: 6 })]);
    expect((await request(app).get(`/api/v1/staff/teachers/${r.meena}`).set(auth(r.token))).body.data.load).toEqual({ sections: 1, periodsAllotted: 6 });
  });

  it("adds a subject the section does not study yet, with its periods a week; without them it says so", async () => {
    const r = await ready();
    const missing = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.meena });
    expect(missing.status).toBe(400);
    expect(details(missing)).toEqual([{ path: "periodsPerWeek", message: "Enter the periods a week: Class 5 - A does not study Mathematics yet" }]);

    const res = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.meena, periodsPerWeek: 6 });
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([expect.objectContaining({ subjectName: "Mathematics", periodsPerWeek: 6, teacherName: "Meena Singh" })]);
  });

  it("says how many of a subject's periods a lesson of the class's timetable has been placed in (the teacher's page shows what is still to place)", async () => {
    const r = await ready();
    await addTiming(r.token);
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6 }, { subjectId: r.english, periodsPerWeek: 5 }]);
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.meena });
    await assign(r.token, { ...r.a, subjectId: r.english, teacherId: r.meena });
    const placed = async () => Object.fromEntries((await classesOf(r.token, r.meena)).body.data.subjects.map((s: { subjectName: string; placedPeriods: number }) => [s.subjectName, s.placedPeriods]));
    // Given, but no period of the class's week has a lesson of it yet: nothing is in the teacher's week.
    expect(await placed()).toEqual({ Mathematics: 0, English: 0 });

    const grid = request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({
      ...r.a,
      cells: [
        { day: 1, period: 1, lessons: [{ subjectId: r.maths }] },
        { day: 2, period: 1, lessons: [{ subjectId: r.maths }] },
        { day: 3, period: 2, lessons: [{ subjectId: r.english }] },
      ],
    });
    expect((await grid).status).toBe(200);
    expect(await placed()).toEqual({ Mathematics: 2, English: 1 });
    // Another section's timetable does not count for this one.
    expect((await assign(r.token, { ...r.b, subjectId: r.maths, teacherId: r.meena, periodsPerWeek: 4 })).status).toBe(200);
    const sections = (await classesOf(r.token, r.meena)).body.data.subjects as { label: string; subjectName: string; placedPeriods: number }[];
    expect(sections.find((s) => s.label === "Class 5 - B" && s.subjectName === "Mathematics")?.placedPeriods).toBe(0);
  });

  it("works for a class without sections", async () => {
    const r = await ready();
    expect((await assign(r.token, { ...r.one, subjectId: r.english, teacherId: r.dev, periodsPerWeek: 4 })).status).toBe(200);
    expect((await classesOf(r.token, r.dev)).body.data.subjects).toEqual([expect.objectContaining({ classId: r.class1.id, sectionId: null, label: "Class 1", subjectName: "English" })]);
  });

  it("takes the teacher off with null: the subject stays, without a teacher", async () => {
    const r = await ready();
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.meena }]);
    const res = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([expect.objectContaining({ subjectName: "Mathematics", periodsPerWeek: 6, teacherId: null })]);
    expect((await classesOf(r.token, r.meena)).body.data.subjects).toEqual([]);
  });

  it("keeps the timetable's rules: a teacher busy at a period the subject is taught is refused, and nothing changes", async () => {
    const r = await ready();
    await addTiming(r.token);
    await saveAllotments(r.token, r.a, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.meena }]);
    await saveAllotments(r.token, r.b, [{ subjectId: r.maths, periodsPerWeek: 6, teacherId: r.dev }]);
    const grid = (unit: object, cells: object[]) => request(app).put("/api/v1/timetable/grid").set(auth(r.token)).send({ ...unit, cells });
    await grid(r.a, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);
    await grid(r.b, [{ day: 1, period: 1, lessons: [{ subjectId: r.maths }] }]);

    const clash = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: r.dev });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("TIMETABLE_CLASHES");
    expect(clash.body.message).toBe("Dev Patel is teaching Class 5 - B (Mathematics) at the same time");
    expect((await classesOf(r.token, r.meena)).body.data.subjects).toHaveLength(1);
  });

  it("refuses a teacher who has left, a subject of another school, and another school's class", async () => {
    const r = await ready();
    const gone = await addTeacher(r.token, "Gone Teacher");
    await request(app).patch(`/api/v1/staff/teachers/${gone}`).set(auth(r.token)).send({ isActive: false });
    const left = await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: gone, periodsPerWeek: 5 });
    expect(left.status).toBe(400);
    expect(details(left).map((d) => d.message)).toContain("Gone Teacher is no longer teaching here");

    const other = await timetableSchool("Moonrise Public School");
    const theirSubject = await addSubject(other.token, "Sanskrit");
    expect((await assign(r.token, { ...r.a, subjectId: theirSubject, teacherId: r.meena, periodsPerWeek: 5 })).status).toBe(400);
    expect((await assign(other.token, { ...r.a, subjectId: r.maths, teacherId: null })).status).toBe(404);
  });
});

describe("finding a teacher", () => {
  async function staffRoom() {
    const r = await ready();
    const post = (body: object) => request(app).post("/api/v1/staff/teachers").set(auth(r.token)).send(body);
    const asha = (await post({ name: "Asha Rao", mobile: "9000000011", email: "asha@school.example", gender: "Female", designation: "PGT (Post graduate teacher)", employmentType: "full_time", subjectIds: [r.maths], login: { username: "asha.rao_12", password: "Sch00l@Teach1" } })).body.data.id;
    const ravi = (await post({ name: "Ravi Kumar", mobile: "9000000012", gender: "Male", designation: "TGT (Trained graduate teacher)", employmentType: "part_time", subjectIds: [r.english] })).body.data.id;
    await setClassTeacher(r.token, { ...r.b, teacherId: ravi });
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: asha, periodsPerWeek: 6 });
    return { ...r, asha, ravi };
  }
  const names = (res: request.Response) => (res.body.data.items as { name: string }[]).map((t) => t.name);

  it("by what they can teach, their post, how they are employed and their gender", async () => {
    const r = await staffRoom();
    expect(names(await list(r.token, `?subjectId=${r.maths}`))).toEqual(["Asha Rao"]);
    expect(names(await list(r.token, `?designation=${encodeURIComponent("TGT (Trained graduate teacher)")}`))).toEqual(["Ravi Kumar"]);
    expect(names(await list(r.token, "?employmentType=part_time"))).toEqual(["Ravi Kumar"]);
    expect(names(await list(r.token, "?gender=Female"))).toEqual(["Asha Rao"]);
  });

  it("by their login: has one, has none, closed", async () => {
    const r = await staffRoom();
    expect(names(await list(r.token, "?login=with"))).toEqual(["Asha Rao"]);
    expect(names(await list(r.token, "?login=without"))).toEqual(["Dev Patel", "Meena Singh", "Ravi Kumar"]);
    expect(names(await list(r.token, "?login=closed"))).toEqual([]);
    // She leaves (her class goes first: a teacher with classes cannot leave), and her login closes.
    await assign(r.token, { ...r.a, subjectId: r.maths, teacherId: null });
    expect((await request(app).patch(`/api/v1/staff/teachers/${r.asha}`).set(auth(r.token)).send({ isActive: false })).status).toBe(200);
    expect(names(await list(r.token, "?status=all&login=closed"))).toEqual(["Asha Rao"]);
  });

  it("by a class they teach or are the class teacher of, and by being a class teacher at all", async () => {
    const r = await staffRoom();
    expect(names(await list(r.token, `?classId=${r.class5.id}`))).toEqual(["Asha Rao", "Ravi Kumar"]);
    expect(names(await list(r.token, `?classId=${r.class1.id}`))).toEqual([]);
    expect(names(await list(r.token, "?classTeacher=yes"))).toEqual(["Ravi Kumar"]);
    expect(names(await list(r.token, "?classTeacher=no"))).toEqual(["Asha Rao", "Dev Patel", "Meena Singh"]);
  });

  it("by name, mobile, code, email or username in the search box", async () => {
    const r = await staffRoom();
    expect(names(await list(r.token, "?search=asha@school"))).toEqual(["Asha Rao"]);
    expect(names(await list(r.token, "?search=asha.rao_1"))).toEqual(["Asha Rao"]);
    expect(names(await list(r.token, "?search=9000000012"))).toEqual(["Ravi Kumar"]);
    expect(names(await list(r.token, "?search=kumar"))).toEqual(["Ravi Kumar"]);
  });

  it("counts the staff room for the tiles on top: teaching, class teachers, given nothing yet, and those who left", async () => {
    const r = await staffRoom();
    const gone = await addTeacher(r.token, "Gone Teacher");
    await request(app).patch(`/api/v1/staff/teachers/${gone}`).set(auth(r.token)).send({ isActive: false });
    const res = await request(app).get("/api/v1/staff/teachers/summary").set(auth(r.token));
    expect(res.status).toBe(200);
    // Teaching: Meena, Dev, Asha (Maths of 5-A) and Ravi (class teacher of 5-B). Given nothing: Meena and Dev. Left: Gone Teacher.
    expect(res.body.data).toEqual({ teaching: 4, classTeachers: 1, withoutClasses: 2, left: 1 });
    // A teacher signed in does not get the counts.
    const session = await request(app).post("/api/v1/auth/login").send({ identifier: "asha.rao_12", password: "Sch00l@Teach1" });
    expect((await request(app).get("/api/v1/staff/teachers/summary").set(auth(session.body.data.accessToken))).status).toBe(403);
  });

  it("refuses a filter that could never match, in words", async () => {
    const r = await staffRoom();
    expect((await list(r.token, "?login=maybe")).status).toBe(400);
    expect((await list(r.token, "?subjectId=nope")).status).toBe(400);
    expect((await list(r.token, "?gender=x")).status).toBe(400);
  });
});

describe("changing a teacher's username", () => {
  const PASSWORD = "Sch00l@Teach1";
  const changeUsername = (token: string, id: string, username: string) => request(app).patch(`/api/v1/staff/teachers/${id}/login`).set(auth(token)).send({ username });
  const signIn = (identifier: string) => request(app).post("/api/v1/auth/login").send({ identifier, password: PASSWORD });

  it("changes it: the new one signs in, the old one does not, the password stays", async () => {
    const r = await ready();
    const id = await addTeacher(r.token, "Asha Rao", { mobile: "9000000011", login: { username: "asha.rao_12", password: PASSWORD } });
    const res = await changeUsername(r.token, id, "Asha.Rao");
    expect(res.status).toBe(200);
    expect(res.body.data.login).toEqual({ username: "asha.rao", isActive: true });
    expect((await signIn("asha.rao")).status).toBe(200);
    expect((await signIn("asha.rao_12")).status).toBe(401);
  });

  it("refuses one that is someone else's (any school), with free ones; its own is fine", async () => {
    const r = await ready();
    const other = await timetableSchool("Moonrise Public School");
    await addTeacher(other.token, "Asha Other", { mobile: "9000000099", login: { username: "asha.rao", password: PASSWORD } });
    const id = await addTeacher(r.token, "Asha Rao", { mobile: "9000000011", login: { username: "asha.rao_12", password: PASSWORD } });
    const taken = await changeUsername(r.token, id, "asha.rao");
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("USERNAME_TAKEN");
    expect(details(taken)).toEqual([{ path: "username", message: expect.stringMatching(/asha\.rao_\d{2,3}/) }]);
    expect((await changeUsername(r.token, id, "asha.rao_12")).status).toBe(200);
  });

  it("needs a login to change, and a username that could be one", async () => {
    const r = await ready();
    const none = await changeUsername(r.token, r.meena, "meena.singh");
    expect(none.status).toBe(409);
    expect(none.body.code).toBe("TEACHER_HAS_NO_LOGIN");
    const id = await addTeacher(r.token, "Asha Rao", { mobile: "9000000011", login: { username: "asha.rao_12", password: PASSWORD } });
    expect(details(await changeUsername(r.token, id, "9x"))).toEqual([expect.objectContaining({ path: "username" })]);
  });
});
