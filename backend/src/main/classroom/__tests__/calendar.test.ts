import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";

/**
 * The school's calendar (docs/parent-teacher-flow.md, phase 1): the people who run the school put holidays and events (functions,
 * activities) on it, for a day or a few days; everyone of the school, teachers and parents too, sees it.
 */

const api = "/api/v1/classroom/calendar";
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the school's calendar", () => {
  it("the school adds a holiday for a few days and an event for one; everyone of the school sees them, in date order", async () => {
    const s = await classroomSchool();
    const diwali = await request(app).post(api).set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10", note: "School closed" });
    expect(diwali.status).toBe(201);
    expect(diwali.body.data).toMatchObject({ title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10", note: "School closed" });
    const fn = await request(app).post(api).set(auth(s.token)).send({ title: "Annual function", kind: "event", startDate: "2026-12-20" });
    expect(fn.body.data).toMatchObject({ title: "Annual function", kind: "event", startDate: "2026-12-20", endDate: "2026-12-20", note: null });

    for (const token of [s.token, s.tokens.meena, s.tokens.ravi]) {
      const res = await request(app).get(api).set(auth(token));
      expect(res.status).toBe(200);
      expect(res.body.data.items.map((e: { title: string }) => e.title)).toEqual(["Diwali", "Annual function"]);
    }
    // A range: what touches it (Diwali ends on the 10th).
    const dec = await request(app).get(`${api}?from=2026-12-01&to=2026-12-31`).set(auth(s.tokens.ravi));
    expect(dec.body.data.items.map((e: { title: string }) => e.title)).toEqual(["Annual function"]);
    const ninth = await request(app).get(`${api}?from=2026-11-09&to=2026-11-09`).set(auth(s.tokens.ravi));
    expect(ninth.body.data.items.map((e: { title: string }) => e.title)).toEqual(["Diwali"]);
  });

  it("changes one and takes one away", async () => {
    const s = await classroomSchool();
    const id = (await request(app).post(api).set(auth(s.token)).send({ title: "Sports day", kind: "event", startDate: "2026-12-05" })).body.data.id;
    const changed = await request(app).patch(`${api}/${id}`).set(auth(s.token)).send({ title: "Sports week", endDate: "2026-12-09" });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toMatchObject({ title: "Sports week", startDate: "2026-12-05", endDate: "2026-12-09" });
    expect((await request(app).delete(`${api}/${id}`).set(auth(s.token))).status).toBe(200);
    expect((await request(app).get(api).set(auth(s.token))).body.data.items).toEqual([]);
  });

  it("refuses what cannot be, in words", async () => {
    const s = await classroomSchool();
    const backwards = await request(app).post(api).set(auth(s.token)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-10", endDate: "2026-11-08" });
    expect(backwards.status).toBe(400);
    expect(details(backwards)).toContainEqual({ path: "endDate", message: "The last day cannot be before the first day" });
    expect((await request(app).post(api).set(auth(s.token)).send({ title: "", kind: "holiday", startDate: "2026-11-10" })).status).toBe(400);
    expect((await request(app).post(api).set(auth(s.token)).send({ title: "Diwali", kind: "party", startDate: "2026-11-10" })).status).toBe(400);
  });

  it("is changed only by the people who run the school", async () => {
    const s = await classroomSchool();
    for (const token of [s.tokens.meena, s.tokens.ravi]) {
      expect((await request(app).post(api).set(auth(token)).send({ title: "Picnic", kind: "event", startDate: "2026-12-05" })).status).toBe(403);
    }
  });
});

/**
 * The calendar starts with the holidays of a calendar at home (data/standardHolidays.ts): Diwali, Holi, Republic Day... The three
 * national days stay on every school's calendar; the festivals the school may take off (and bring back) when it does not close for
 * them, and it adds its own as before. The rest of this suite runs with them off (STANDARD_HOLIDAYS=off in vitest.config.mts), so
 * a test that takes attendance "today" does not depend on today being a national holiday.
 */
describe("the standard holidays", () => {
  beforeAll(() => {
    process.env.STANDARD_HOLIDAYS = "on";
  });
  afterAll(() => {
    process.env.STANDARD_HOLIDAYS = "off";
  });

  const between = (token: string, from: string, to: string) => request(app).get(`${api}?from=${from}&to=${to}`).set(auth(token));
  const setShown = (token: string, key: string, shown: boolean | undefined) => request(app).put(`${api}/standard/${key}`).set(auth(token)).send(shown === undefined ? {} : { shown });
  const rows = (res: request.Response, field: "title" | "source" | "id" = "title") => res.body.data.items.map((e: Record<string, string>) => e[field]);
  const sheet = (token: string, unit: { classId: string; sectionId: string | null }, date: string) =>
    request(app).get(`/api/v1/classroom/attendance?classId=${unit.classId}&sectionId=${unit.sectionId ?? "none"}&date=${date}`).set(auth(token));
  const save = (token: string, unit: { classId: string; sectionId: string | null }, date: string, marks: object[]) =>
    request(app).put("/api/v1/classroom/attendance").set(auth(token)).send({ ...unit, date, marks });

  it("a school's calendar has them from the start: everyone of the school sees Diwali and the national days without anyone adding them", async () => {
    const s = await classroomSchool();
    for (const token of [s.token, s.tokens.meena, s.tokens.ravi]) {
      const november = await between(token, "2026-11-01", "2026-11-30");
      expect(november.status).toBe(200);
      expect(november.body.data.items).toEqual([
        { id: "2026-11-08-diwali", title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-08", note: null, source: "festival" },
        { id: "2026-11-24-guru-nanak-jayanti", title: "Guru Nanak Jayanti", kind: "holiday", startDate: "2026-11-24", endDate: "2026-11-24", note: null, source: "festival" },
      ]);
    }
    const january = await between(s.tokens.ravi, "2026-01-01", "2026-01-31");
    expect(january.body.data.items).toEqual([expect.objectContaining({ title: "Republic Day", source: "national" })]);
  });

  it("they stand among the school's own days in date order, and the school's own say so", async () => {
    const s = await classroomSchool();
    await request(app).post(api).set(auth(s.token)).send({ title: "Annual function", kind: "event", startDate: "2026-11-20" });
    const res = await between(s.token, "2026-11-01", "2026-11-30");
    expect(rows(res)).toEqual(["Diwali", "Annual function", "Guru Nanak Jayanti"]);
    expect(rows(res, "source")).toEqual(["festival", "school", "festival"]);
  });

  it("they come only with the days asked for; without them the school's own are all that is read", async () => {
    const s = await classroomSchool();
    await request(app).post(api).set(auth(s.token)).send({ title: "Annual function", kind: "event", startDate: "2026-12-20" });
    expect(rows(await request(app).get(api).set(auth(s.token)))).toEqual(["Annual function"]);
    expect(rows(await request(app).get(`${api}?from=2026-12-01`).set(auth(s.token)))).toEqual(["Annual function"]);
  });

  it("a holiday the school put on with the same name takes the place of the standard one, and the standard one returns when it is taken away", async () => {
    const s = await classroomSchool();
    const mine = (await request(app).post(api).set(auth(s.token)).send({ title: "diwali ", kind: "holiday", startDate: "2026-11-07", endDate: "2026-11-10" })).body.data;
    const res = await between(s.token, "2026-11-01", "2026-11-30");
    expect(rows(res)).toEqual(["diwali", "Guru Nanak Jayanti"]);
    expect(rows(res, "source")).toEqual(["school", "festival"]);
    await request(app).delete(`${api}/${mine.id}`).set(auth(s.token));
    expect(rows(await between(s.token, "2026-11-01", "2026-11-30"))).toEqual(["Diwali", "Guru Nanak Jayanti"]);
  });

  it("the school takes a festival off its calendar and brings it back; the list says what it took off", async () => {
    const s = await classroomSchool();
    const off = await setShown(s.token, "2026-03-04-holi", false);
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body.data).toEqual({ key: "2026-03-04-holi", title: "Holi", shown: false });

    const march = await between(s.tokens.ravi, "2026-03-01", "2026-03-31");
    expect(rows(march)).toEqual(["Id-ul-Fitr", "Ram Navami", "Mahavir Jayanti"]);
    expect(march.body.data.hidden).toEqual([{ id: "2026-03-04-holi", title: "Holi", kind: "holiday", startDate: "2026-03-04", endDate: "2026-03-04", note: null, source: "festival" }]);
    // Taking it off twice is the same as once.
    expect((await setShown(s.token, "2026-03-04-holi", false)).status).toBe(200);
    expect((await between(s.token, "2026-03-01", "2026-03-31")).body.data.hidden).toHaveLength(1);

    const back = await setShown(s.token, "2026-03-04-holi", true);
    expect(back.body.data).toEqual({ key: "2026-03-04-holi", title: "Holi", shown: true });
    const again = await between(s.token, "2026-03-01", "2026-03-31");
    expect(rows(again)).toEqual(["Holi", "Id-ul-Fitr", "Ram Navami", "Mahavir Jayanti"]);
    expect(again.body.data.hidden).toEqual([]);
  });

  it("only the people who run the school take one off; a national day stays; an unknown one is said so", async () => {
    const s = await classroomSchool();
    for (const token of [s.tokens.meena, s.tokens.ravi]) expect((await setShown(token, "2026-03-04-holi", false)).status).toBe(403);

    const national = await setShown(s.token, "2026-01-26-republic-day", false);
    expect(national.status).toBe(409);
    expect(national.body).toMatchObject({ code: "HOLIDAY_LOCKED", message: "Republic Day is a national holiday: it stays on every school's calendar." });
    expect(rows(await between(s.token, "2026-01-01", "2026-01-31"))).toEqual(["Republic Day"]);

    const unknown = await setShown(s.token, "2026-03-05-holi", false);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("HOLIDAY_NOT_FOUND");
    expect((await setShown(s.token, "holi", false)).status).toBe(404);
    expect((await setShown(s.token, "2026-03-04-holi", undefined)).status).toBe(400);
  });

  it("is not a record of the school's own: it cannot be changed or deleted like one", async () => {
    const s = await classroomSchool();
    expect((await request(app).patch(`${api}/2026-11-08-diwali`).set(auth(s.token)).send({ title: "Mine" })).status).toBe(400);
    expect((await request(app).delete(`${api}/2026-11-08-diwali`).set(auth(s.token))).status).toBe(400);
  });

  it("another school's choice is not this school's: one taking Holi off does not take it off the other's calendar", async () => {
    const a = await classroomSchool();
    const b = await classroomSchool("Moonrise Public School", "moon.");
    await setShown(a.token, "2026-03-04-holi", false);
    expect(rows(await between(a.token, "2026-03-01", "2026-03-07"))).toEqual([]);
    const other = await between(b.token, "2026-03-01", "2026-03-07");
    expect(rows(other)).toEqual(["Holi"]);
    expect(other.body.data.hidden).toEqual([]);
  });

  it("attendance is not taken on one, a school that took the festival off takes it again, and a national day stays closed", async () => {
    const s = await classroomSchool();
    const marks = [{ studentId: s.asha.id, status: "present" }];

    const national = await sheet(s.tokens.meena, s.a, "2026-10-02");
    expect(national.body.data.holiday).toEqual({ title: "Gandhi Jayanti" });
    const closed = await save(s.tokens.meena, s.a, "2026-10-02", marks);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("HOLIDAY");

    expect((await sheet(s.tokens.meena, s.a, "2026-10-20")).body.data.holiday).toEqual({ title: "Dussehra" });
    expect((await save(s.tokens.meena, s.a, "2026-10-20", marks)).body.code).toBe("HOLIDAY");
    await setShown(s.token, "2026-10-20-dussehra", false);
    expect((await sheet(s.tokens.meena, s.a, "2026-10-20")).body.data.holiday).toBeNull();
    expect((await save(s.tokens.meena, s.a, "2026-10-20", marks)).status).toBe(200);
    await setShown(s.token, "2026-10-20-dussehra", true);
    expect((await save(s.tokens.meena, s.a, "2026-10-20", marks)).body.code).toBe("HOLIDAY");
    expect((await save(s.tokens.meena, s.a, "2026-10-02", marks)).status).toBe(409);
  });
});
