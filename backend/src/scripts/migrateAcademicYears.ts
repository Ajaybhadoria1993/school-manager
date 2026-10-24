/**
 * One-off, safe to run again: brings an existing database up to academic years.
 *
 *   npm run migrate:academic-years
 *
 * What it does:
 *  1. Sections: drops the old unique index { classId, nameKey } (one "A" per class for ever) and builds the new ones
 *     { classId, academicYearId, nameKey } (one "A" per class per academic year) and { tenantId, academicYearId }.
 *  2. Academic years: builds their indexes, including the two that keep one active year, and one sign-up year, per school.
 *  3. Reports, without changing anything, the approved schools that have no academic year (they signed up before academic years
 *     existed) and how many sections have none yet. Nothing is guessed for them: each such school's administrator is asked on the
 *     dashboard to name the session that is running now, and that school's sections are given that year at that moment.
 *
 * It never deletes or rewrites records. Run it against a backup first in production.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { AcademicYear } from "../main/academics/models/AcademicYear";
import { Section } from "../main/academics/models/Section";
import { Tenant } from "../main/tenants/models/Tenant";
import { ALL_TENANTS } from "../main/tenants/plugins/tenantScope";
import { logger } from "../utils/logger";

const OLD_SECTION_INDEX = "classId_1_nameKey_1";

async function main(): Promise<void> {
  await connectDB();

  const sectionIndexes = await Section.collection.indexes().catch(() => []);
  if (sectionIndexes.some((index) => index.name === OLD_SECTION_INDEX)) {
    await Section.collection.dropIndex(OLD_SECTION_INDEX);
    logger.info(`[migrate] sections: dropped the old index ${OLD_SECTION_INDEX}`);
  } else {
    logger.info("[migrate] sections: the old index is already gone");
  }
  await Section.createIndexes();
  await AcademicYear.createIndexes();
  logger.info("[migrate] indexes built for sections and academic years");

  const approved = await Tenant.find({ approvalStatus: "approved" }).select("_id name").lean();
  const withYear = new Set((await AcademicYear.distinct("tenantId").setOptions(ALL_TENANTS)).map((id) => String(id)));
  const without = approved.filter((school) => !withYear.has(school._id.toString()));
  const yearless = await Section.countDocuments({ academicYearId: null }).setOptions(ALL_TENANTS);

  logger.info(`[migrate] approved schools without an academic year: ${without.length}`);
  for (const school of without) logger.info(`[migrate]   - ${school.name} (${school._id.toString()})`);
  logger.info(`[migrate] sections without an academic year: ${yearless} (each school's are given its first year when it sets one up)`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    logger.error("[migrate] failed", err);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
