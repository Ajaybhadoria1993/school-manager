import { Types } from "mongoose";
import { Teacher } from "../main/staff/models/Teacher";

/**
 * Teachers who were added to the app on a day of the past (default: the start of the year). A teacher's days count from the later of the day
 * they joined and the day they were added to the app (2026-11-22: nobody could take their attendance before that, so such a day is "Not
 * joined", not an absence). The tests look at days of the past while the teachers they build are made now, so they move the day of adding
 * back. It goes round Mongoose (a record's createdAt is fixed there) and is only for tests.
 */
export async function addedToTheApp(tenantId: string, teacherIds: string[], day = "2026-04-01", indianTime?: string) {
  // Without a time: the very start of the day (school has not started, so the day counts). With one ("16:00"): that Indian time.
  const at = indianTime ? new Date(`${day}T${indianTime}:00+05:30`) : new Date(`${day}T00:00:00.000Z`);
  await Teacher.collection.updateMany({ tenantId: new Types.ObjectId(tenantId), _id: { $in: teacherIds.map((id) => new Types.ObjectId(id)) } }, { $set: { createdAt: at } });
}

/** The same for every teacher of a school (a test that builds its own staff and looks at days of the past). */
export async function everyoneAddedToTheApp(tenantId: string, day = "2026-04-01") {
  await Teacher.collection.updateMany({ tenantId: new Types.ObjectId(tenantId) }, { $set: { createdAt: new Date(`${day}T00:00:00.000Z`) } });
}
