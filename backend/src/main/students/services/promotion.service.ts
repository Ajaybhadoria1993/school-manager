import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear, type IAcademicYear } from "../../academics/models/AcademicYear";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import { isDuplicateKey } from "../../academics/services/shared";
import { MAX_PROMOTION_ENTRIES, type PromotionOutcome, type PromotionStatus } from "../constants";
import { Enrolment } from "../models/Enrolment";
import { PromotionBatch, type IPromotionBatch, type IPromotionEntry } from "../models/PromotionBatch";
import { Student } from "../models/Student";
import type { UpdatePromotionInput } from "../schemas/students.schemas";
import { classAfter } from "../classNumber";
import { actorRecord, type Actor } from "./actor";
import { fullName } from "./shared";

/** The classes of the next year with the sections it has, in teaching order: where a student of the list can be put. */
export interface PromotionTarget {
  classId: string;
  className: string;
  sections: { id: string; name: string; capacity: number | null }[];
}

export interface PromotionEntryDto {
  studentId: string;
  name: string;
  admissionNumber: string;
  from: { classId: string; className: string; sectionId: string | null; sectionName: string | null };
  outcome: PromotionOutcome;
  to: { classId: string; className: string; sectionId: string | null; sectionName: string | null } | null;
}

export interface PromotionDto {
  id: string;
  status: PromotionStatus;
  fromYear: { id: string; name: string };
  toYear: { id: string; name: string };
  summary: { total: number; promote: number; retain: number; leave: number };
  createdBy: { name: string; role: string };
  createdAt: string;
  submitted: { by: { name: string; role: string }; at: string } | null;
  decision: { outcome: "approved" | "rejected"; by: { name: string; role: string }; at: string; note: string | null } | null;
  appliedAt: string | null;
  entries: PromotionEntryDto[];
  targets: PromotionTarget[];
}

const NOT_FOUND = () => ApiError.notFound("This promotion list was not found.", "PROMOTION_NOT_FOUND");
const WRONG_STATE = (wanted: string, status: PromotionStatus) =>
  ApiError.conflict(`This promotion list is ${status}, so it cannot be ${wanted} now.`, status === "draft" ? "PROMOTION_NOT_SUBMITTED" : "PROMOTION_NOT_DRAFT");

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

type Targets = (PromotionTarget & { order: number; nameKeys: Map<string, string> })[];

/**
 * Promotion: who goes to which class of the next academic year, decided as a list that the school admin approves. A list is made for
 * the year that waits (`pending`) with a suggestion for every student of the running year (the next class, the same section by name;
 * from the last class: leave), changed by whoever admits students (promote to a class, stay in the class, or leave), sent for
 * approval, and approved only by the school admin, who may also send it back with a note. Approval gives each student who goes on a
 * place (an enrolment) in the next year; the running year is not touched. The students who leave are made inactive when the next
 * year is switched on (`YearActivationService`). No transactions: a step that fails after approval is taken back (see `approve`).
 */
export class PromotionService {
  /** The running year and the year that waits, or the reason there is no promotion to make. */
  private static async years(school: Types.ObjectId, toYearId: string): Promise<{ running: IAcademicYear; to: IAcademicYear }> {
    const running = await AcademicYear.findOne({ tenantId: school, status: "active" }).lean();
    if (!running) throw ApiError.conflict("Your school has no running academic year yet.", "NO_ACTIVE_YEAR");
    const to = await AcademicYear.findOne({ _id: toYearId, tenantId: school }).lean();
    if (!to) throw ApiError.notFound("That academic year is not in your school.", "ACADEMIC_YEAR_NOT_FOUND");
    if (to.status !== "pending") {
      throw ApiError.conflict(`${to.name} is not the next year: students are promoted into a year that is waiting.`, "NEXT_YEAR_NOT_WAITING");
    }
    return { running, to };
  }

  /** The classes of the school in teaching order, each with the sections it has in the year that waits. */
  private static async targets(school: Types.ObjectId, toYearId: Types.ObjectId): Promise<Targets> {
    const [classes, sections] = await Promise.all([
      SchoolClass.find({ tenantId: school }).sort({ order: 1, _id: 1 }).select("name order").lean(),
      Section.find({ tenantId: school, academicYearId: toYearId }).select("classId name nameKey capacity").lean(),
    ]);
    return classes.map((c) => {
      const mine = sections.filter((s) => s.classId.equals(c._id)).sort((a, b) => byName(a, b));
      return {
        classId: c._id.toString(),
        className: c.name,
        order: c.order,
        sections: mine.map((s) => ({ id: s._id.toString(), name: s.name, capacity: s.capacity ?? null })),
        nameKeys: new Map(mine.map((s) => [s.nameKey, s._id.toString()])),
      };
    });
  }

  /** A class of the next year for an entry, with its section: the one with the same name as the section it comes from, else the first. */
  private static place(targets: Targets, classId: string, fromSectionName: string | null, sectionId?: string | null) {
    const target = targets.find((t) => t.classId === classId);
    if (!target) return null;
    const wanted = sectionId ?? (target.nameKeys.get((fromSectionName ?? "").trim().toLowerCase()) ?? target.sections[0]?.id ?? null);
    const section = wanted ? target.sections.find((s) => s.id === wanted) : undefined;
    if (wanted && !section) return null;
    if (!wanted && target.sections.length > 0) return null;
    return { toClassId: new Types.ObjectId(target.classId), toClassName: target.className, toSectionId: section ? new Types.ObjectId(section.id) : null, toSectionName: section?.name ?? null };
  }

  private static async dto(batch: IPromotionBatch, running: Pick<IAcademicYear, "_id" | "name">, to: Pick<IAcademicYear, "_id" | "name">): Promise<PromotionDto> {
    const targets = await PromotionService.targets(batch.tenantId, to._id);
    const count = (outcome: PromotionOutcome) => batch.entries.filter((e) => e.outcome === outcome).length;
    const who = (p: { name: string; role: string }) => ({ name: p.name, role: p.role });
    return {
      id: batch._id.toString(),
      status: batch.status,
      fromYear: { id: running._id.toString(), name: running.name },
      toYear: { id: to._id.toString(), name: to.name },
      summary: { total: batch.entries.length, promote: count("promote"), retain: count("retain"), leave: count("leave") },
      createdBy: who(batch.createdBy),
      createdAt: batch.createdAt.toISOString(),
      submitted: batch.submitted ? { by: who(batch.submitted.by), at: batch.submitted.at.toISOString() } : null,
      decision: batch.decision ? { outcome: batch.decision.outcome, by: who(batch.decision.by), at: batch.decision.at.toISOString(), note: batch.decision.note ?? null } : null,
      appliedAt: batch.appliedAt ? batch.appliedAt.toISOString() : null,
      entries: batch.entries.map((e) => ({
        studentId: e.studentId.toString(),
        name: e.name,
        admissionNumber: e.admissionNumber,
        from: { classId: e.fromClassId.toString(), className: e.fromClassName, sectionId: e.fromSectionId ? e.fromSectionId.toString() : null, sectionName: e.fromSectionName ?? null },
        outcome: e.outcome,
        to: e.toClassId && e.toClassName ? { classId: e.toClassId.toString(), className: e.toClassName, sectionId: e.toSectionId ? e.toSectionId.toString() : null, sectionName: e.toSectionName ?? null } : null,
      })),
      targets: targets.map((t) => ({ classId: t.classId, className: t.className, sections: t.sections })),
    };
  }

  /** The open list for the year that waits (the one being made, waiting for approval or approved), or null. */
  static async get(tenantId: string, toYearId: string): Promise<PromotionDto | null> {
    const school = new Types.ObjectId(tenantId);
    const batch = await PromotionBatch.findOne({ tenantId: school, toAcademicYearId: toYearId, openKey: "open" }).lean();
    if (!batch) return null;
    const [running, to] = await Promise.all([
      AcademicYear.findOne({ _id: batch.academicYearId, tenantId: school }).select("name").lean(),
      AcademicYear.findOne({ _id: batch.toAcademicYearId, tenantId: school }).select("name").lean(),
    ]);
    if (!running || !to) return null;
    return PromotionService.dto(batch, running, to);
  }

  /** Makes the draft list with a suggestion for every student of the running year. */
  static async start(tenantId: string, actor: Actor, toYearId: string): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { running, to } = await PromotionService.years(school, toYearId);
    if (await PromotionBatch.exists({ tenantId: school, toAcademicYearId: to._id, openKey: "open" })) throw EXISTS();

    const enrolments = await Enrolment.find({ tenantId: school, academicYearId: running._id, status: "active" }).lean();
    const [students, classes, sections, targets] = await Promise.all([
      Student.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) }, status: "active" }).select("firstName lastName admissionNumber nameKey").lean(),
      SchoolClass.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.classId) } }).select("name order").lean(),
      Section.find({ tenantId: school, _id: { $in: enrolments.flatMap((e) => (e.sectionId ? [e.sectionId] : [])) } }).select("name").lean(),
      PromotionService.targets(school, to._id),
    ]);
    if (students.length > MAX_PROMOTION_ENTRIES) {
      throw ApiError.conflict(`A promotion list holds up to ${MAX_PROMOTION_ENTRIES} students.`, "PROMOTION_TOO_BIG");
    }
    const student = new Map(students.map((s) => [s._id.toString(), s]));
    const className = new Map(classes.map((c) => [c._id.toString(), c]));
    const sectionName = new Map(sections.map((s) => [s._id.toString(), s.name]));

    const entries: IPromotionEntry[] = [];
    for (const e of enrolments) {
      const s = student.get(e.studentId.toString());
      const from = className.get(e.classId.toString());
      if (!s || !from) continue;
      const fromSection = e.sectionId ? (sectionName.get(e.sectionId.toString()) ?? null) : null;
      // The next class in teaching order, in the same section name when there is one; from the last class the student leaves.
      const at = targets.findIndex((t) => t.classId === e.classId.toString());
      const next = classAfter(targets, at);
      const place = next ? PromotionService.place(targets, next.classId, fromSection) : null;
      entries.push({
        studentId: s._id,
        name: fullName(s),
        admissionNumber: s.admissionNumber,
        fromEnrolmentId: e._id,
        fromClassId: e.classId,
        fromClassName: from.name,
        fromSectionId: e.sectionId ?? null,
        fromSectionName: fromSection,
        outcome: place ? "promote" : "leave",
        toClassId: place?.toClassId ?? null,
        toClassName: place?.toClassName ?? null,
        toSectionId: place?.toSectionId ?? null,
        toSectionName: place?.toSectionName ?? null,
      });
    }
    const order = new Map(classes.map((c) => [c._id.toString(), c.order]));
    entries.sort(
      (a, b) =>
        (order.get(a.fromClassId.toString()) ?? 0) - (order.get(b.fromClassId.toString()) ?? 0) ||
        (a.fromSectionName ?? "").localeCompare(b.fromSectionName ?? "", undefined, { numeric: true }) ||
        a.name.localeCompare(b.name)
    );

    try {
      const batch = await PromotionBatch.create({
        tenantId: school,
        academicYearId: running._id,
        toAcademicYearId: to._id,
        status: "draft",
        entries,
        createdBy: await actorRecord(actor),
      });
      return PromotionService.dto(batch.toObject(), running, to);
    } catch (err) {
      if (isDuplicateKey(err)) throw EXISTS();
      throw err;
    }
  }

  /** The list of this school, only while it is open; `status` limits which states are allowed for the action. */
  private static async load(school: Types.ObjectId, id: string, allowed: PromotionStatus[], wanted: string) {
    const batch = await PromotionBatch.findOne({ _id: id, tenantId: school }).lean();
    if (!batch) throw NOT_FOUND();
    if (!allowed.includes(batch.status)) throw WRONG_STATE(wanted, batch.status);
    const [running, to] = await Promise.all([
      AcademicYear.findOne({ _id: batch.academicYearId, tenantId: school }).lean(),
      AcademicYear.findOne({ _id: batch.toAcademicYearId, tenantId: school }).lean(),
    ]);
    if (!running || !to) throw NOT_FOUND();
    return { batch, running, to };
  }

  /** The next year must still be waiting: once it is on, the list can no longer be changed. */
  private static stillWaiting(to: IAcademicYear) {
    if (to.status !== "pending") throw ApiError.conflict(`${to.name} is already on, so this list can no longer be changed.`, "NEXT_YEAR_NOT_WAITING");
  }

  /** Changes what happens to some students of a draft list; each change is checked against the classes and sections of the next year. */
  static async update(tenantId: string, id: string, input: UpdatePromotionInput): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { batch, running, to } = await PromotionService.load(school, id, ["draft"], "changed");
    PromotionService.stillWaiting(to);
    const targets = await PromotionService.targets(school, to._id);
    const entries = batch.entries.map((e) => ({ ...e }));

    input.entries.forEach((change, i) => {
      const at = (field: string) => `entries.${i}.${field}`;
      const entry = entries.find((e) => e.studentId.toString() === change.studentId);
      if (!entry) {
        throw ApiError.badRequest("That student is not on this list.", "STUDENT_NOT_IN_PROMOTION", [{ path: at("studentId"), message: "That student is not on this list" }]);
      }
      if (change.outcome === "leave") {
        Object.assign(entry, { outcome: "leave", toClassId: null, toClassName: null, toSectionId: null, toSectionName: null });
        return;
      }
      // Promote: the class asked for, else the one already chosen, else the next one in teaching order. Stay: the class they are in.
      const fromAt = targets.findIndex((t) => t.classId === entry.fromClassId.toString());
      const classId =
        change.outcome === "retain"
          ? entry.fromClassId.toString()
          : (change.classId ?? entry.toClassId?.toString() ?? classAfter(targets, fromAt)?.classId);
      if (!classId || !targets.some((t) => t.classId === classId)) {
        throw ApiError.badRequest("Choose a class of your school.", "CLASS_NOT_FOUND", [{ path: at("classId"), message: "Choose a class of your school" }]);
      }
      // Only a section the person named is kept as it is; otherwise it follows the section the student comes from.
      const sameClass = entry.toClassId?.toString() === classId;
      const place = PromotionService.place(targets, classId, entry.fromSectionName, change.sectionId ?? (sameClass ? entry.toSectionId?.toString() : undefined));
      if (!place) {
        const className = targets.find((t) => t.classId === classId)!.className;
        throw ApiError.badRequest(`Choose a section of ${className} for the next year.`, "SECTION_NOT_FOUND", [{ path: at("sectionId"), message: `Choose a section of ${className}` }]);
      }
      Object.assign(entry, { outcome: change.outcome, ...place });
    });

    const saved = await PromotionBatch.findOneAndUpdate({ _id: batch._id, tenantId: school, status: "draft" }, { $set: { entries } }, { new: true }).lean();
    if (!saved) throw WRONG_STATE("changed", "submitted");
    return PromotionService.dto(saved, running, to);
  }

  /** Sends the draft to the school admin. Every student who goes on must have a class (and a section, when the class has them). */
  static async submit(tenantId: string, actor: Actor, id: string): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { batch, running, to } = await PromotionService.load(school, id, ["draft"], "sent for approval");
    PromotionService.stillWaiting(to);
    const targets = await PromotionService.targets(school, to._id);
    const incomplete = batch.entries.filter((e) => e.outcome !== "leave" && !PromotionService.place(targets, e.toClassId?.toString() ?? "", e.fromSectionName, e.toSectionId?.toString() ?? null));
    if (incomplete.length > 0) {
      const names = incomplete.slice(0, 5).map((e) => e.name).join(", ");
      throw ApiError.badRequest(`${incomplete.length} students have no class or section in ${to.name} yet: ${names}.`, "PROMOTION_INCOMPLETE", [{ path: "entries", message: `Choose a class and section for ${names}` }]);
    }
    const saved = await PromotionBatch.findOneAndUpdate(
      { _id: batch._id, tenantId: school, status: "draft" },
      { $set: { status: "submitted", submitted: { by: await actorRecord(actor), at: new Date() }, decision: null } },
      { new: true }
    ).lean();
    if (!saved) throw WRONG_STATE("sent for approval", "submitted");
    return PromotionService.dto(saved, running, to);
  }

  /** The school admin sends the list back to the draft with a word for whoever made it. */
  static async reject(tenantId: string, actor: Actor, id: string, note: string | null): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { batch, running, to } = await PromotionService.load(school, id, ["submitted"], "sent back");
    const saved = await PromotionBatch.findOneAndUpdate(
      { _id: batch._id, tenantId: school, status: "submitted" },
      { $set: { status: "draft", submitted: null, decision: { outcome: "rejected", by: await actorRecord(actor), at: new Date(), note } } },
      { new: true }
    ).lean();
    if (!saved) throw WRONG_STATE("sent back", "approved");
    return PromotionService.dto(saved, running, to);
  }

  /**
   * The school admin approves: every student who goes on gets a place (an enrolment, no roll number yet) in the next year. A section that
   * would end up with more students than seats stops it unless `allowOverCapacity`; a student who already has a place in the next year
   * stops it too. The list is claimed first (the first of two requests wins); if making the places fails, the ones made are taken back
   * and the list goes back to "sent for approval".
   */
  static async approve(tenantId: string, actor: Actor, id: string, allowOverCapacity: boolean): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { batch, running, to } = await PromotionService.load(school, id, ["submitted"], "approved");
    PromotionService.stillWaiting(to);
    const going = batch.entries.filter((e) => e.outcome !== "leave" && e.toClassId);

    if (await Enrolment.exists({ tenantId: school, academicYearId: to._id, studentId: { $in: going.map((e) => e.studentId) } })) {
      throw ApiError.conflict(`Some of these students already have a place in ${to.name}.`, "ALREADY_ENROLLED");
    }
    const targets = await PromotionService.targets(school, to._id);
    const planned = new Map<string, number>();
    for (const e of going) if (e.toSectionId) planned.set(e.toSectionId.toString(), (planned.get(e.toSectionId.toString()) ?? 0) + 1);
    const over: { title: string; seats: number; students: number; sectionId: string }[] = [];
    for (const [sectionId, count] of planned) {
      const target = targets.find((t) => t.sections.some((s) => s.id === sectionId));
      const section = target?.sections.find((s) => s.id === sectionId);
      if (!target || !section || section.capacity === null) continue;
      const already = await Enrolment.countDocuments({ tenantId: school, academicYearId: to._id, sectionId: new Types.ObjectId(sectionId), status: "active" });
      if (already + count > section.capacity) over.push({ title: `${target.className} - ${section.name}`, seats: section.capacity, students: already + count, sectionId });
    }
    if (over.length > 0 && !allowOverCapacity) {
      const message = over.map((o) => `${o.title} would have ${o.students} students for ${o.seats} seats`).join("; ");
      throw ApiError.conflict(`${message}.`, "SECTION_FULL", over.map((o) => ({ path: "entries", message: `${o.title} would have ${o.students} students for ${o.seats} seats`, sectionId: o.sectionId, seats: o.seats, students: o.students })));
    }

    const claimed = await PromotionBatch.findOneAndUpdate(
      { _id: batch._id, tenantId: school, status: "submitted" },
      { $set: { status: "approved", decision: { outcome: "approved", by: await actorRecord(actor), at: new Date(), note: null } } },
      { new: true }
    ).lean();
    if (!claimed) throw WRONG_STATE("approved", "approved");
    try {
      if (going.length > 0) {
        await Enrolment.insertMany(
          going.map((e) => ({
            tenantId: school,
            studentId: e.studentId,
            academicYearId: to._id,
            classId: e.toClassId,
            sectionId: e.toSectionId ?? null,
            rollNumber: null,
            status: "active",
            promotionBatchId: batch._id,
            enrolledAt: to.startDate,
          }))
        );
      }
    } catch (err) {
      await Enrolment.deleteMany({ tenantId: school, promotionBatchId: batch._id });
      await PromotionBatch.updateOne({ _id: batch._id, tenantId: school }, { $set: { status: "submitted", decision: null } });
      throw err;
    }
    return PromotionService.dto(claimed, running, to);
  }

  /**
   * Drops the list. A list that is approved takes back the places it made, as long as the next year is not on yet; after that it is part
   * of the history of the school and stays.
   */
  static async cancel(tenantId: string, id: string): Promise<PromotionDto> {
    const school = new Types.ObjectId(tenantId);
    const { batch, running, to } = await PromotionService.load(school, id, ["draft", "submitted", "approved"], "cancelled");
    PromotionService.stillWaiting(to);
    const saved = await PromotionBatch.findOneAndUpdate(
      { _id: batch._id, tenantId: school, status: { $in: ["draft", "submitted", "approved"] } },
      { $set: { status: "cancelled" }, $unset: { openKey: "" } },
      { new: true }
    ).lean();
    if (!saved) throw WRONG_STATE("cancelled", "applied");
    if (batch.status === "approved") await Enrolment.deleteMany({ tenantId: school, promotionBatchId: batch._id });
    return PromotionService.dto(saved, running, to);
  }
}

const EXISTS = () => ApiError.conflict("There is already a promotion list for this year. Open it, or cancel it to start again.", "PROMOTION_EXISTS");
