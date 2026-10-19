import { ApiError } from "../../../utils/ApiError";
import { logger } from "../../../utils/logger";
import { ONBOARDING_STEP_COUNT, DATA_STEPS } from "../../tenants/constants";
import { Tenant, type ApprovalStatus, type ITenant } from "../../tenants/models/Tenant";
import { notifySuperAdminsOfSubmission } from "../../tenants/services/notifications";
import { buildSchoolSteps, type SchoolSteps } from "../../tenants/services/schoolDetails";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import {
  toOnboardingProgress,
  type OnboardingProgress,
} from "../../tenants/services/tenantState";
import { User, type IUser } from "../../users/models/User";
import { step1Schema, step2Schema, step3Schema, step4Schema } from "../schemas/onboarding.schemas";

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

const LOCKED = () =>
  ApiError.forbidden("This application is with the platform team and cannot be edited right now.", "ONBOARDING_LOCKED");

async function load(caller: Caller): Promise<{ tenant: ITenant; admin: IUser }> {
  const [tenant, admin] = await Promise.all([Tenant.findById(caller.tenantId), User.findById(caller.userId)]);
  if (!tenant || !admin) throw ApiError.notFound("School not found", "NOT_FOUND");
  return { tenant, admin };
}

function toState(tenant: ITenant, admin: IUser): OnboardingState {
  return {
    approvalStatus: tenant.approvalStatus,
    onboarding: toOnboardingProgress(tenant),
    rejectionReason: tenant.approvalStatus === "rejected" ? (tenant.review?.rejectionReason ?? null) : null,
    steps: buildSchoolSteps(tenant, admin),
  };
}

/** Which of steps 1-4 are not valid yet, judged from what is actually stored (not from what the browser says). */
function missingSteps(tenant: ITenant, admin: IUser): number[] {
  const steps = buildSchoolSteps(tenant, admin);
  const missing: number[] = [];
  if (!step1Schema.safeParse(steps[1]).success) missing.push(1);
  if (!step2Schema.safeParse(steps[2]).success) missing.push(2);
  if (!step3Schema.safeParse(steps[3]).success) missing.push(3);
  if (!step4Schema.safeParse(steps[4]).success) missing.push(4);
  return missing;
}

export class OnboardingService {
  static async getState(caller: Caller): Promise<OnboardingState> {
    const { tenant, admin } = await load(caller);
    return toState(tenant, admin);
  }

  static async saveStep(caller: Caller, step: number, body: unknown): Promise<OnboardingState> {
    const { tenant, admin } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) throw LOCKED();

    const set: Record<string, unknown> = {};
    // The administrator's own details live on their user record; written only after the school update succeeded.
    let adminUpdate: Record<string, unknown> | null = null;

    if (step === 1) {
      const d = step1Schema.parse(body);
      set["name"] = d.schoolName;
      set["nameKey"] = nameKeyOf(d.schoolName);
      set["profile.schoolType"] = d.schoolType;
      set["profile.boardEntries"] = d.boards;
      set["profile.lowestClass"] = d.lowestClass;
      set["profile.highestClass"] = d.highestClass;
      set["profile.approxStudents"] = d.approxStudents;
      set["profile.sessionStartMonth"] = d.sessionStartMonth;
      set["profile.udiseCode"] = d.udiseCode ?? "";
      set["profile.establishedYear"] = d.establishedYear ?? null;
    } else if (step === 2) {
      const d = step2Schema.parse(body);
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
      const missing = missingSteps(tenant, admin).filter((s) => s !== 4);
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
    return toState(fresh ?? updated, freshAdmin ?? admin);
  }

  /** Sends the finished form to the platform team for a decision. */
  static async submit(caller: Caller): Promise<OnboardingState> {
    const { tenant, admin } = await load(caller);
    if (!EDITABLE.includes(tenant.approvalStatus)) {
      throw ApiError.conflict("This school was already submitted.", "INVALID_STATE");
    }

    const missing = missingSteps(tenant, admin);
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

    return toState(submitted, admin);
  }
}
