import { Types } from "mongoose";
import { reportError } from "../../../utils/logger";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { StructureService } from "../../academics/services/structure.service";
import { Teacher } from "../../staff/models/Teacher";
import { BellSchedule } from "../../timetable/models/BellSchedule";
import { ScheduleService } from "../../timetable/services/schedule.service";
import { Tenant, type IMediumPlan, type ITenant } from "../models/Tenant";
import { sidesOfSchool } from "./schoolSides";
import { createMediumSide } from "./tenantFactory";

/** A side of the school, as the top bar lists it. */
export interface MediumDto {
  id: string;
  label: string;
}

type BoardEntry = NonNullable<NonNullable<ITenant["profile"]>["boardEntries"]>[number];
type TenantLean = Pick<ITenant, "_id" | "name" | "nameKey" | "slug" | "subscriptionTier" | "source" | "contactEmail" | "schoolEmail" | "contactPhone" | "website" | "address" | "profile" | "review" | "isActive">;

interface Side {
  key: string;
  label: string;
  entry: BoardEntry;
  plan: IMediumPlan;
}

const boardNameOf = (entry: BoardEntry): string => entry.stateBoard || entry.otherBoard || entry.board;

/** The sides a school said it has, in the order of its form. With one board the top bar says the medium alone. */
function sidesOf(tenant: Pick<ITenant, "profile">): Side[] {
  const entries = tenant.profile?.boardEntries ?? [];
  const oneBoard = entries.length === 1;
  return entries.flatMap((entry) =>
    (entry.plans ?? []).map((plan) => ({
      key: `${boardNameOf(entry).toLowerCase()}|${plan.medium.toLowerCase()}`,
      label: oneBoard ? `${plan.medium} Medium` : `${boardNameOf(entry)} · ${plan.medium} Medium`,
      entry,
      plan,
    }))
  );
}

/**
 * The classes (with sections and seats) and the timing of one side. A side that already has a timing keeps it, so a repeated run never
 * undoes what the school has changed since.
 */
async function buildSide(tenantId: Types.ObjectId, plan: IMediumPlan): Promise<void> {
  const id = tenantId.toString();
  await StructureService.startFromPlan(id, plan);
  if (await BellSchedule.exists({ tenantId })) return;
  const saturday = plan.week.saturday?.length ? plan.week.saturday : null;
  await ScheduleService.replaceSchoolDay(id, { days: plan.week.days.map((day) => ({ day, slots: day === 6 && saturday ? saturday : plan.week.usual })) });
}

/**
 * A school can teach in more than one medium, each run on its own: its own classes, students, timing, teachers and year. The first medium
 * lives in the school's own record; every other one is a record that points to it (`parentTenantId`). Because each is simply a school to
 * the rest of the system, everything in it stays apart with no extra rule. People still see one school: the platform lists it once, it is
 * approved and suspended as one, and its administrator moves between the sides from the top bar (`X-School-Medium`, middleware/auth.ts).
 */
export class MediumService {
  /**
   * Builds what the school described, once it is approved. Nothing here may undo the approval: a side that fails is logged, and the
   * sides still missing are made the next time the administrator's session is read (`forSession`).
   */
  static async setUp(tenantId: string): Promise<void> {
    const parent = await Tenant.findById(tenantId).lean();
    if (!parent) return;
    const sides = sidesOf(parent);
    if (sides.length === 0) {
      // A school that signed up before each medium had its own plan: its classes come from its one range, as they always did.
      await StructureService.startFromProfile(parent);
      return;
    }
    if (sides.length > 1) await Tenant.updateOne({ _id: parent._id }, { $set: { medium: { key: sides[0].key, label: sides[0].label } } });
    await buildSide(parent._id, sides[0].plan).catch((err) => reportError(err, { step: "build the first medium of a school", tenantId }));
    await MediumService.addMissingSides(tenantId, parent);
  }

  /** Makes the sides that do not exist yet (every side but the first). The ones that exist are not touched. */
  static async addMissingSides(tenantId: string, known?: TenantLean): Promise<void> {
    const parent = known ?? (await Tenant.findById(tenantId).lean());
    if (!parent) return;
    const others = sidesOf(parent).slice(1);
    if (others.length === 0) return;
    const year = await AcademicYearService.onboardingYear(parent._id);
    for (const side of others) {
      try {
        if (await Tenant.exists({ parentTenantId: parent._id, "medium.key": side.key })) continue;
        const made = await createMediumSide(parent, { key: side.key, label: side.label }, { ...side.entry, mediums: [side.plan.medium], plans: [side.plan] }, side.plan);
        if (year) {
          await AcademicYearService.saveOnboardingYear(made._id, { name: year.name, startDate: year.startDate, endDate: year.endDate });
          await AcademicYearService.activateOnboardingYear(made._id);
        }
        await buildSide(made._id, side.plan);
      } catch (err) {
        reportError(err, { step: "build a medium of a school", tenantId, medium: side.key });
      }
    }
  }

  /**
   * The sides the school's administrator can move between, the school's own first. Empty for a school with one medium, so there is nothing
   * to switch. A side that the approval could not make is made here.
   */
  static async forSession(tenantId: string): Promise<MediumDto[]> {
    const parent = await Tenant.findById(tenantId).select("approvalStatus medium profile.boardEntries").lean();
    if (!parent?.medium || parent.approvalStatus !== "approved") return [];
    const planned = sidesOf(parent).length;
    let others = await Tenant.find({ parentTenantId: parent._id }).sort({ _id: 1 }).select("medium").lean();
    if (others.length < planned - 1) {
      await MediumService.addMissingSides(tenantId);
      others = await Tenant.find({ parentTenantId: parent._id }).sort({ _id: 1 }).select("medium").lean();
    }
    return [{ id: tenantId, label: parent.medium.label }, ...others.map((o) => ({ id: o._id.toString(), label: o.medium?.label ?? "" }))];
  }

  /** The mediums a teacher teaches in, the one their login belongs to first. Empty unless there are at least two to move between. */
  static async forTeacher(tenantId: string, userId: string): Promise<MediumDto[]> {
    const sides = await sidesOfSchool(tenantId);
    if (sides.length < 2) return [];
    const teacher = new Types.ObjectId(userId);
    const taught = (await Promise.all(sides.map(async (side) => ((await Teacher.exists({ tenantId: side.id, userId: teacher, isActive: true })) ? side : null)))).filter((side) => side !== null);
    if (taught.length < 2) return [];
    const ownFirst = [...taught.filter((side) => side.id.toString() === tenantId), ...taught.filter((side) => side.id.toString() !== tenantId)];
    return ownFirst.map((side) => ({ id: side.id.toString(), label: side.label }));
  }

  /** Every record of a school: its own and its sides'. */
  static async familyIds(tenantId: string | Types.ObjectId): Promise<Types.ObjectId[]> {
    const school = new Types.ObjectId(tenantId);
    const sides = await Tenant.find({ parentTenantId: school }).select("_id").lean();
    return [school, ...sides.map((s) => s._id)];
  }
}
