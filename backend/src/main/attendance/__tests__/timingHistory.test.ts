import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { clock } from "../../../utils/clock";
import { classroomSchool } from "../../../test/classroom";
import { auth, REGULAR_DAY, timetableSchool } from "../../../test/timetable";
import { BellScheduleVersion } from "../../timetable/models/BellScheduleVersion";

/**
 * A change of the school's timing is not a change of the past (2026-11-17, user): when the head takes Saturday off or starts school an hour later,
 * the days before the change keep the timing they had, so a teacher who did not come on last Saturday is still absent, and an old day still
 * says the hours it had. Each save remembers the timing it replaces, with the day of the change; a day is read with the timing in force on it.
 * The days: 14 Nov 2026 is a Saturday, 16 a Monday, 17 a Tuesday, 21 a Saturday, 23 a Monday.
 */

const api = "/api/v1/attendance";
const schoolDay = "/api/v1/timetable/school-day";
const at = (day: string, hhmm = "10:00") => vi.spyOn(clock, "now").mockReturnValue(new Date(`${day}T${hhmm}:00+05:30`));
const day = (d: number, slots: object[] = REGULAR_DAY) => ({ day: d, slots });
const plus = (clock12: string, minutes: number) => {
  const [h, m] = clock12.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
/** The usual day moved later by some minutes. */
const later = (minutes: number) => REGULAR_DAY.map((s) => ({ ...s, start: plus(s.start, minutes), end: plus(s.end, minutes) }));

async function setUp() {
  const s = await classroomSchool();
  for (const id of [s.meena, s.dev, s.kiran]) await request(app).patch(`/api/v1/staff/teachers/${id}`).set(auth(s.token)).send({ joiningDate: "2026-04-01" });
  const save = (days: object[], extra: object = {}) => request(app).put(schoolDay).set(auth(s.token)).send({ days, ...extra });
  const sheet = async (from: string, to = from) => (await request(app).get(`${api}/teachers?from=${from}&to=${to}`).set(auth(s.token))).body.data as {
    days: { date: string; working: boolean; start: string | null; end: string | null }[];
    teachers: { id: string; records: { date: string; status: string }[] }[];
  };
  const dayOf = async (date: string) => (await sheet(date)).days[0];
  const statusOf = async (date: string) => (await sheet(date)).teachers.find((t) => t.id === s.meena)!.records[0].status;
  return { s, save, sheet, dayOf, statusOf };
}

beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => vi.restoreAllMocks());

describe("a change of the timing does not change the days before it", () => {
  it("a Saturday the school later takes off is still an absence, and still a school day with its hours, on the Saturdays before the change", async () => {
    const { save, dayOf, statusOf } = await setUp();
    // Monday to Saturday, 08:30, from Tuesday 10 Nov; the teacher does not come on Saturday 14 Nov.
    at("2026-11-10");
    expect((await save([1, 2, 3, 4, 5, 6].map((d) => day(d)))).status).toBe(200);
    // Tuesday 17 Nov: Saturday is taken off and school starts at 09:30.
    at("2026-11-17");
    expect((await save([1, 2, 3, 4, 5].map((d) => day(d, later(60))))).status).toBe(200);

    at("2026-11-23");
    expect(await dayOf("2026-11-14")).toMatchObject({ working: true, start: "08:30", end: "14:20" });
    expect(await statusOf("2026-11-14")).toBe("absent");
    // From the change on, the new timing: Saturday 21 Nov is no school day and nobody is absent on it.
    expect(await dayOf("2026-11-21")).toMatchObject({ working: false, start: null });
    expect(await statusOf("2026-11-21")).toBe("off");
  });

  it("the hours of an old day are the hours it had; the day of the change and after are the new ones", async () => {
    const { save, dayOf } = await setUp();
    at("2026-11-10");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    at("2026-11-17");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d, later(60))));
    at("2026-11-23");
    expect(await dayOf("2026-11-16")).toMatchObject({ start: "08:30", end: "14:20" });
    expect(await dayOf("2026-11-17")).toMatchObject({ start: "09:30", end: "15:20" });
    expect(await dayOf("2026-11-23")).toMatchObject({ start: "09:30", end: "15:20" });
  });

  it("several saves on one day keep the timing before the first of them: the day before still reads the old hours", async () => {
    const { save, dayOf } = await setUp();
    at("2026-11-10");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    at("2026-11-17", "09:00");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d, later(60))));
    at("2026-11-17", "11:00");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d, later(120))));
    at("2026-11-23");
    expect(await dayOf("2026-11-16")).toMatchObject({ start: "08:30" });
    expect(await dayOf("2026-11-17")).toMatchObject({ start: "10:30" });
  });

  it("a later change keeps its own stretch: the days between two changes read the timing they had", async () => {
    const { save, dayOf } = await setUp();
    at("2026-11-02");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    at("2026-11-17");
    await save([1, 2, 3, 4, 5].map((d) => day(d, later(60))));
    at("2026-12-01");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d, later(90))));
    at("2026-12-08");
    // Before 17 Nov: 08:30 with Saturday. From 17 Nov to 30 Nov: 09:30, no Saturday. From 1 Dec: 10:00 with Saturday.
    expect(await dayOf("2026-11-14")).toMatchObject({ working: true, start: "08:30" });
    expect(await dayOf("2026-11-28")).toMatchObject({ working: false });
    expect(await dayOf("2026-11-24")).toMatchObject({ start: "09:30" });
    expect(await dayOf("2026-12-05")).toMatchObject({ working: true, start: "10:00" });
  });

  it("a class's own hours, saved later, do not change the hours of the days before", async () => {
    const { s, save, dayOf } = await setUp();
    at("2026-11-10");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    at("2026-11-17");
    const early = [{ kind: "period", start: "07:30", end: "08:10" }, { kind: "period", start: "08:10", end: "08:50" }];
    const res = await request(app).put("/api/v1/timetable/class-day").set(auth(s.token)).send({ classId: s.class1.id, days: [1, 2, 3, 4, 5].map((d) => day(d, early)) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    at("2026-11-23");
    expect(await dayOf("2026-11-16")).toMatchObject({ start: "08:30" });
    expect(await dayOf("2026-11-18")).toMatchObject({ start: "07:30" });
  });

  it("the first timing a school makes has no older timing to keep: it reads for the days before too, as it always did", async () => {
    const { save, dayOf } = await setUp();
    at("2026-11-17");
    await save([1, 2, 3, 4, 5].map((d) => day(d)));
    at("2026-11-23");
    expect(await dayOf("2026-11-10")).toMatchObject({ working: true, start: "08:30" });
  });

  it("a save that is refused leaves nothing remembered", async () => {
    const { s, save } = await setUp();
    at("2026-11-10");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    at("2026-11-17");
    // The shift would take nothing past midnight here, so make the save itself invalid: no day with school.
    expect((await save([day(6, [])])).status).toBe(400);
    expect(await BellScheduleVersion.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect((await save([1, 2, 3, 4, 5].map((d) => day(d, later(60))))).status).toBe(200);
    expect(await BellScheduleVersion.countDocuments({ tenantId: s.tenantId })).toBe(1);
  });

  it("one school's change is not another's: a second school changing its timing leaves the first school's days as they were", async () => {
    const { save, dayOf } = await setUp();
    at("2026-11-10");
    await save([1, 2, 3, 4, 5, 6].map((d) => day(d)));
    const other = await timetableSchool("Moonrise Public School");
    const saveOther = (days: object[]) => request(app).put(schoolDay).set(auth(other.token)).send({ days });
    await saveOther([1, 2, 3, 4, 5].map((d) => day(d)));
    at("2026-11-17");
    await saveOther([1, 2, 3, 4, 5].map((d) => day(d, later(60))));
    at("2026-11-23");
    expect(await dayOf("2026-11-14")).toMatchObject({ working: true, start: "08:30" });
    expect(await BellScheduleVersion.countDocuments({ tenantId: other.tenantId })).toBe(1);
  });
});
