import { ApiError } from "../../../utils/ApiError";
import { CLASS_LEVELS } from "../../tenants/constants";
import type { ITenant } from "../../tenants/models/Tenant";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { MAX_CLASSES, MAX_DEPARTMENTS, levelToClass, sectionLetters } from "../constants";
import { AcademicYear } from "../models/AcademicYear";
import { Department } from "../models/Department";
import { SchoolClass } from "../models/SchoolClass";
import { Section } from "../models/Section";
import type { QuickSetupInput } from "../schemas/academics.schemas";
import { AcademicSettingsService, type AcademicSettings } from "./academicSettings.service";
import { AcademicYearService } from "./academicYear.service";
import { isDuplicateKey, toClassDto, type ClassDto, type DepartmentDto } from "./shared";

/** The whole class / section layout of one school. It is small (a few dozen rows), so it travels in one piece. */
export interface Structure {
  /** The session the sections below belong to; null for a school that has no academic year yet. */
  academicYear: { id: string; name: string } | null;
  /** The school's switches for its academic data. */
  settings: AcademicSettings;
  /** In the order they should be shown: by their first class, empty ones last. */
  departments: DepartmentDto[];
  /** In teaching order, each with its sections. */
  classes: ClassDto[];
  totals: {
    departments: number;
    classes: number;
    sections: number;
    /** The sum of the limits that were set; a section without a limit adds nothing. */
    seats: number;
  };
}

export interface QuickSetupResult {
  departmentsCreated: number;
  classesCreated: number;
  /** Classes that were already there and were left alone. */
  classesSkipped: number;
  sectionsCreated: number;
}

export class StructureService {
  static async get(tenantId: string): Promise<Structure> {
    // Departments and classes are the school's lasting layout; sections are the current session's.
    const [year, settings] = await Promise.all([
      AcademicYear.findOne({ tenantId, status: "active" }).select("_id name").lean(),
      AcademicSettingsService.get(tenantId),
    ]);
    const [departments, classes, sections] = await Promise.all([
      Department.find({ tenantId }).lean(),
      SchoolClass.find({ tenantId }).sort({ order: 1, _id: 1 }).lean(),
      Section.find({ tenantId, academicYearId: year?._id ?? null }).lean(),
    ]);

    const sectionsByClass = new Map<string, typeof sections>();
    for (const section of sections) {
      const key = section.classId.toString();
      sectionsByClass.set(key, [...(sectionsByClass.get(key) ?? []), section]);
    }
    const classDtos = classes.map((c) => toClassDto(c, sectionsByClass.get(c._id.toString()) ?? []));

    // A department sits where its first class sits, so the screen reads Pre-Primary, Primary, Middle...
    const firstPosition = new Map<string, number>();
    const classCount = new Map<string, number>();
    classDtos.forEach((c, position) => {
      if (!c.departmentId) return;
      if (!firstPosition.has(c.departmentId)) firstPosition.set(c.departmentId, position);
      classCount.set(c.departmentId, (classCount.get(c.departmentId) ?? 0) + 1);
    });
    const departmentDtos = departments
      .map((d) => ({ id: d._id.toString(), name: d.name, classCount: classCount.get(d._id.toString()) ?? 0 }))
      .sort(
        (a, b) =>
          (firstPosition.get(a.id) ?? Infinity) - (firstPosition.get(b.id) ?? Infinity) || a.name.localeCompare(b.name)
      );

    return {
      academicYear: year ? { id: year._id.toString(), name: year.name } : null,
      settings,
      departments: departmentDtos,
      classes: classDtos,
      totals: {
        departments: departments.length,
        classes: classes.length,
        sections: sections.length,
        seats: sections.reduce((sum, s) => sum + (s.capacity ?? 0), 0),
      },
    };
  }

  /**
   * The classes a school said it has when it signed up (from its lowest to its highest class), made when the school is
   * approved so its Classes page is never empty. No sections: the school adds them class by class. Does nothing when
   * the school gave no range. Safe to run again: classes that exist are left alone.
   */
  static async startFromProfile(tenant: Pick<ITenant, "_id" | "profile">): Promise<QuickSetupResult | null> {
    const fromClass = tenant.profile?.lowestClass;
    const toClass = tenant.profile?.highestClass;
    if (!fromClass || !toClass || CLASS_LEVELS.indexOf(fromClass) > CLASS_LEVELS.indexOf(toClass)) return null;
    return StructureService.quickSetup(tenant._id.toString(), { fromClass, toClass, sectionsPerClass: 0 });
  }

  /**
   * Builds the usual layout in one go: every class from `fromClass` to `toClass` (Nursery to 12, say), each
   * in its usual department, with sections A, B... Safe to run again or on a school that has some classes:
   * anything that already exists is left exactly as it is.
   */
  static async quickSetup(tenantId: string, input: QuickSetupInput): Promise<QuickSetupResult> {
    const from = CLASS_LEVELS.indexOf(input.fromClass);
    const to = CLASS_LEVELS.indexOf(input.toClass);
    const plan = CLASS_LEVELS.slice(from, to + 1).map(levelToClass);

    const wantedClasses = plan.map((p) => nameKeyOf(p.name));
    const wantedDepartments = [...new Set(plan.map((p) => p.department))];

    const [existingClasses, existingDepartments, classTotal, lastClass] = await Promise.all([
      SchoolClass.find({ tenantId, nameKey: { $in: wantedClasses } }).select("nameKey").lean(),
      Department.find({ tenantId }).lean(),
      SchoolClass.countDocuments({ tenantId }),
      SchoolClass.findOne({ tenantId }).sort({ order: -1 }).select("order").lean(),
    ]);

    const haveClass = new Set(existingClasses.map((c) => c.nameKey));
    const missingClasses = plan.filter((p) => !haveClass.has(nameKeyOf(p.name)));
    const departmentIds = new Map(existingDepartments.map((d) => [d.nameKey, d._id]));
    const missingDepartments = wantedDepartments.filter((name) => !departmentIds.has(nameKeyOf(name)));

    if (classTotal + missingClasses.length > MAX_CLASSES) {
      throw ApiError.conflict(`A school can have up to ${MAX_CLASSES} classes.`, "LIMIT_REACHED");
    }
    if (existingDepartments.length + missingDepartments.length > MAX_DEPARTMENTS) {
      throw ApiError.conflict(`A school can have up to ${MAX_DEPARTMENTS} departments.`, "LIMIT_REACHED");
    }

    try {
      if (missingDepartments.length > 0) {
        const created = await Department.insertMany(
          missingDepartments.map((name) => ({ tenantId, name, nameKey: nameKeyOf(name) }))
        );
        for (const d of created) departmentIds.set(d.nameKey, d._id);
      }

      const startAt = (lastClass?.order ?? 0) + 1;
      const classes = await SchoolClass.insertMany(
        missingClasses.map((p, i) => ({
          tenantId,
          name: p.name,
          nameKey: nameKeyOf(p.name),
          departmentId: departmentIds.get(nameKeyOf(p.department)) ?? null,
          order: startAt + i,
        }))
      );
      const academicYearId = await AcademicYearService.activeYearId(tenantId);
      const sections = await Section.insertMany(
        classes.flatMap((c) =>
          sectionLetters(input.sectionsPerClass).map((name) => ({ tenantId, classId: c._id, academicYearId, name, nameKey: nameKeyOf(name) }))
        )
      );

      return {
        departmentsCreated: missingDepartments.length,
        classesCreated: classes.length,
        classesSkipped: plan.length - missingClasses.length,
        sectionsCreated: sections.length,
      };
    } catch (err) {
      // Two clicks at the same moment: the other request created them first.
      if (isDuplicateKey(err)) {
        throw ApiError.conflict("These classes were just created. Reload the page to see them.", "ALREADY_EXISTS");
      }
      throw err;
    }
  }
}
