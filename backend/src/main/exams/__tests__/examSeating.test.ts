import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addClass, auth } from "../../../test/timetable";
import { ExamRoom } from "../models/ExamRoom";

/**
 * The children of an exam and where they sit (2026-11-27, the user: "ek tab jismein sab bacche hon, filter laga ho, har bacche ka naam, father
 * name, uska roll number; admission ke time roll number nahi diya to yahan de sakein; ek tab Room number: kitne se kitne bacche kis room mein; yeh
 * sab parent ko bhi jaayega"). The roll number is the child's own in their class (the admission's); a room holds a run of roll numbers of a class
 * (or section). A parent sees their child's roll number and room with the exam.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-14", endDate: "2026-09-26" };

async function setUp(examBody: object = {}) {
  const s = await classroomSchool();
  const exam = (await request(app).post(api).set(auth(s.token)).send({ ...EXAM, ...examBody })).body.data as { id: string };
  const roster = (query: string, token = s.token) => request(app).get(`${api}/${exam.id}/students?${query}`).set(auth(token));
  const rolls = (rows: object[]) => request(app).put(`${api}/${exam.id}/roll-numbers`).set(auth(s.token)).send({ rows });
  const addRoom = (body: object) => request(app).post(`${api}/${exam.id}/rooms`).set(auth(s.token)).send(body);
  const rooms = async () => (await request(app).get(`${api}/${exam.id}/rooms`).set(auth(s.token))).body.data;
  const fiveA = { classId: s.class5.id, sectionId: s.a.sectionId };
  return { s, exam, roster, rolls, addRoom, rooms, fiveA };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the children of an exam", () => {
  it("lists a class's children (or one section's) with their father's name, roll number and room; a class the exam is not for is refused", async () => {
    const { s, roster } = await setUp();
    const res = await roster(`classId=${s.class5.id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ classId: s.class5.id, className: "Class 5", sections: [{ id: s.a.sectionId, name: "A" }] });
    const rows = res.body.data.items as { name: string; fatherName: string | null; rollNumber: number | null; room: string | null; sectionName: string | null }[];
    expect(rows.map((r) => [r.name, r.fatherName, r.sectionName, r.room])).toEqual([
      ["Asha Verma", "Ravi Verma", "A", null],
      ["Kabir Rao", null, "A", null],
    ]);
    expect((await roster(`classId=${s.class5.id}&sectionId=${s.a.sectionId}`)).body.data.items).toHaveLength(2);

    const nine = await addClass(s.token, "Class 9");
    const scoped = await request(app).post(api).set(auth(s.token)).send({ ...EXAM, name: "Unit Test", type: "unit_test", scope: "classes", classIds: [s.class1.id] });
    const refused = await request(app).get(`${api}/${scoped.body.data.id}/students?classId=${nine.id}`).set(auth(s.token));
    expect(refused.status).toBe(400);
    expect(details(refused)).toContainEqual({ path: "classId", message: "Class 9 is not in this exam" });
  });

  it("gives roll numbers to the children who have none (and changes or swaps them), each used once in a section", async () => {
    const { s, roster, rolls } = await setUp();
    expect((await rolls([{ studentId: s.asha.id, rollNumber: 1 }, { studentId: s.kabir.id, rollNumber: 2 }])).status).toBe(200);
    const order = async () => ((await roster(`classId=${s.class5.id}`)).body.data.items as { name: string; rollNumber: number }[]).map((r) => [r.name, r.rollNumber]);
    expect(await order()).toEqual([["Asha Verma", 1], ["Kabir Rao", 2]]);
    // Swapped in one save.
    expect((await rolls([{ studentId: s.asha.id, rollNumber: 2 }, { studentId: s.kabir.id, rollNumber: 1 }])).status).toBe(200);
    expect(await order()).toEqual([["Kabir Rao", 1], ["Asha Verma", 2]]);

    const twice = await rolls([{ studentId: s.asha.id, rollNumber: 3 }, { studentId: s.kabir.id, rollNumber: 3 }]);
    expect(twice.status).toBe(400);
    expect(details(twice)).toContainEqual({ path: "rows.1.rollNumber", message: "Roll number 3 is given twice in Class 5 - A" });
    const taken = await rolls([{ studentId: s.asha.id, rollNumber: 1 }]);
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: "ROLL_NUMBER_TAKEN", message: "Roll number 1 of Class 5 - A is Kabir Rao's" });
    // Nothing was changed by a refusal.
    expect(await order()).toEqual([["Kabir Rao", 1], ["Asha Verma", 2]]);

    // A child of another class gets their own section's numbers: Mira can be 1 in Class 1.
    expect((await rolls([{ studentId: s.mira.id, rollNumber: 1 }])).status).toBe(200);
    // Cleared.
    expect((await rolls([{ studentId: s.asha.id, rollNumber: null }])).status).toBe(200);
    expect(await order()).toEqual([["Kabir Rao", 1], ["Asha Verma", null]]);
  });
});

describe("a child of a class the exam is not for", () => {
  it("cannot be given a roll number from it", async () => {
    const s = await classroomSchool();
    const exam = (await request(app).post(api).set(auth(s.token)).send({ ...EXAM, scope: "classes", classIds: [s.class1.id] })).body.data;
    const res = await request(app).put(`${api}/${exam.id}/roll-numbers`).set(auth(s.token)).send({ rows: [{ studentId: s.asha.id, rollNumber: 4 }] });
    expect(res.status).toBe(400);
    expect(details(res)).toContainEqual({ path: "rows.0.studentId", message: "Asha Verma is not in a class of this exam" });
  });
});

describe("rooms", () => {
  it("a room holds a run of roll numbers of a class or section; the children in it are counted, and the ones without a room are said", async () => {
    const { s, exam, rolls, addRoom, rooms, roster, fiveA } = await setUp();
    await rolls([{ studentId: s.asha.id, rollNumber: 1 }, { studentId: s.kabir.id, rollNumber: 2 }, { studentId: s.mira.id, rollNumber: 1 }]);
    const made = await addRoom({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 30 });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body.data).toMatchObject({ room: "Room 101", className: "Class 5", sectionName: "A", fromRoll: 1, toRoll: 30, students: 2 });

    const list = await rooms();
    expect(list.items.map((r: { room: string; students: number }) => [r.room, r.students])).toEqual([["Room 101", 2]]);
    expect(list.left).toEqual([{ classId: s.class1.id, className: "Class 1", sectionId: null, sectionName: null, withoutRoom: 1, withoutRoll: 0 }]);
    expect(((await roster(`classId=${s.class5.id}`)).body.data.items as { room: string }[]).map((r) => r.room)).toEqual(["Room 101", "Room 101"]);

    // Narrowed: Kabir (roll 2) has no room now.
    const changed = await request(app).patch(`${api}/${exam.id}/rooms/${made.body.data.id}`).set(auth(s.token)).send({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 1 });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({ toRoll: 1, students: 1 });
    expect((await rooms()).left).toContainEqual({ classId: s.class5.id, className: "Class 5", sectionId: s.a.sectionId, sectionName: "A", withoutRoom: 1, withoutRoll: 0 });
  });

  it("refuses an overlap with another room, a last roll before the first, a class with sections without its section, and a class the exam is not for", async () => {
    const { s, addRoom, fiveA } = await setUp();
    await addRoom({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 30 });
    const overlap = await addRoom({ room: "Room 102", ...fiveA, fromRoll: 20, toRoll: 40 });
    expect(overlap.status).toBe(409);
    expect(overlap.body).toMatchObject({ code: "ROOM_OVERLAP", message: "Class 5 - A roll 1 to 30 is in Room 101 already" });
    // The next run is fine, in another room or the same one.
    expect((await addRoom({ room: "Room 102", ...fiveA, fromRoll: 31, toRoll: 60 })).status).toBe(201);

    const backwards = await addRoom({ room: "Room 103", classId: s.class1.id, sectionId: null, fromRoll: 10, toRoll: 5 });
    expect(backwards.status).toBe(400);
    expect(details(backwards)).toContainEqual({ path: "toRoll", message: "The last roll number cannot be before the first" });
    const noSection = await addRoom({ room: "Room 103", classId: s.class5.id, sectionId: null, fromRoll: 1, toRoll: 5 });
    expect(noSection.status).toBe(400);
    expect(details(noSection)).toContainEqual({ path: "sectionId", message: "Choose the section" });
    const noName = await addRoom({ room: "  ", classId: s.class1.id, sectionId: null, fromRoll: 1, toRoll: 5 });
    expect(noName.status).toBe(400);
    expect(details(noName)).toContainEqual({ path: "room", message: "Enter the room" });

    const nine = await addClass(s.token, "Class 9");
    const scoped = (await request(app).post(api).set(auth(s.token)).send({ ...EXAM, name: "Unit Test", type: "unit_test", scope: "classes", classIds: [s.class1.id] })).body.data;
    const outside = await request(app).post(`${api}/${scoped.id}/rooms`).set(auth(s.token)).send({ room: "Room 1", classId: nine.id, sectionId: null, fromRoll: 1, toRoll: 5 });
    expect(outside.status).toBe(400);
    expect(details(outside)).toContainEqual({ path: "classId", message: "Class 9 is not in this exam" });
  });

  it("takes a room away, and an exam's rooms go with the exam", async () => {
    const { s, exam, addRoom, rooms, fiveA } = await setUp();
    const made = (await addRoom({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 30 })).body.data as { id: string };
    expect((await request(app).delete(`${api}/${exam.id}/rooms/${made.id}`).set(auth(s.token))).status).toBe(200);
    expect((await rooms()).items).toEqual([]);
    await addRoom({ room: "Room 102", ...fiveA, fromRoll: 1, toRoll: 30 });
    expect((await request(app).delete(`${api}/${exam.id}`).set(auth(s.token))).status).toBe(200);
    expect(await ExamRoom.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });
});

describe("the parent sees it with the exam", () => {
  it("their child's roll number and room, with the exam's days and timetable", async () => {
    const { s, rolls, addRoom, fiveA } = await setUp();
    await rolls([{ studentId: s.asha.id, rollNumber: 1 }, { studentId: s.kabir.id, rollNumber: 2 }]);
    await addRoom({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 1 });
    const asha = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/exams`).set(auth(s.tokens.ravi))).body.data.items[0];
    expect(asha).toMatchObject({ name: "Half-Yearly Exam", startDate: "2026-09-14", endDate: "2026-09-26", seat: { rollNumber: 1, room: "Room 101" } });
    const kabir = (await request(app).get(`/api/v1/parent/children/${s.kabir.id}/exams`).set(auth(s.tokens.sita))).body.data.items[0];
    expect(kabir.seat).toEqual({ rollNumber: 2, room: null });
  });

  it("an exam for other classes is not their child's", async () => {
    const s = await classroomSchool();
    await request(app).post(api).set(auth(s.token)).send({ ...EXAM, name: "Class 1 Test", type: "class_test", scope: "classes", classIds: [s.class1.id] });
    const asha = (await request(app).get(`/api/v1/parent/children/${s.asha.id}/exams`).set(auth(s.tokens.ravi))).body.data.items as { name: string }[];
    expect(asha.map((e) => e.name)).toEqual([]);
    const mira = (await request(app).get(`/api/v1/parent/children/${s.mira.id}/exams`).set(auth(s.tokens.anil))).body.data.items as { name: string }[];
    expect(mira.map((e) => e.name)).toEqual(["Class 1 Test"]);
  });
});
