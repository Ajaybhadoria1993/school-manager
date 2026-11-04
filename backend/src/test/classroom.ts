import request from "supertest";
import app from "../app";
import { addClass, addSubject, addTeacher, auth, saveAllotments, timetableSchool } from "./timetable";

/** The password of every login made here. */
export const LOGIN_PASSWORD = "Sch00l@Login1";

export const signInAs = async (identifier: string): Promise<string> =>
  (await request(app).post("/api/v1/auth/login").send({ identifier, password: LOGIN_PASSWORD })).body.data.accessToken as string;

function admit(token: string, classId: string, sectionId: string | null, firstName: string, lastName: string, guardian: object) {
  return request(app)
    .post("/api/v1/students")
    .set(auth(token))
    .send({
      firstName,
      lastName,
      gender: "Female",
      dateOfBirth: "2018-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      guardians: [guardian],
    });
}

/**
 * A school for the daily flow of parents and teachers (docs/parent-teacher-flow.md): Class 5 - A with two children of two families
 * (Asha Verma, father Ravi: login `<prefix>ravi`; Kabir Rao, mother Sita: login `<prefix>sita`), Class 1 with one child (Mira Shah); Meena
 * Singh is the class teacher of 5 - A and teaches its Mathematics (login `<prefix>meena`); Dev Patel teaches 5 - A's English and is
 * nobody's class teacher (login `<prefix>dev`); Kiran Rao teaches nothing (login `<prefix>kiran`).
 */
export async function classroomSchool(name = "Sunrise Public School", prefix = "sun.") {
  const s = await timetableSchool(name);
  const class5 = await addClass(s.token, "Class 5", ["A"]);
  const class1 = await addClass(s.token, "Class 1");
  const a = { classId: class5.id, sectionId: class5.sections[0].id };
  const maths = await addSubject(s.token, "Mathematics");
  const english = await addSubject(s.token, "English");
  const mobile = (n: number) => `9${String(name.length).padStart(2, "0")}${String(n).padStart(7, "0")}`;
  const login = (who: string) => ({ username: `${prefix}${who}`, password: LOGIN_PASSWORD });
  const meena = await addTeacher(s.token, "Meena Singh", { mobile: mobile(1), login: login("meena") });
  const dev = await addTeacher(s.token, "Dev Patel", { mobile: mobile(2), login: login("dev") });
  const kiran = await addTeacher(s.token, "Kiran Rao", { mobile: mobile(3), login: login("kiran") });
  await saveAllotments(s.token, a, [
    { subjectId: maths, periodsPerWeek: 6, teacherId: meena },
    { subjectId: english, periodsPerWeek: 5, teacherId: dev },
  ]);
  await request(app).put("/api/v1/staff/class-teachers").set(auth(s.token)).send({ ...a, teacherId: meena });
  const asha = (await admit(s.token, a.classId, a.sectionId, "Asha", "Verma", { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: mobile(11) })).body.data;
  const kabir = (await admit(s.token, a.classId, a.sectionId, "Kabir", "Rao", { name: "Sita Rao", relation: "Mother", isPrimary: true, mobile: mobile(12) })).body.data;
  const mira = (await admit(s.token, class1.id, null, "Mira", "Shah", { name: "Anil Shah", relation: "Father", isPrimary: true, mobile: mobile(13) })).body.data;
  for (const [child, who] of [[asha, "ravi"], [kabir, "sita"], [mira, "anil"]] as const) {
    await request(app).post(`/api/v1/students/guardians/${child.guardians[0].id}/login`).set(auth(s.token)).send(login(who));
  }
  return {
    ...s,
    class5,
    class1,
    a,
    one: { classId: class1.id, sectionId: null },
    maths,
    english,
    meena,
    dev,
    kiran,
    asha,
    kabir,
    mira,
    tokens: {
      admin: s.token,
      meena: await signInAs(`${prefix}meena`),
      dev: await signInAs(`${prefix}dev`),
      kiran: await signInAs(`${prefix}kiran`),
      ravi: await signInAs(`${prefix}ravi`),
      sita: await signInAs(`${prefix}sita`),
      anil: await signInAs(`${prefix}anil`),
    },
  };
}
