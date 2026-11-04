import { describe, it, expect, beforeEach } from "vitest";
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
