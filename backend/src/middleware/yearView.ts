import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { AcademicYear } from "../main/academics/models/AcademicYear";
import { inYearView } from "../main/academics/services/viewedYear";

/** The header a screen sends to look at a past academic year. */
export const YEAR_HEADER = "x-academic-year";

const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * Looking at a past academic year (see academics/services/viewedYear.ts). Placed right after requireAuth on the routes whose reads know how
 * to answer for a past year (students, classes, attendance, exams). With `X-Academic-Year: <id of a closed year of the caller's school>`:
 *   - a read is answered for that year;
 *   - anything that would change something is refused (409 YEAR_READ_ONLY): a year that is over is never written to.
 * The id of the running year is the same as no header. A year that is not an id (400), is not this school's or does not exist (404, the
 * same answer, so another school's year is never confirmed) or has not started yet (409: nothing happened in it) is refused.
 */
export const yearView = asyncHandler(async (req, _res, next) => {
  const asked = req.get(YEAR_HEADER)?.trim();
  if (!asked || !req.user?.tenantId) return next();

  if (!Types.ObjectId.isValid(asked) || String(new Types.ObjectId(asked)) !== asked.toLowerCase()) {
    throw ApiError.badRequest("That is not an academic year.", "INVALID_YEAR");
  }
  const year = await AcademicYear.findOne({ _id: asked, tenantId: new Types.ObjectId(req.user.tenantId) }).select("name status").lean();
  if (!year) throw ApiError.notFound("That academic year is not in your school.", "YEAR_NOT_FOUND");
  if (year.status === "pending") throw ApiError.conflict(`${year.name} has not started yet, so there is nothing to look at.`, "YEAR_NOT_STARTED");
  if (year.status === "active") return next();

  if (!READ_METHODS.has(req.method)) {
    throw ApiError.conflict(`${year.name} is over, so it can only be looked at. Go back to the running year to change anything.`, "YEAR_READ_ONLY");
  }
  inYearView({ yearId: year._id, name: year.name }, () => next());
});
