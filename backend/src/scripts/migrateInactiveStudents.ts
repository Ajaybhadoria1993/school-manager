/**
 * One-off, safe to run again: brings students that were moved to the (short-lived) Recycle bin to the Active / Inactive status.
 *
 *   npm run migrate:inactive-students
 *
 * What it does: a student with `status: "deleted"` becomes `status: "inactive"` and its `trash` details become `inactive`
 * (when, by whom, the roll number it had); its enrolments with `status: "deleted"` become `inactive`. Nothing is deleted: students are
 * never deleted any more. The old `studentdeletionlogs` collection is left as it is (it is not read any more).
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Enrolment } from "../main/students/models/Enrolment";
import { Student } from "../main/students/models/Student";
import { logger } from "../utils/logger";

async function main(): Promise<void> {
  await connectDB();

  // Straight on the collections: the old values are not in the schema's enum any more.
  const students = await Student.collection.updateMany({ status: "deleted" }, { $set: { status: "inactive" } });
  const renamed = await Student.collection.updateMany({ trash: { $exists: true } }, { $rename: { trash: "inactive" } });
  const enrolments = await Enrolment.collection.updateMany({ status: "deleted" }, { $set: { status: "inactive" } });
  logger.info(`[migrate] students made inactive: ${students.modifiedCount}; their details renamed: ${renamed.modifiedCount}; enrolments: ${enrolments.modifiedCount}`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    logger.error("[migrate] failed", err);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
