import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Section } from "../../academics/models/Section";
import { MAX_ROLL_NUMBER } from "../constants";
import { Enrolment } from "../models/Enrolment";

/** How full one section of the current year is. `seatsLeft` is null for a section with no seat limit. */
export interface SectionLoadDto {
  sectionId: string;
  classId: string;
  capacity: number | null;
  enrolled: number;
  seatsLeft: number | null;
  /** The roll number after the highest one given in this section this year (1 when none is given yet); null past the last (999). */
  nextRollNumber: number | null;
}

/** How full the school is this year: per section (the admission form's "seats left"), per class, and in all (the list's tiles). */
export interface CapacityDto {
  academicYear: { id: string; name: string } | null;
  sections: SectionLoadDto[];
  /**
   * Every class that has students this year, with or without sections. `nextRollNumber` is for the students who sit in the class as a
   * whole (a class without sections): the one after the highest given, 1 when none is given yet.
   */
  classes: { classId: string; enrolled: number; nextRollNumber: number | null }[];
  totals: {
    students: number;
    /** The seats of the sections that have a limit. */
    seats: number;
    /** Free seats in those sections (a section over its limit counts as 0, not as minus). */
    seatsLeft: number;
    fullSections: number;
  };
}

/** The roll number after `highest` (1 when none is given), or null when the last one (999) is taken. */
const nextRoll = (highest: number | null) => {
  const next = (highest ?? 0) + 1;
  return next > MAX_ROLL_NUMBER ? null : next;
};

export class CapacityService {
  static async summary(tenantId: string): Promise<CapacityDto> {
    const school = new Types.ObjectId(tenantId);
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id name").lean();
    if (!year) return { academicYear: null, sections: [], classes: [], totals: { students: 0, seats: 0, seatsLeft: 0, fullSections: 0 } };

    const [sections, counts] = await Promise.all([
      Section.find({ tenantId: school, academicYearId: year._id }).select("classId capacity").lean(),
      // One pass: how many sit in each section (or class as a whole) and the highest roll number given there ($max skips "none").
      Enrolment.aggregate<{ _id: { classId: Types.ObjectId; sectionId: Types.ObjectId | null }; n: number; maxRoll: number | null }>([
        { $match: { tenantId: school, academicYearId: year._id, status: "active" } },
        { $group: { _id: { classId: "$classId", sectionId: "$sectionId" }, n: { $sum: 1 }, maxRoll: { $max: "$rollNumber" } } },
      ]),
    ]);

    const bySection = new Map<string, { n: number; maxRoll: number | null }>();
    const byClass = new Map<string, number>();
    const wholeClassMaxRoll = new Map<string, number | null>();
    for (const c of counts) {
      if (c._id.sectionId) bySection.set(c._id.sectionId.toString(), { n: c.n, maxRoll: c.maxRoll });
      else wholeClassMaxRoll.set(c._id.classId.toString(), c.maxRoll);
      byClass.set(c._id.classId.toString(), (byClass.get(c._id.classId.toString()) ?? 0) + c.n);
    }

    const loads: SectionLoadDto[] = sections.map((s) => {
      const here = bySection.get(s._id.toString());
      const enrolled = here?.n ?? 0;
      const capacity = s.capacity ?? null;
      return {
        sectionId: s._id.toString(),
        classId: s.classId.toString(),
        capacity,
        enrolled,
        seatsLeft: capacity === null ? null : Math.max(0, capacity - enrolled),
        nextRollNumber: nextRoll(here?.maxRoll ?? null),
      };
    });
    const limited = loads.filter((l) => l.capacity !== null);

    return {
      academicYear: { id: year._id.toString(), name: year.name },
      sections: loads,
      classes: [...byClass].map(([classId, enrolled]) => ({ classId, enrolled, nextRollNumber: nextRoll(wholeClassMaxRoll.get(classId) ?? null) })),
      totals: {
        students: counts.reduce((sum, c) => sum + c.n, 0),
        seats: limited.reduce((sum, l) => sum + (l.capacity ?? 0), 0),
        seatsLeft: limited.reduce((sum, l) => sum + (l.seatsLeft ?? 0), 0),
        fullSections: limited.filter((l) => l.seatsLeft === 0).length,
      },
    };
  }
}
