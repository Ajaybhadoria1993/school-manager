import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";

/**
 * Leave (docs/parent-teacher-flow.md, phase 2): the parent applies for their child; the child's class teacher and the school see it and
 * approve or decline it in one click; the parent sees the answer, and can take back one that is still waiting.
 */

const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const apply = (token: string, childId: string, body: object) => request(app).post(`/api/v1/parent/children/${childId}/leaves`).set(auth(token)).send(body);
const mine = (token: string, childId: string) => request(app).get(`/api/v1/parent/children/${childId}/leaves`).set(auth(token));
const inbox = (token: string, query = "") => request(app).get(`/api/v1/classroom/leaves${query}`).set(auth(token));
const decide = (token: string, id: string, body: object) => request(app).post(`/api/v1/classroom/leaves/${id}/decide`).set(auth(token)).send(body);
const FEVER = { fromDate: "2026-11-12", toDate: "2026-11-13", reason: "Fever" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a parent applies for leave", () => {
  it("the class teacher and the school see it, the class teacher approves it in one click, and the parent sees the answer", async () => {
    const s = await classroomSchool();
    const sent = await apply(s.tokens.ravi, s.asha.id, FEVER);
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ fromDate: "2026-11-12", toDate: "2026-11-13", days: 2, reason: "Fever", status: "pending", decidedBy: null });

    expect((await mine(s.tokens.ravi, s.asha.id)).body.data.items.map((l: { reason: string }) => l.reason)).toEqual(["Fever"]);
    for (const token of [s.tokens.meena, s.token]) {
      const list = (await inbox(token)).body.data.items;
      expect(list).toEqual([
        expect.objectContaining({ id: sent.body.data.id, student: { id: s.asha.id, name: "Asha Verma", admissionNumber: s.asha.admissionNumber }, label: "Class 5 - A", appliedBy: "Ravi Verma (Father)", status: "pending", days: 2 }),
      ]);
    }
    // Not their class: a subject teacher of it, a teacher of nothing.
    expect((await inbox(s.tokens.dev)).body.data.items).toEqual([]);
    expect((await inbox(s.tokens.kiran)).body.data.items).toEqual([]);

    const ok = await decide(s.tokens.meena, sent.body.data.id, { status: "approved" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "approved", decidedBy: { name: "Meena Singh", role: "teacher" } });
    expect((await mine(s.tokens.ravi, s.asha.id)).body.data.items[0]).toMatchObject({ status: "approved", decidedBy: { name: "Meena Singh" } });
  });

  it("the school declines one with a note; one already answered is not answered again", async () => {
    const s = await classroomSchool();
    const id = (await apply(s.tokens.ravi, s.asha.id, FEVER)).body.data.id;
    const no = await decide(s.token, id, { status: "declined", note: "Exams that day" });
    expect(no.body.data).toMatchObject({ status: "declined", note: "Exams that day" });
    const again = await decide(s.tokens.meena, id, { status: "approved" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("LEAVE_DECIDED");
  });

  it("the parent takes back one still waiting (not one already answered), and it leaves the waiting list", async () => {
    const s = await classroomSchool();
    const id = (await apply(s.tokens.ravi, s.asha.id, FEVER)).body.data.id;
    const back = await request(app).post(`/api/v1/parent/children/${s.asha.id}/leaves/${id}/cancel`).set(auth(s.tokens.ravi));
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe("cancelled");
    expect((await inbox(s.tokens.meena, "?status=pending")).body.data.items).toEqual([]);

    const other = (await apply(s.tokens.ravi, s.asha.id, { fromDate: "2026-11-20", reason: "Wedding" })).body.data;
    expect(other).toMatchObject({ fromDate: "2026-11-20", toDate: "2026-11-20", days: 1 });
    await decide(s.tokens.meena, other.id, { status: "approved" });
    const late = await request(app).post(`/api/v1/parent/children/${s.asha.id}/leaves/${other.id}/cancel`).set(auth(s.tokens.ravi));
    expect(late.status).toBe(409);
  });

  it("refuses what cannot be, in words, and another family's child", async () => {
    const s = await classroomSchool();
    const backwards = await apply(s.tokens.ravi, s.asha.id, { fromDate: "2026-11-13", toDate: "2026-11-12", reason: "Fever" });
    expect(backwards.status).toBe(400);
    expect(details(backwards)).toContainEqual({ path: "toDate", message: "The last day cannot be before the first day" });
    expect(details(await apply(s.tokens.ravi, s.asha.id, { fromDate: "2026-11-12", reason: "" }))).toContainEqual({ path: "reason", message: "Write why the child will not come" });
    const long = await apply(s.tokens.ravi, s.asha.id, { fromDate: "2026-11-01", toDate: "2026-12-15", reason: "Travel" });
    expect(details(long)).toContainEqual({ path: "toDate", message: "A leave is up to 31 days" });
    expect((await apply(s.tokens.ravi, s.kabir.id, FEVER)).status).toBe(404);
  });

  it("is answered only by the child's class teacher or the people who run the school", async () => {
    const s = await classroomSchool();
    const id = (await apply(s.tokens.ravi, s.asha.id, FEVER)).body.data.id;
    const dev = await decide(s.tokens.dev, id, { status: "approved" });
    expect(dev.status).toBe(403);
    expect(dev.body.code).toBe("NOT_CLASS_TEACHER");
    expect((await decide(s.tokens.ravi, id, { status: "approved" })).status).toBe(403);
    expect((await inbox(s.tokens.ravi)).status).toBe(403);
  });
});
