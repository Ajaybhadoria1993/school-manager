import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { MAX_SECTION_CAPACITY } from "../../academics/constants";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { seatsHeldBySections } from "../../academics/services/seats";
import type { Placement } from "./placement";

/** What raising the seats of a place changed, for the screen to tell the person ("Class 5 now has 45 seats"). */
export interface SeatsChanged {
  classId: string;
  className: string;
  /** The section whose seats were raised; null when it was the class itself (a class with no sections). */
  sectionId: string | null;
  sectionName: string | null;
  from: number;
  to: number;
  /** The class's seats before and after, when raising a section made the class's seats too few for its sections; otherwise null. */
  classFrom: number | null;
  classTo: number | null;
}

export interface SeatRaise {
  /** Null when nothing needed to change (no limit, or the seats already are `to` or more). */
  changed: SeatsChanged | null;
  /** Puts the seats back as they were, when a later step of the same request fails (there are no transactions, see AdmissionService). */
  undo: () => Promise<void>;
}

const NOTHING: SeatRaise = { changed: null, undo: async () => undefined };

/**
 * Raises the seats of the place a student is being put in to `to`: the section's, or the class's own when it has no sections. A section's
 * seats are part of its class's, so when the section outgrows what the class has, the class's seats grow to hold its sections. Seats are
 * only ever raised here, never lowered. The caller has already checked that `to` leaves room for the student (placement.assertSeat).
 */
export async function raiseSeats(school: Types.ObjectId, academicYearId: Types.ObjectId, placement: Placement, to: number): Promise<SeatRaise> {
  const from = placement.capacity;
  if (from === null || to <= from) return NOTHING;

  if (placement.sectionId === null) {
    await SchoolClass.updateOne({ _id: placement.classId, tenantId: school }, { $set: { capacity: to } });
    return {
      changed: { classId: placement.classId.toString(), className: placement.className, sectionId: null, sectionName: null, from, to, classFrom: null, classTo: null },
      undo: async () => {
        await SchoolClass.updateOne({ _id: placement.classId, tenantId: school }, { $set: { capacity: from } });
      },
    };
  }

  if (to > MAX_SECTION_CAPACITY) {
    throw ApiError.badRequest(`A section can have up to ${MAX_SECTION_CAPACITY} seats.`, "SEATS_TOO_MANY", [
      { path: "raiseSeatsTo", message: `At most ${MAX_SECTION_CAPACITY} seats in a section` },
    ]);
  }
  const sectionId = placement.sectionId;
  await Section.updateOne({ _id: sectionId, tenantId: school }, { $set: { capacity: to } });
  const klass = await SchoolClass.findOne({ _id: placement.classId, tenantId: school }).select("capacity").lean();
  const held = await seatsHeldBySections(school.toString(), placement.classId.toString(), academicYearId);
  const classFrom = klass?.capacity ?? null;
  const classRaised = classFrom !== null && held > classFrom;
  if (classRaised) await SchoolClass.updateOne({ _id: placement.classId, tenantId: school }, { $set: { capacity: held } });
  return {
    changed: {
      classId: placement.classId.toString(),
      className: placement.className,
      sectionId: sectionId.toString(),
      sectionName: placement.sectionName,
      from,
      to,
      classFrom: classRaised ? classFrom : null,
      classTo: classRaised ? held : null,
    },
    undo: async () => {
      await Section.updateOne({ _id: sectionId, tenantId: school }, { $set: { capacity: from } });
      if (classRaised) await SchoolClass.updateOne({ _id: placement.classId, tenantId: school }, { $set: { capacity: classFrom } });
    },
  };
}
