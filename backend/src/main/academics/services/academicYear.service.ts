import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Tenant } from "../../tenants/models/Tenant";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { copyTimetableToYear } from "../../timetable/services/yearCopy";
import { AcademicYear, type AcademicYearStatus, type IAcademicYear } from "../models/AcademicYear";
import { Section } from "../models/Section";
import type { AcademicYearInput, NextAcademicYearInput } from "../schemas/academicYear.schemas";
import { isDuplicateKey } from "./shared";

/** An academic year as it leaves the API. The days are calendar days, "2026-04-01", the way the school typed them. */
export interface AcademicYearDto {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
  activatedAt: string | null;
}

/** What the dashboard (and any screen) needs to know about the school's session. */
export interface CurrentAcademicYear {
  /** The active year, or null when the school has none. */
  year: AcademicYearDto | null;
  /**
   * True when the school has no academic year at all, which only happens to a school approved before academic years existed:
   * its administrator names the current one once (`setUpFirst`). Nothing is guessed for it.
   */
  needsSetUp: boolean;
}

type YearLike = Pick<IAcademicYear, "_id" | "name" | "startDate" | "endDate" | "status" | "activatedAt">;

/** "2026-04-01": the calendar day of a date stored as midnight UTC. */
export const calendarDayOf = (date: Date): string => date.toISOString().slice(0, 10);

const NEXT_EXISTS = () => ApiError.conflict("Your school already has a next academic year waiting. Switch it on, or finish it first.", "NEXT_YEAR_EXISTS");

export const toAcademicYearDto = (y: YearLike): AcademicYearDto => ({
  id: y._id.toString(),
  name: y.name,
  startDate: calendarDayOf(y.startDate),
  endDate: calendarDayOf(y.endDate),
  status: y.status,
  activatedAt: y.activatedAt ? y.activatedAt.toISOString() : null,
});

const EXISTS = () =>
  ApiError.conflict("Your school already has an academic year with that name.", "ACADEMIC_YEAR_EXISTS", [
    { path: "academicYear.name", message: "Your school already has an academic year with that name" },
  ]);

/** "31 Mar 2027", for a message. */
const readable = (day: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(day);

export class AcademicYearService {
  /** Every year of the school, the newest first (by the day it starts). */
  static async list(tenantId: string): Promise<AcademicYearDto[]> {
    const years = await AcademicYear.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ startDate: -1, _id: -1 }).lean();
    return years.map(toAcademicYearDto);
  }

  /**
   * The school's next session, waiting (`pending`) until the school switches it on: its own name and days, which must start after the
   * running year ends. By default the sections of the running year are copied into it (name, seats, room) as a starting point, because
   * students are promoted into sections of the next year; nothing else changes and the running year is not touched. One next year at a
   * time (the database refuses a second one too).
   */
  static async createNext(tenantId: string, input: NextAcademicYearInput): Promise<AcademicYearDto & { sectionsCopied: number; timetablesCopied: number; allotmentsCopied: number }> {
    const school = new Types.ObjectId(tenantId);
    const running = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
    if (!running) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    if (await AcademicYear.exists({ tenantId: school, status: "pending" })) throw NEXT_EXISTS();
    if (input.startDate.getTime() <= running.endDate.getTime()) {
      const message = `The next year must start after the running year ends (${readable(running.endDate)})`;
      throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "startDate", message }]);
    }
    let year: IAcademicYear;
    try {
      year = await AcademicYear.create({
        tenantId: school,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        startDate: input.startDate,
        endDate: input.endDate,
        status: "pending",
        source: "school",
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        // The name is taken, or someone made the next year at the same moment: the first is the likelier, the second says the same thing.
        throw (await AcademicYear.exists({ tenantId: school, nameKey: nameKeyOf(input.name) })) ? EXISTS() : NEXT_EXISTS();
      }
      throw err;
    }
    let sectionsCopied = 0;
    const sectionMap = new Map<string, string>();
    if (input.copySections) {
      const sections = await Section.find({ tenantId: school, academicYearId: running._id }).lean();
      if (sections.length > 0) {
        const made = await Section.insertMany(
          sections.map((s) => ({ tenantId: school, classId: s.classId, academicYearId: year._id, name: s.name, nameKey: s.nameKey, capacity: s.capacity ?? null, room: s.room ?? null }))
        );
        sectionsCopied = sections.length;
        // Each old section and its copy (same class, same name), for what is copied after them.
        for (const old of sections) {
          const copy = made.find((m) => m.classId.equals(old.classId) && m.nameKey === old.nameKey);
          if (copy) sectionMap.set(old._id.toString(), copy._id.toString());
        }
      }
    }
    // What each class studies and its timetable, as a starting point for the next year (drafts; nothing of the running year changes).
    const copied = input.copyTimetable ? await copyTimetableToYear(tenantId, running._id, year._id, sectionMap) : { allotments: 0, timetables: 0 };
    return { ...toAcademicYearDto(year), sectionsCopied, timetablesCopied: copied.timetables, allotmentsCopied: copied.allotments };
  }

  /** The year the school named in its sign-up form (whatever its state), or null. */
  static async onboardingYear(tenantId: string | Types.ObjectId): Promise<IAcademicYear | null> {
    return AcademicYear.findOne({ tenantId: new Types.ObjectId(tenantId), source: "onboarding" }).lean();
  }

  /**
   * Saves the year from the sign-up form while the form can still be edited: the first save creates it (pending), every later
   * save (a retry, a resubmission after a rejection) updates the same record. There is one per school, enforced by a unique
   * index, so two saves at the same moment cannot make two: the loser of the race finds the winner's record and updates it.
   */
  static async saveOnboardingYear(tenantId: string | Types.ObjectId, input: AcademicYearInput): Promise<IAcademicYear> {
    const school = new Types.ObjectId(tenantId);
    const set = { name: input.name, nameKey: nameKeyOf(input.name), startDate: input.startDate, endDate: input.endDate };
    for (let attempt = 1; ; attempt += 1) {
      try {
        const year = await AcademicYear.findOneAndUpdate(
          { tenantId: school, source: "onboarding", status: "pending" },
          { $set: set },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );
        return year;
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        // Lost the race to insert: the other save's record exists now, so updating it is what is left to do.
        if (attempt === 1) continue;
        throw EXISTS();
      }
    }
  }

  /** The id of the school's active year, or null (a school approved before academic years existed, until it sets one up). */
  static async activeYearId(tenantId: string | Types.ObjectId): Promise<Types.ObjectId | null> {
    const active = await AcademicYear.findOne({ tenantId: new Types.ObjectId(tenantId), status: "active" }).select("_id").lean();
    return active?._id ?? null;
  }

  /**
   * The school was approved: the year from its sign-up form becomes its active year. Safe to run again (a retried approval, the
   * repair in `current`): a school that already has an active year keeps it, and the database refuses a second active year even
   * when two of these run at once. Returns the active year, or null when the school never named one (it signed up before
   * academic years existed).
   */
  static async activateOnboardingYear(tenantId: string | Types.ObjectId): Promise<IAcademicYear | null> {
    const school = new Types.ObjectId(tenantId);
    let active = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
    if (!active) {
      try {
        active = await AcademicYear.findOneAndUpdate(
          { tenantId: school, source: "onboarding", status: "pending" },
          { $set: { status: "active", activatedAt: new Date() } },
          { new: true }
        ).lean();
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        // Another request switched a year on at the same moment: that one is the active year.
        active = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
      }
    }
    if (active) await AcademicYearService.adoptYearlessSections(school, active._id);
    return active;
  }

  /**
   * Sections made before the school had any academic year belong to the session that was running then, which is the year
   * that becomes active first. They are given that year once, here; a section that already has a year is never moved.
   */
  static async adoptYearlessSections(tenantId: Types.ObjectId, yearId: Types.ObjectId): Promise<void> {
    await Section.updateMany({ tenantId, academicYearId: null }, { $set: { academicYearId: yearId } });
  }

  /**
   * The school's active year, for the dashboard and every screen that shows the session. An approved school whose sign-up
   * year was not switched on (the approval's own attempt failed) gets it switched on here; a pending or rejected school never
   * does, because this checks the approval first.
   */
  static async current(tenantId: string): Promise<CurrentAcademicYear> {
    const school = new Types.ObjectId(tenantId);
    let active: YearLike | null = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
    if (!active) {
      const tenant = await Tenant.findById(school).select("approvalStatus").lean();
      if (tenant?.approvalStatus === "approved") active = await AcademicYearService.activateOnboardingYear(school);
    }
    if (active) return { year: toAcademicYearDto(active), needsSetUp: false };
    return { year: null, needsSetUp: !(await AcademicYear.exists({ tenantId: school })) };
  }

  /**
   * For a school that has no academic year at all (it was approved before academic years existed): its administrator names
   * the session that is running now, and it becomes the active year. Only once: a school with any year is refused, and two
   * requests at the same moment cannot both succeed (one active year per school, enforced by the database).
   */
  static async setUpFirst(tenantId: string, input: AcademicYearInput): Promise<AcademicYearDto> {
    const school = new Types.ObjectId(tenantId);
    const taken = () => ApiError.conflict("Your school already has an academic year.", "ACADEMIC_YEAR_EXISTS");
    if (await AcademicYear.exists({ tenantId: school })) throw taken();
    try {
      const year = await AcademicYear.create({
        tenantId: school,
        name: input.name,
        nameKey: nameKeyOf(input.name),
        startDate: input.startDate,
        endDate: input.endDate,
        status: "active",
        source: "school",
        activatedAt: new Date(),
      });
      await AcademicYearService.adoptYearlessSections(school, year._id);
      return toAcademicYearDto(year);
    } catch (err) {
      if (isDuplicateKey(err)) throw taken();
      throw err;
    }
  }
}
