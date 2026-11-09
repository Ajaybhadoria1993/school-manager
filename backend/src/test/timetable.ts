import request from "supertest";
import app from "../app";
import { Tenant } from "../main/tenants/models/Tenant";
import { createSchool, type SchoolSession } from "./schools";

/** What the tests of subjects, teachers and timetables share: a school with a year and classes, and the calls that fill it. */

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * The school's day as its head wrote it: school from 08:30, three periods of 40 minutes, lunch 10:30 to 11:00, then five more
 * periods of 40 minutes (eight periods a day).
 */
export const REGULAR_DAY = [
  { kind: "period", start: "08:30", end: "09:10" },
  { kind: "period", start: "09:10", end: "09:50" },
  { kind: "period", start: "09:50", end: "10:30" },
  { kind: "lunch", start: "10:30", end: "11:00" },
  { kind: "period", start: "11:00", end: "11:40" },
  { kind: "period", start: "11:40", end: "12:20" },
  { kind: "period", start: "12:20", end: "13:00" },
  { kind: "period", start: "13:00", end: "13:40" },
  { kind: "period", start: "13:40", end: "14:20" },
];

/** An approved school with its running academic year (2026-2027), and seats and room made optional for its sections. */
export async function timetableSchool(name = "Sunrise Public School"): Promise<SchoolSession & { yearId: string }> {
  const school = await createSchool(name);
  await Tenant.updateOne({ _id: school.tenantId }, { $set: { "settings.sectionDetailsRequired": false } });
  const year = (
    await request(app).post("/api/v1/academics/academic-years/initial").set(as(school.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" })
  ).body.data;
  return { ...school, yearId: year.id as string };
}

/** A class with these sections (none for a class that is not split). */
export async function addClass(token: string, name: string, sections: string[] = []) {
  const klass = (await request(app).post("/api/v1/academics/classes").set(as(token)).send({ name, capacity: 2000, sectionCount: 0 })).body.data;
  const made: { id: string; name: string }[] = [];
  for (const section of sections) {
    made.push((await request(app).post(`/api/v1/academics/classes/${klass.id}/sections`).set(as(token)).send({ name: section })).body.data);
  }
  return { id: klass.id as string, name, sections: made };
}

export async function addSubject(token: string, name: string, over: object = {}): Promise<string> {
  return (await request(app).post("/api/v1/subjects").set(as(token)).send({ name, ...over })).body.data.id as string;
}

export async function addTeacher(token: string, name: string, over: object = {}): Promise<string> {
  const res = await request(app).post("/api/v1/staff/teachers").set(as(token)).send({ name, ...over });
  return res.body.data.id as string;
}

/** The school's timing; every class follows it Monday to Friday unless said otherwise. */
export async function addTiming(token: string, over: object = {}): Promise<string> {
  const res = await request(app)
    .post("/api/v1/timetable/schedules")
    .set(as(token))
    .send({ name: "Regular", days: [1, 2, 3, 4, 5], slots: REGULAR_DAY, ...over });
  return res.body.data.id as string;
}

export interface AllotmentRow {
  subjectId: string;
  periodsPerWeek: number;
  blockSize?: number;
  teacherId?: string | null;
  group?: string | null;
}

/** Saves what a unit studies; the response is returned whole (so a test can look at an error too). */
export function saveAllotments(token: string, unit: { classId: string; sectionId: string | null }, rows: AllotmentRow[], extra: object = {}) {
  return request(app)
    .put("/api/v1/subjects/allotments")
    .set(as(token))
    .send({ ...unit, rows, ...extra });
}
