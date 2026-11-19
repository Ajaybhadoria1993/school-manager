import { Types } from "mongoose";
import { indiaNow } from "../../../utils/clock";
import { BellSchedule } from "../models/BellSchedule";
import { BellScheduleVersion } from "../models/BellScheduleVersion";

/**
 * What the school's timings were on each day (2026-11-17). The timings have no dates, so every save first REMEMBERS what it replaces, with the
 * day of the change (`BellScheduleVersion`); a day is then read with the timings that were in force on it. Only what a day needs (which weekdays
 * run, from when to when) is read back from the past.
 */

/** The part of a timing a day is read from. */
export interface TimingRow {
  days: number[];
  slots: { start: number; end: number }[];
}

/** One remembered stretch: the timings that ran on every day before `until` (and after the version before it). */
export interface TimingVersion {
  until: string;
  schedules: TimingRow[];
}

/**
 * Called by every save of the timings (after it was checked, before anything is written): keeps the timings as they are now, for the days
 * before today. Once for each day: a second save the same day changes the timings of today, not of the days before, so the first copy is the
 * one that counts. A school with no timing yet has nothing to keep (its first timing reads for the days before it too, as it always did).
 */
export async function rememberTimings(tenantId: string): Promise<void> {
  const school = new Types.ObjectId(tenantId);
  const today = indiaNow().date;
  if (await BellScheduleVersion.exists({ tenantId: school, until: today })) return;
  const current = await BellSchedule.find({ tenantId: school }).sort({ _id: 1 }).lean();
  if (current.length === 0) return;
  await BellScheduleVersion.create({
    tenantId: school,
    until: today,
    schedules: current.map((s) => ({ name: s.name, days: s.days, scope: s.scope, classIds: s.classIds, departmentId: s.departmentId ?? null, slots: s.slots })),
  });
}

/** The remembered stretches that can reach a day from `from` on, the oldest first (the same day of change: the first save's copy first). */
export async function timingHistory(tenantId: string, from: string): Promise<TimingVersion[]> {
  const versions = await BellScheduleVersion.find({ tenantId: new Types.ObjectId(tenantId), until: { $gt: from } })
    .sort({ until: 1, createdAt: 1, _id: 1 })
    .select("until schedules.days schedules.slots")
    .lean();
  return versions.map((v) => ({ until: v.until, schedules: v.schedules.map((s) => ({ days: s.days, slots: s.slots })) }));
}

/**
 * The timings in force on a day: those of the oldest version that ran until after it, else the timings as they are now. `history` is oldest first
 * (`timingHistory`).
 */
export function timingsOn(date: string, history: readonly TimingVersion[], current: readonly TimingRow[]): readonly TimingRow[] {
  return history.find((v) => v.until > date)?.schedules ?? current;
}
