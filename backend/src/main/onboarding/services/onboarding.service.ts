import { ApiError } from "../../../utils/ApiError";
import type { IAcademicYear } from "../../academics/models/AcademicYear";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { logger } from "../../../utils/logger";
import { ONBOARDING_STEP_COUNT, DATA_STEPS } from "../../tenants/constants";
import { SchoolLogo } from "../../tenants/models/SchoolLogo";
import { Tenant, type ApprovalStatus, type ITenant } from "../../tenants/models/Tenant";
import { notifySuperAdminsOfSubmission } from "../../tenants/services/notifications";
import { buildSchoolSteps, type SchoolSteps } from "../../tenants/services/schoolDetails";
import { nameKeyOf, SCHOOL_EXISTS } from "../../tenants/services/tenantFactory";
import {
  toOnboardingProgress,
  type OnboardingProgress,
} from "../../tenants/services/tenantState";
import { User, type IUser } from "../../users/models/User";
import { step1Schema, step2Schema, step3Schema, step4Schema, type Step1Input, type Step2Input } from "../schemas/onboarding.schemas";

/** While a school is in one of these states its administrator may still edit the form. */
const EDITABLE: ApprovalStatus[] = ["onboarding", "rejected"];

export interface OnboardingState {
  approvalStatus: ApprovalStatus;
  onboarding: OnboardingProgress;
  /** Only while rejected. */
  rejectionReason: string | null;
  steps: SchoolSteps;
}

interface Caller {
  userId: string;
  tenantId: string;
}

/** What a picture really is, from its first bytes (its name and its stated type can say anything). SVG is not offered: it can carry a script. */
function pictureType(file: Buffer): string | null {
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return "image/jpeg";
  if (file.length >= 12 && file.toString("latin1", 0, 4) === "RIFF" && file.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const LOCKED = () =>
  ApiError.forbidden("This application is with the platform team and cannot be edited right now.", "ONBOARDING_LOCKED");

async function load(caller: Caller): Promise<{ tenant: ITenant; admin: IUser & { email: string }; year: IAcademicYear | null }> {
  const [tenant, admin, year] = await Promise.all([
    Tenant.findById(caller.tenantId),
    User.findById(caller.userId),
    AcademicYearService.onboardingYear(caller.tenantId),
  ]);
  // The administrator signed up with an email (the invitation or the sign-up link): one without it is not one.
  if (!tenant || !admin?.email) throw ApiError.notFound("School not found", "NOT_FOUND");
  return { tenant, admin: admin as IUser & { email: string }, year };
}

function toState(tenant: ITenant, admin: IUser, year: IAcademicYear | null): OnboardingState {
  return {
    approvalStatus: tenant.approvalStatus,
    onboarding: toOnboardingProgress(tenant),
    rejectionReason: tenant.approvalStatus === "rejected" ? (tenant.review?.rejectionReason ?? null) : null,
    steps: buildSchoolSteps(tenant, admin, year),
  };
}

/**
 * Which of steps 1-4 are not valid yet, judged from what is actually stored (not from what the browser says). The stored answers are read
 * by topic (the school, its address, the year and boards): step 1 is the school and its address, step 2 the year and boards.
 */
function missingSteps(tenant: ITenant, admin: IUser, year: IAcademicYear | null): number[] {
  const steps = buildSchoolSteps(tenant, admin, year);
  const missing: number[] = [];
  if (!step1Schema.safeParse({ ...steps[1], ...steps[2] }).success) missing.push(1);
  if (!step2Schema.safeParse(steps[1]).success) missing.push(2);
  if (!step3Schema.safeParse(steps[3]).success) missing.push(3);
  if (!step4Schema.safeParse(steps[4]).success) missing.push(4);
  return missing;
}

export class OnboardingService {
  static async getState(caller: Caller): Promise<OnboardingState> {
    const { tenant, admin, year } = await load(caller);
    return toState(tenant, admin, year);
  }

  static async saveStep(caller: Caller, step: number, body: unknown): Promise<OnboardingState> {
    const { tenant, admin, year } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) throw LOCKED();

    const set: Record<string, unknown> = {};
    // The academic year is its own record (see AcademicYear); it is written right after the school update succeeded.
    let yearInput: Step2Input["academicYear"] | null = null;
    // The administrator's own details live on their user record; written only after the school update succeeded.
    let adminUpdate: Record<string, unknown> | null = null;

    if (step === 1) {
      const d = step1Schema.parse(body);
      set["name"] = d.schoolName;
      set["nameKey"] = nameKeyOf(d.schoolName);
      set["profile.schoolType"] = d.schoolType;
      set["profile.approxStudents"] = d.approxStudents;
      set["profile.udiseCode"] = d.udiseCode ?? "";
      set["profile.establishedYear"] = d.establishedYear ?? null;
      set["address.line1"] = d.addressLine1;
      set["address.line2"] = d.addressLine2 ?? "";
      set["address.city"] = d.city;
      set["address.state"] = d.state;
      set["address.division"] = d.division ?? "";
      set["address.district"] = d.district;
      set["address.pincode"] = d.pincode;
      set["contactPhone"] = d.schoolPhone;
      set["schoolEmail"] = d.schoolEmail;
      set["website"] = d.website ?? "";
    } else if (step === 2) {
      const d = step2Schema.parse(body);
      set["profile.boardEntries"] = d.boards;
      set["profile.lowestClass"] = d.lowestClass;
      set["profile.highestClass"] = d.highestClass;
      set["profile.sessionStartMonth"] = d.sessionStartMonth;
      yearInput = d.academicYear;
    } else if (step === 3) {
      const d = step3Schema.parse(body);
      adminUpdate = {
        name: d.adminName,
        designation: d.designation,
        designationOther: d.designationOther ?? "",
        phone: d.mobile,
        alternatePhone: d.alternateMobile ?? "",
      };
    } else if (step === 4) {
      step4Schema.parse(body);
      const missing = missingSteps(tenant, admin, year).filter((s) => s !== 4);
      if (missing.length > 0) {
        throw ApiError.badRequest("Finish the earlier steps first.", "ONBOARDING_INCOMPLETE", { missingSteps: missing });
      }
      set["onboarding.declarationAcceptedAt"] = new Date();
    } else {
      throw ApiError.badRequest("Unknown step", "VALIDATION_ERROR");
    }

    let updated: ITenant | null;
    try {
      // The status check inside the filter closes the gap where the school was submitted
      // (or decided on) between the check above and this write.
      updated = await Tenant.findOneAndUpdate(
        { _id: tenant._id, approvalStatus: { $in: EDITABLE } },
        { $set: set, $addToSet: { "onboarding.completedSteps": step } },
        { new: true }
      );
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const message = "A school with this name is already registered. Add the city or branch to the name.";
        throw ApiError.conflict(message, "SCHOOL_EXISTS", [{ path: "schoolName", message }]);
      }
      throw err;
    }
    if (!updated) throw LOCKED();
    if (adminUpdate) await User.updateOne({ _id: admin._id }, { $set: adminUpdate });
    let savedYear = year;
    if (yearInput) {
      try {
        savedYear = await AcademicYearService.saveOnboardingYear(tenant._id, yearInput);
      } catch (err) {
        // Without its academic year step 1 is not done: take it off the list again so the progress never claims otherwise.
        // (The school and its year are two records and this database has no multi-record transactions, so this undoes by hand.)
        await Tenant.updateOne({ _id: tenant._id }, { $pull: { "onboarding.completedSteps": 1 } }).catch(() => undefined);
        throw err;
      }
    }

    // Progress is derived from the steps that are done, never trusted from the browser.
    const done = new Set(updated.onboarding.completedSteps);
    // Changing any answer voids the declaration: the school confirms again on the review step.
    // (A separate update: $pull and $addToSet cannot touch the same field in one write.)
    const voidsDeclaration = step !== 4;
    if (voidsDeclaration) done.delete(4);
    const next = Array.from({ length: ONBOARDING_STEP_COUNT }, (_, i) => i + 1).find((s) => !done.has(s));
    const allDone = DATA_STEPS.every((s) => done.has(s)) && done.has(4);
    const fresh = await Tenant.findOneAndUpdate(
      { _id: tenant._id, approvalStatus: { $in: EDITABLE } },
      {
        $set: {
          "onboarding.status": allDone ? "COMPLETED" : "IN_PROGRESS",
          "onboarding.currentStep": next ?? ONBOARDING_STEP_COUNT,
        },
        ...(voidsDeclaration
          ? { $pull: { "onboarding.completedSteps": 4 }, $unset: { "onboarding.declarationAcceptedAt": "" } }
          : {}),
      },
      { new: true }
    );

    const freshAdmin = await User.findById(admin._id);
    return toState(fresh ?? updated, freshAdmin ?? admin, savedYear);
  }

  /** Updates the approved school's public/contact details without changing onboarding or academic setup. */
  static async updateSchoolProfile(caller: Caller, input: Step1Input): Promise<OnboardingState> {
    const { tenant } = await load(caller);
    if (tenant.approvalStatus !== "approved") throw LOCKED();
    // The signed-in account always starts on the main school; keep this guard in case a side is ever passed here.
    if (tenant.parentTenantId) throw ApiError.forbidden("Switch to the main school to edit its profile.", "FORBIDDEN");

    const set: Record<string, unknown> = {
      name: input.schoolName,
      nameKey: nameKeyOf(input.schoolName),
      "profile.schoolType": input.schoolType,
      "profile.approxStudents": input.approxStudents,
      "profile.udiseCode": input.udiseCode ?? "",
      "profile.establishedYear": input.establishedYear ?? null,
      "address.line1": input.addressLine1,
      "address.line2": input.addressLine2 ?? "",
      "address.city": input.city,
      "address.state": input.state,
      "address.division": input.division ?? "",
      "address.district": input.district,
      "address.pincode": input.pincode,
      contactPhone: input.schoolPhone,
      schoolEmail: input.schoolEmail,
      website: input.website ?? "",
    };

    let updated: ITenant | null;
    try {
      updated = await Tenant.findOneAndUpdate(
        { _id: tenant._id, approvalStatus: "approved", parentTenantId: null },
        { $set: set },
        { new: true, runValidators: true },
      );
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw SCHOOL_EXISTS();
      throw err;
    }
    if (!updated) throw LOCKED();

    // These fields describe the whole school, so keep its existing medium sides in sync while preserving their class data.
    const sideSet = { ...set };
    delete sideSet.nameKey;
    await Tenant.updateMany({ parentTenantId: updated._id, approvalStatus: "approved" }, { $set: sideSet }, { runValidators: true });

    return OnboardingService.getState(caller);
  }

  /** The school's logo, while the form can still be edited. Replaces the one before. It does not count as a step of the form. */
  static async saveLogo(caller: Caller, file: Buffer | undefined): Promise<OnboardingState> {
    const { tenant } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) throw LOCKED();
    if (!file || file.length === 0) throw ApiError.badRequest("Choose a picture for the logo.", "LOGO_MISSING", [{ path: "logo", message: "Choose a picture for the logo." }]);
    const contentType = pictureType(file);
    if (!contentType) throw ApiError.badRequest("The logo must be a PNG, JPG or WebP picture.", "LOGO_NOT_IMAGE", [{ path: "logo", message: "The logo must be a PNG, JPG or WebP picture." }]);
    await SchoolLogo.findOneAndUpdate({ tenantId: tenant._id }, { $set: { data: file, contentType } }, { upsert: true, setDefaultsOnInsert: true });
    await Tenant.updateOne({ _id: tenant._id }, { $set: { "profile.logoUpdatedAt": new Date() } });
    return OnboardingService.getState(caller);
  }

  static async removeLogo(caller: Caller): Promise<OnboardingState> {
    const { tenant } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) throw LOCKED();
    await SchoolLogo.deleteOne({ tenantId: tenant._id });
    await Tenant.updateOne({ _id: tenant._id }, { $unset: { "profile.logoUpdatedAt": "" } });
    return OnboardingService.getState(caller);
  }

  /** Sends the finished form to the platform team for a decision. */
  static async submit(caller: Caller): Promise<OnboardingState> {
    const { tenant, admin, year } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) {
      throw ApiError.conflict("This school was already submitted.", "INVALID_STATE");
    }

    const missing = missingSteps(tenant, admin, year);
    if (missing.length > 0) {
      throw ApiError.badRequest("Some steps are not finished yet.", "ONBOARDING_INCOMPLETE", { missingSteps: missing });
    }

    const wasRejected = tenant.approvalStatus === "rejected";
    const submitted = await Tenant.findOneAndUpdate(
      { _id: tenant._id, approvalStatus: { $in: EDITABLE } },
      {
        $set: { approvalStatus: "pending", "onboarding.submittedAt": new Date(), "onboarding.status": "COMPLETED" },
        ...(wasRejected ? { $inc: { "onboarding.resubmittedCount": 1 } } : {}),
      },
      { new: true }
    );
    if (!submitted) throw ApiError.conflict("This school was already submitted.", "INVALID_STATE");

    notifySuperAdminsOfSubmission(submitted, { name: admin.name, email: admin.email }, wasRejected).catch((err) =>
      logger.error("Failed to notify super admins about a submission", err)
    );

    return toState(submitted, admin, year);
  }
}
