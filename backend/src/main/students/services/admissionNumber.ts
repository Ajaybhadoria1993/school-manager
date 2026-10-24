import { Types } from "mongoose";
import type { IAcademicYear } from "../../academics/models/AcademicYear";
import { isDuplicateKey } from "../../academics/services/shared";
import { admissionNumberOf } from "../constants";
import { AdmissionCounter } from "../models/AdmissionCounter";

/**
 * The next admission number of the school for this academic year ("ADM-2026-0007"). One atomic `$inc` on the year's counter, so
 * requests at the same moment each get their own number, in order. The first admission of a year creates the counter (an upsert);
 * two first admissions at once may both try to create it, and the one that loses simply increments the counter the other made.
 */
export async function nextAdmissionNumber(tenantId: Types.ObjectId, year: Pick<IAcademicYear, "_id" | "startDate">): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const counter = await AdmissionCounter.findOneAndUpdate(
        { tenantId, academicYearId: year._id },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      ).lean();
      return admissionNumberOf(year.startDate.getUTCFullYear(), counter!.seq);
    } catch (err) {
      if (!isDuplicateKey(err) || attempt >= 3) throw err;
    }
  }
}
