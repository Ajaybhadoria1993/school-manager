import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { NotificationService } from "../../notifications/services/notification.service";
import { ExamDuty } from "../models/ExamDuty";

/**
 * Exam duty (2026-11-27, the user: "kis room mein kaun sa teacher rahega, duty rahegi; ek room mein 1 ya 2 teacher; jaise hi assign karun teacher ko
 * pata chal jaaye ki mujhe is room mein duty hai, aur exam se related time, date, room sab information mil jaaye"). One or two teachers watch a room
 * for the whole exam; a teacher watches one room of an exam. The teacher hears it in the bell and reads it on their home: the exam, the room, who
 * else is there, who sits in it, and the days the room has papers with the times.
 */

const api = "/api/v1/exams";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
/** Still to come (the teacher's home lists the exams that are not over). Mon 15 Feb 2027 to Fri 26 Feb 2027, inside the test school's year. */
const EXAM = { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2027-02-15", endDate: "2027-02-26" };

interface Bell {
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
}
async function bell(token: string): Promise<Bell[]> {
  await NotificationService.idle();
  return (await request(app).get("/api/v1/notifications").set(auth(token))).body.data.items as Bell[];
}
const duties = async (token: string) => (await bell(token)).filter((i) => i.kind === "exam.duty");

async function setUp() {
  const s = await classroomSchool();
  const exam = (await request(app).post(api).set(auth(s.token)).send(EXAM)).body.data as { id: string };
  const fiveA = { classId: s.class5.id, sectionId: s.a.sectionId };
  await request(app)
    .put(`${api}/${exam.id}/roll-numbers`)
    .set(auth(s.token))
    .send({ rows: [{ studentId: s.asha.id, rollNumber: 1 }, { studentId: s.kabir.id, rollNumber: 2 }, { studentId: s.mira.id, rollNumber: 1 }] });
  const addRoom = (body: object) => request(app).post(`${api}/${exam.id}/rooms`).set(auth(s.token)).send(body);
  const room101 = (await addRoom({ room: "Room 101", ...fiveA, fromRoll: 1, toRoll: 30 })).body.data as { id: string };
  await addRoom({ room: "Room 101", classId: s.class1.id, sectionId: null, fromRoll: 1, toRoll: 10 });
  const room102 = (await addRoom({ room: "Room 102", ...fiveA, fromRoll: 31, toRoll: 60 })).body.data as { id: string };
  const put = (room: string, teacherIds: string[], token = s.token) => request(app).put(`${api}/${exam.id}/duties`).set(auth(token)).send({ room, teacherIds });
  const rooms = async () => (await request(app).get(`${api}/${exam.id}/rooms`).set(auth(s.token))).body.data;
  const mine = async (token: string) => {
    const res = await request(app).get(`${api}/my-duties`).set(auth(token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.items as Record<string, unknown>[];
  };
  await NotificationService.idle();
  return { s, exam, fiveA, addRoom, room101, room102, put, rooms, mine };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("exam duty", () => {
  it("names one or two teachers on duty in a room; each hears it and reads the room, the days, the times and who sits there", async () => {
    const { s, exam, put, rooms, mine } = await setUp();
    const paper = (subjectId: string, date: string, startTime: string, durationMinutes: number) => ({ subjectId, date, startTime, durationMinutes, maxMarks: 50 });
    await request(app).post(`${api}/${exam.id}/papers`).set(auth(s.token)).send({ classIds: [s.class5.id], papers: [paper(s.maths, "2027-02-15", "09:00", 180), paper(s.english, "2027-02-17", "09:00", 120)] });
    await request(app).post(`${api}/${exam.id}/papers`).set(auth(s.token)).send({ classIds: [s.class1.id], papers: [paper(s.english, "2027-02-15", "10:00", 60)] });

    // The room is matched whatever the case of its letters.
    const res = await put("room 101", [s.meena, s.dev]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ room: "Room 101", teachers: [{ id: s.meena, name: "Meena Singh" }, { id: s.dev, name: "Dev Patel" }] });
    expect((await rooms()).duties).toEqual([{ room: "Room 101", teachers: [{ id: s.meena, name: "Meena Singh" }, { id: s.dev, name: "Dev Patel" }] }]);

    const [duty] = await mine(s.tokens.meena);
    expect(duty).toMatchObject({ exam: { id: exam.id, name: "Half-Yearly Exam", startDate: "2027-02-15", endDate: "2027-02-26" }, room: "Room 101", with: ["Dev Patel"], students: 3 });
    expect(duty.seats).toEqual(
      expect.arrayContaining([
        { place: "Class 5 - A", fromRoll: 1, toRoll: 30, students: 2 },
        { place: "Class 1", fromRoll: 1, toRoll: 10, students: 1 },
      ])
    );
    expect(duty.days).toEqual([
      {
        date: "2027-02-15",
        startTime: "09:00",
        endTime: "12:00",
        papers: [
          { subject: "Mathematics", classes: ["Class 5"], startTime: "09:00", endTime: "12:00" },
          { subject: "English", classes: ["Class 1"], startTime: "10:00", endTime: "11:00" },
        ],
      },
      { date: "2027-02-17", startTime: "09:00", endTime: "11:00", papers: [{ subject: "English", classes: ["Class 5"], startTime: "09:00", endTime: "11:00" }] },
    ]);
    expect((await mine(s.tokens.dev))[0]).toMatchObject({ room: "Room 101", with: ["Meena Singh"] });
    // Not on duty: nothing. A parent reads nothing either.
    expect(await mine(s.tokens.kiran)).toEqual([]);
    expect(await mine(s.tokens.ravi)).toEqual([]);

    const [told] = await duties(s.tokens.meena);
    expect(told).toMatchObject({ title: "Exam duty: Room 101", link: "/dashboard" });
    expect(told.body).toBe("Half-Yearly Exam · 15 Feb to 26 Feb · with Dev Patel");
    expect(await duties(s.tokens.kiran)).toEqual([]);
    // The school did it: it is not told.
    expect(await duties(s.token)).toEqual([]);
  });

  it("refuses a third teacher, a teacher on duty in another room, a room that is not in the exam, and someone who is not a teacher here", async () => {
    const { s, exam, put } = await setUp();
    const three = await put("Room 101", [s.meena, s.dev, s.kiran]);
    expect(three.status).toBe(400);
    expect(details(three)).toContainEqual({ path: "teacherIds", message: "Up to 2 teachers in a room" });

    expect((await put("Room 101", [s.meena])).status).toBe(200);
    const taken = await put("Room 102", [s.dev, s.meena]);
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ code: "DUTY_TAKEN", message: "Meena Singh is on duty in Room 101 already" });

    const nowhere = await put("Room 999", [s.dev]);
    expect(nowhere.status).toBe(400);
    expect(details(nowhere)).toContainEqual({ path: "room", message: "Room 999 is not in this exam" });

    const stranger = await put("Room 102", ["6af2b7c87fdf3025aeb6d521"]);
    expect(stranger.status).toBe(400);
    expect(details(stranger)).toContainEqual({ path: "teacherIds", message: "Choose teachers of this school" });

    // A teacher of the class cannot name the duty; the list of teachers to choose from is the school's too.
    expect((await put("Room 102", [s.dev], s.tokens.meena)).status).toBe(403);
    expect((await request(app).get(`${api}/${exam.id}/teachers`).set(auth(s.tokens.meena))).status).toBe(403);
  });

  it("lists the school's teachers to choose from, by name", async () => {
    const { s, exam } = await setUp();
    const res = await request(app).get(`${api}/${exam.id}/teachers`).set(auth(s.token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.items).toEqual([
      { id: s.dev, name: "Dev Patel" },
      { id: s.kiran, name: "Kiran Rao" },
      { id: s.meena, name: "Meena Singh" },
    ]);
  });

  it("changing the teachers tells the one taken off and the one put on; an empty list leaves the room with none", async () => {
    const { s, put, rooms, mine } = await setUp();
    await put("Room 101", [s.meena]);
    expect((await put("Room 101", [s.dev])).status).toBe(200);
    expect((await duties(s.tokens.meena)).map((d) => d.title)).toEqual(["Exam duty taken off: Room 101", "Exam duty: Room 101"]);
    expect((await duties(s.tokens.dev)).map((d) => d.title)).toEqual(["Exam duty: Room 101"]);
    expect(await mine(s.tokens.meena)).toEqual([]);

    // Saved again as it is: nobody hears anything.
    await put("Room 101", [s.dev]);
    expect(await duties(s.tokens.dev)).toHaveLength(1);

    expect((await put("Room 101", [])).status).toBe(200);
    expect((await rooms()).duties).toEqual([]);
    expect((await duties(s.tokens.dev)).map((d) => d.title)).toEqual(["Exam duty taken off: Room 101", "Exam duty: Room 101"]);
  });

  it("the duty follows the room: renamed with its last run it moves; taken away with its last run it goes; it goes with the exam", async () => {
    const { s, exam, fiveA, room102, put, rooms, mine } = await setUp();
    await put("Room 102", [s.meena]);
    const renamed = await request(app).patch(`${api}/${exam.id}/rooms/${room102.id}`).set(auth(s.token)).send({ room: "Hall A", ...fiveA, fromRoll: 31, toRoll: 60 });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect((await rooms()).duties).toEqual([{ room: "Hall A", teachers: [{ id: s.meena, name: "Meena Singh" }] }]);
    expect((await mine(s.tokens.meena))[0]).toMatchObject({ room: "Hall A" });
    expect((await duties(s.tokens.meena))[0]).toMatchObject({ title: "Exam duty moved to Hall A", body: "Half-Yearly Exam · was Room 102" });

    expect((await request(app).delete(`${api}/${exam.id}/rooms/${room102.id}`).set(auth(s.token))).status).toBe(200);
    expect((await rooms()).duties).toEqual([]);
    expect(await mine(s.tokens.meena)).toEqual([]);
    expect((await duties(s.tokens.meena))[0].title).toBe("Exam duty taken off: Hall A");

    // A room with another run left keeps its duty when one run goes.
    await put("Room 101", [s.dev]);
    const runs = (await rooms()).items as { id: string; room: string }[];
    await request(app).delete(`${api}/${exam.id}/rooms/${runs.find((r) => r.room === "Room 101")!.id}`).set(auth(s.token));
    expect((await rooms()).duties).toEqual([{ room: "Room 101", teachers: [{ id: s.dev, name: "Dev Patel" }] }]);

    expect((await request(app).delete(`${api}/${exam.id}`).set(auth(s.token))).status).toBe(200);
    expect(await ExamDuty.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("an exam that is over is not on the teacher's home", async () => {
    const { s } = await setUp();
    const old = (await request(app).post(api).set(auth(s.token)).send({ name: "Quarterly Exam", type: "quarterly", startDate: "2026-07-13", endDate: "2026-07-17" })).body.data as { id: string };
    await request(app).post(`${api}/${old.id}/rooms`).set(auth(s.token)).send({ room: "Room 9", classId: s.class1.id, sectionId: null, fromRoll: 1, toRoll: 10 });
    expect((await request(app).put(`${api}/${old.id}/duties`).set(auth(s.token)).send({ room: "Room 9", teacherIds: [s.kiran] })).status).toBe(200);
    expect((await request(app).get(`${api}/my-duties`).set(auth(s.tokens.kiran))).body.data.items).toEqual([]);
  });
});

describe("the rooms carry the roll numbers of each class or section", () => {
  it("so a run is counted while it is written", async () => {
    const { s, rooms } = await setUp();
    const { rolls } = await rooms();
    expect(rolls).toEqual(
      expect.arrayContaining([
        { classId: s.class5.id, sectionId: s.a.sectionId, numbers: [1, 2] },
        { classId: s.class1.id, sectionId: null, numbers: [1] },
      ])
    );
  });
});
