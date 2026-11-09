import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { MAX_SCHEDULES } from "../constants";

const api = "/api/v1/timetable/schedules";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string) => request(app).get(api).set(auth(token));
const post = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const del = (token: string, id: string) => request(app).delete(`${api}/${id}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

/**
 * The school's day as its head wrote it: school from 08:30, three periods of 40 minutes, lunch 10:30 to 11:00, then five more
 * periods of 40 minutes.
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
const regular = (over: object = {}) => ({ name: "Regular", days: [1, 2, 3, 4, 5], slots: REGULAR_DAY, ...over });

const classId = async (token: string, name: string) =>
  (await request(app).post("/api/v1/academics/classes").set(auth(token)).send({ name, capacity: 2000, sectionCount: 0 })).body.data.id as string;

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("timings: who may use them", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get(api)).status).toBe(401);
  });

  it("lets the school admin and the principal set them, a teacher only look, and keeps the accountant out", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const principal = await addColleague(tenantId, "principal");
    const teacher = await addColleague(tenantId, "teacher");
    const accountant = await addColleague(tenantId, "accountant");
    expect((await post(principal, regular())).status).toBe(201);
    expect((await post(token, regular({ name: "Saturday", days: [6] }))).status).toBe(201);
    expect((await get(teacher)).body.data.items).toHaveLength(2);
    expect((await post(teacher, regular({ name: "Mine" }))).status).toBe(403);
    expect((await get(accountant)).status).toBe(403);
  });
});

describe("making a timing", () => {
  it("keeps the days in order, the rows as times, a lunch called Lunch, and counts the periods", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, regular({ days: [5, 1, 3, 2, 4] }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", classIds: [], periods: 8 });
    expect(res.body.data.slots).toHaveLength(9);
    expect(res.body.data.slots[0]).toEqual({ kind: "period", label: "", start: "08:30", end: "09:10" });
    expect(res.body.data.slots[3]).toEqual({ kind: "lunch", label: "Lunch", start: "10:30", end: "11:00" });
    expect((await get(token)).body.data.items).toHaveLength(1);
  });

  it("keeps the names of a break and of a period the school gave", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, {
      name: "Saturday",
      days: [6],
      slots: [
        { kind: "break", label: "Assembly", start: "08:00", end: "08:15" },
        { kind: "period", label: "Club", start: "08:15", end: "09:00" },
        { kind: "break", start: "09:00", end: "09:10" },
      ],
    });
    expect(res.body.data.slots.map((s: { label: string }) => s.label)).toEqual(["Assembly", "Club", "Break"]);
  });

  it("says what is wrong with the name, the days and each row's boxes", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, {
      name: " ",
      days: [],
      slots: [
        { kind: "period", start: "9:00", end: "09:40" },
        { kind: "period", start: "09:50", end: "09:45" },
        { kind: "snack", start: "10:00", end: "10:10" },
      ],
    });
    expect(res.status).toBe(400);
    const by = Object.fromEntries(details(res).map((d) => [d.path, d.message]));
    expect(by.name).toBe("Enter the name of the timing");
    expect(by.days).toBe("Choose the days this timing runs on");
    expect(by["slots.0.start"]).toBe("Enter a time like 08:30");
    expect(by["slots.2.kind"]).toBe("Choose period, lunch or break");
  });

  it("checks the day as a whole after the boxes: a period that lasts no time, rows that overlap, two lunches, no period at all", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const noTime = await post(token, regular({ slots: [{ kind: "period", start: "09:00", end: "09:00" }] }));
    expect(details(noTime)).toEqual([{ path: "slots.0.end", message: "The end must be after the start" }]);
    const overlap = await post(token, regular({ slots: [{ kind: "period", start: "09:00", end: "09:40" }, { kind: "period", start: "09:30", end: "10:10" }] }));
    expect(details(overlap)).toEqual([{ path: "slots.1.start", message: "Starts before the row above ends (09:40)" }]);
    const twoLunches = await post(token, regular({ slots: [...REGULAR_DAY, { kind: "lunch", start: "14:20", end: "14:40" }] }));
    expect(details(twoLunches)).toEqual([{ path: "slots.9.kind", message: "A day has one lunch break" }]);
    const none = await post(token, regular({ slots: [{ kind: "lunch", start: "10:00", end: "10:30" }] }));
    expect(details(none)).toEqual([{ path: "slots", message: "Add at least one period" }]);
  });

  it("refuses a name the school already has, and lets another school have it", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await post(a.token, regular());
    const again = await post(a.token, regular({ name: "regular", days: [6] }));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("SCHEDULE_EXISTS");
    expect((await post(b.token, regular())).status).toBe(201);
  });

  it(`holds a school to ${MAX_SCHEDULES} timings (enough for a few departments with timings of their own)`, async () => {
    const { token } = await createSchool("Sunrise Public School");
    for (let i = 1; i <= 3; i += 1) expect((await post(token, regular({ name: `Timing ${i}`, days: [], scope: "only", classIds: [] }))).status).toBe(400);
    for (let i = 1; i <= 7; i += 1) expect((await post(token, regular({ name: `Timing ${i}`, days: [i] }))).status, `timing ${i}`).toBe(201);
    // Seven days are taken; more are made for single classes, one a day each.
    let n = 7;
    for (const name of ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"]) {
      const id = await classId(token, name);
      for (let day = 1; day <= 7 && n < MAX_SCHEDULES; day += 1) {
        n += 1;
        expect((await post(token, regular({ name: `Timing ${n}`, scope: "only", classIds: [id], days: [day] }))).status, `timing ${n}`).toBe(201);
      }
    }
    expect(n).toBe(MAX_SCHEDULES);
    const last = await classId(token, "Class 7");
    const over = await post(token, regular({ name: "One too many", scope: "only", classIds: [last], days: [1] }));
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
  });
});

describe("which classes a timing is for", () => {
  it("is for all classes unless it names some; 'only' needs classes and takes only the school's own", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const nursery = await classId(a.token, "Nursery");
    const foreign = await classId(b.token, "Class 1");

    const none = await post(a.token, regular({ name: "Junior", scope: "only", classIds: [] }));
    expect(none.status).toBe(400);
    expect(details(none)).toEqual([{ path: "classIds", message: "Choose the classes it is for" }]);

    const other = await post(a.token, regular({ name: "Junior", scope: "only", classIds: [foreign] }));
    expect(other.status).toBe(400);
    expect(details(other)).toEqual([{ path: "classIds", message: "Choose classes from your school's list" }]);

    const ok = await post(a.token, regular({ name: "Junior", scope: "only", classIds: [nursery, nursery] }));
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ scope: "only", classIds: [nursery] });
  });

  it("forgets the classes of an 'all' timing, and makes 'all but nobody' an 'all' timing", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const nursery = await classId(token, "Nursery");
    const all = await post(token, regular({ name: "Regular", scope: "all", classIds: [nursery] }));
    expect(all.body.data).toMatchObject({ scope: "all", classIds: [] });
    const except = await post(token, regular({ name: "Saturday", days: [6], scope: "except", classIds: [] }));
    expect(except.body.data.scope).toBe("all");
  });

  it("lets a timing for one class run on the same days as the school's (the class's own is followed)", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const nursery = await classId(token, "Nursery");
    expect((await post(token, regular())).status).toBe(201);
    expect((await post(token, regular({ name: "Pre-primary", scope: "only", classIds: [nursery] }))).status).toBe(201);
  });

  it("refuses two timings that cover the same class on the same day, and names the class, the day and the other timing", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, regular());
    const clash = await post(token, regular({ name: "Winter", days: [5, 6] }));
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("SCHEDULE_CLASH");
    expect(clash.body.message).toBe('Every class already follows "Regular" on Friday. A class follows one timing a day: give one of them other days or other classes.');
    // Saturday alone is free.
    expect((await post(token, regular({ name: "Winter", days: [6] }))).status).toBe(201);
  });

  it("names the class when the clash is about one class", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const nursery = await classId(token, "Nursery");
    await post(token, regular({ name: "Pre-primary", scope: "only", classIds: [nursery] }));
    const clash = await post(token, regular({ name: "Pre-primary 2", scope: "only", classIds: [nursery], days: [3] }));
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Nursery already follows "Pre-primary" on Wednesday');
  });

  it("an 'all but' timing leaves the listed classes without school that day, and clashes with an 'all' timing for the others", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const nursery = await classId(token, "Nursery");
    await classId(token, "Class 5");
    await post(token, regular({ days: [1, 2, 3, 4, 5] }));
    expect((await post(token, regular({ name: "Saturday", days: [6], scope: "except", classIds: [nursery] }))).status).toBe(201);
    const clash = await post(token, regular({ name: "Saturday 2", days: [6] }));
    expect(clash.status).toBe(409);
  });
});

describe("changing a timing", () => {
  it("changes some boxes and leaves the others", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const made = (await post(token, regular())).body.data;
    const res = await patch(token, made.id, { name: "Weekdays", days: [1, 2, 3, 4] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Weekdays", days: [1, 2, 3, 4], periods: 8 });
    expect(res.body.data.slots).toHaveLength(9);
    expect((await patch(token, made.id, {})).status).toBe(400);
  });

  it("replaces the rows of the day, checked as a whole", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const made = (await post(token, regular())).body.data;
    const short = [
      { kind: "period", start: "08:30", end: "09:15" },
      { kind: "period", start: "09:15", end: "10:00" },
    ];
    expect((await patch(token, made.id, { slots: short })).body.data.periods).toBe(2);
    const bad = await patch(token, made.id, { slots: [{ kind: "period", start: "10:00", end: "09:00" }] });
    expect(bad.status).toBe(400);
  });

  it("refuses a change that makes it clash with another timing, but not one that keeps its own days", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, regular());
    const saturday = (await post(token, regular({ name: "Saturday", days: [6] }))).body.data;
    expect((await patch(token, saturday.id, { days: [5, 6] })).status).toBe(409);
    expect((await patch(token, saturday.id, { name: "Saturday half day" })).status).toBe(200);
    expect((await patch(token, saturday.id, { days: [6, 7] })).status).toBe(200);
  });

  it("refuses the name of another timing", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, regular());
    const saturday = (await post(token, regular({ name: "Saturday", days: [6] }))).body.data;
    expect((await patch(token, saturday.id, { name: "REGULAR" })).status).toBe(409);
  });

  it("is a 404 for a timing of another school, before the body is read", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const made = (await post(a.token, regular())).body.data;
    expect((await patch(b.token, made.id, { nope: 1 })).status).toBe(404);
    expect((await patch(a.token, "not-an-id", { name: "x" })).status).toBe(400);
  });
});

describe("deleting a timing", () => {
  it("removes it, so the days it covered have no school for the classes that followed it", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const made = (await post(token, regular())).body.data;
    expect((await del(token, made.id)).status).toBe(200);
    expect((await get(token)).body.data.items).toEqual([]);
    expect((await del(token, made.id)).status).toBe(404);
  });
});
