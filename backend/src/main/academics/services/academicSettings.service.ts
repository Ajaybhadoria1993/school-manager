import { ApiError } from "../../../utils/ApiError";
import { Tenant } from "../../tenants/models/Tenant";
import type { AcademicSettingsInput } from "../schemas/academics.schemas";

/** The school's switches for how its academic data is kept. */
export interface AcademicSettings {
  /** A section must have its seats and its room (on by default); a school may make them optional. */
  sectionDetailsRequired: boolean;
}

const DEFAULTS: AcademicSettings = { sectionDetailsRequired: true };

/**
 * The switches live on the school itself (`Tenant.settings`), so the server, not the browser, decides what a section needs. A
 * value that was never set means the default, so a school made before a switch existed gets the default without a migration.
 */
export class AcademicSettingsService {
  static async get(tenantId: string): Promise<AcademicSettings> {
    const tenant = await Tenant.findById(tenantId).select("settings").lean();
    if (!tenant) throw ApiError.notFound("School not found", "NOT_FOUND");
    return { sectionDetailsRequired: tenant.settings?.sectionDetailsRequired ?? DEFAULTS.sectionDetailsRequired };
  }

  static async update(tenantId: string, input: AcademicSettingsInput): Promise<AcademicSettings> {
    const updated = await Tenant.findOneAndUpdate(
      { _id: tenantId },
      { $set: { "settings.sectionDetailsRequired": input.sectionDetailsRequired } },
      { new: true }
    )
      .select("settings")
      .lean();
    if (!updated) throw ApiError.notFound("School not found", "NOT_FOUND");
    return { sectionDetailsRequired: updated.settings?.sectionDetailsRequired ?? DEFAULTS.sectionDetailsRequired };
  }
}
