import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { logger } from "../../../utils/logger";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { Student } from "../../students/models/Student";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { fullName, placeTitle, placesOf } from "../../students/services/shared";
import { Tenant } from "../../tenants/models/Tenant";
import { MODES_WITH_REFERENCE, PAYMENT_MODE_LABELS, RECEIPT_PAGE, type PaymentMode } from "../constants";
import { FeeCharge } from "../models/FeeCharge";
import { FeeReceipt, type IFeeReceipt } from "../models/FeeReceipt";
import type { CollectInput } from "../schemas/fees.schemas";
import { FeeAccountService, lateFineFor, outstandingOf, round2, statusOf } from "./feeAccount.service";
import { FeeRulesService } from "./feeRules.service";
import { personOf } from "./studentConcession.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const validation = (details: { path: string; message: string }[]) => ApiError.badRequest("Validation failed", "VALIDATION_ERROR", details);
const RECEIPT_NOT_FOUND = () => ApiError.notFound("Receipt not found", "RECEIPT_NOT_FOUND");

export function receiptDto(r: IFeeReceipt) {
  return {
    id: r._id.toString(),
    number: r.number,
    seq: r.seq,
    studentId: r.studentId.toString(),
    studentName: r.studentName,
    admissionNumber: r.admissionNumber,
    classLabel: r.classLabel,
    mode: r.mode,
    modeLabel: PAYMENT_MODE_LABELS[r.mode],
    reference: r.reference,
    paidOn: dayOf(r.paidOn),
    items: r.items.map((i) => ({ chargeId: i.chargeId.toString(), label: i.label, amount: i.amount })),
    lateFine: r.lateFine,
    total: r.total,
    note: r.note,
    status: r.status,
    receivedBy: r.receivedBy.name,
    cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    cancelReason: r.cancelReason,
    cancelledBy: r.cancelledBy?.name ?? null,
  };
}

/**
 * Taking fees (2026-11-19): a receipt settles chosen charges of ONE student, fully or in part (when the school's rules allow part payment), with the
 * late fine the rules ask for (the cashier may take less, never more). There are no transactions here, so a payment first checks everything, then
 * adds to each charge with a guard that refuses an amount that would pay more than is owed (two cashiers on one account cannot both take the
 * same instalment), and undoes what it did if a later step fails. A receipt is never edited or deleted: a mistake is cancelled, with a reason.
 */
export class FeeCollectionService {
  /** Gives back to each charge what a payment took (a failed payment, a cancelled receipt). Never goes below 0. */
  private static async giveBack(school: Types.ObjectId, items: { chargeId: Types.ObjectId; amount: number }[]) {
    for (const i of items) {
      await FeeCharge.updateOne({ _id: i.chargeId, tenantId: school }, [{ $set: { paid: { $max: [0, { $round: [{ $subtract: ["$paid", i.amount] }, 2] }] } } }]);
    }
  }

  static async collect(tenantId: string, userId: string, input: CollectInput) {
    const school = asId(tenantId);
    const student = Types.ObjectId.isValid(input.studentId) ? await Student.findOne({ _id: input.studentId, tenantId: school, status: "active" }).select("firstName lastName admissionNumber").lean() : null;
    if (!student) throw ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name startDate").lean();
    if (!year) throw ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
    // The account is made (or brought up to date) before anything is taken, so a payment is never against a chart that moved.
    await FeeAccountService.generate(tenantId, input.studentId);

    const rules = await FeeRulesService.getRules(tenantId);
    const problems: { path: string; message: string }[] = [];
    const ids = input.items.map((i) => i.chargeId);
    if (new Set(ids).size !== ids.length) problems.push({ path: "items", message: "A fee is chosen once" });
    if (MODES_WITH_REFERENCE.includes(input.mode) && !input.reference) problems.push({ path: "reference", message: input.mode === "cheque" ? "Enter the cheque number" : "Enter the draft number" });
    const today = todayInIndia();
    const paidOn = input.paidOn ?? today;
    if (paidOn > today) problems.push({ path: "paidOn", message: "The day paid cannot be in the future" });
    if (paidOn < dayOf(year.startDate)) problems.push({ path: "paidOn", message: "The day paid cannot be before this session started" });

    const charges = await FeeCharge.find({ tenantId: school, studentId: student._id, academicYearId: year._id, _id: { $in: ids.map(asId) } }).lean();
    const byId = new Map(charges.map((c) => [c._id.toString(), c]));
    input.items.forEach((item, i) => {
      const c = byId.get(item.chargeId);
      if (!c) return problems.push({ path: `items.${i}.chargeId`, message: "That fee is not on this student's account" });
      const owed = outstandingOf(c);
      if (item.amount > owed + 0.005) problems.push({ path: `items.${i}.amount`, message: owed <= 0 ? `${c.label} is already paid` : `${c.label}: only ₹${owed} is owed` });
      else if (!rules.allowPartial && item.amount < owed - 0.005) problems.push({ path: `items.${i}.amount`, message: `${c.label}: the school takes the whole instalment (₹${owed}), not part of it` });
    });
    if (problems.length > 0) throw validation(problems);

    const on = toDate(paidOn);
    const items = input.items.map((i) => ({ chargeId: asId(i.chargeId), label: byId.get(i.chargeId)!.label, amount: round2(i.amount) }));
    const fineByRules = lateFineFor(rules, input.items.map((i) => ({ base: i.amount, dueDate: byId.get(i.chargeId)!.dueDate })), on);
    const lateFine = input.lateFine === undefined ? fineByRules : round2(input.lateFine);
    if (lateFine > fineByRules + 0.005) throw validation([{ path: "lateFine", message: fineByRules === 0 ? "There is no late fine to take for this payment" : `The late fine is at most ₹${fineByRules}` }]);
    const total = round2(items.reduce((sum, i) => sum + i.amount, 0) + lateFine);

    // Add to each charge (refused if it would pay more than is owed); undo them all if any is refused.
    const applied: { chargeId: Types.ObjectId; amount: number }[] = [];
    for (const item of items) {
      const done = await FeeCharge.updateOne(
        { _id: item.chargeId, tenantId: school, $expr: { $lte: [{ $add: ["$paid", item.amount] }, { $add: [{ $subtract: ["$amount", "$concession"] }, 0.005] }] } },
        { $inc: { paid: item.amount } }
      );
      if (done.matchedCount === 0) {
        await FeeCollectionService.giveBack(school, applied);
        throw ApiError.conflict("Someone else has just taken a payment on this account. Open it again to see what is owed.", "ACCOUNT_CHANGED");
      }
      applied.push(item);
    }

    try {
      const [place, by] = await Promise.all([placesOf(school, year._id, [student._id]).then((m) => m.get(student._id.toString())), personOf(userId)]);
      for (let attempt = 0; attempt < 6; attempt++) {
        const last = await FeeReceipt.findOne({ tenantId: school, academicYearId: year._id }).sort({ seq: -1 }).select("seq").lean();
        const seq = (last?.seq ?? 0) + 1;
        try {
          const made = await FeeReceipt.create({
            tenantId: school,
            academicYearId: year._id,
            seq,
            number: `${year.name}/${String(seq).padStart(4, "0")}`,
            studentId: student._id,
            studentName: fullName(student),
            admissionNumber: student.admissionNumber,
            classLabel: place ? placeTitle(place.className, place.sectionName) : null,
            mode: input.mode as PaymentMode,
            reference: input.reference,
            paidOn: on,
            items,
            lateFine,
            total,
            note: input.note,
            receivedBy: by,
          });
          return receiptDto(made.toObject());
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err;
        }
      }
      throw ApiError.conflict("Many receipts were made at once. Please try again.", "RECEIPT_BUSY");
    } catch (err) {
      await FeeCollectionService.giveBack(school, applied).catch((e) => logger.error("Fee payment could not be undone", { error: e instanceof Error ? e.message : String(e) }));
      throw err;
    }
  }

  /** Cancels a receipt (a wrong amount, a bounced cheque): the money goes back to the charges it settled and the number stays on record. */
  static async cancel(tenantId: string, userId: string, id: string, reason: string) {
    const school = asId(tenantId);
    // The receipt is claimed first, so two cancellations cannot both give the money back.
    const claimed = Types.ObjectId.isValid(id)
      ? await FeeReceipt.findOneAndUpdate({ _id: id, tenantId: school, status: "valid" }, { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason, cancelledBy: await personOf(userId) } }, { new: true }).lean()
      : null;
    if (!claimed) {
      if (Types.ObjectId.isValid(id) && (await FeeReceipt.exists({ _id: id, tenantId: school }))) throw ApiError.conflict("This receipt is already cancelled.", "RECEIPT_CANCELLED");
      throw RECEIPT_NOT_FOUND();
    }
    await FeeCollectionService.giveBack(school, claimed.items);
    return receiptDto(claimed);
  }

  static async receipt(tenantId: string, id: string) {
    const school = asId(tenantId);
    const r = Types.ObjectId.isValid(id) ? await FeeReceipt.findOne({ _id: id, tenantId: school }).lean() : null;
    if (!r) throw RECEIPT_NOT_FOUND();
    const [tenant, year] = await Promise.all([Tenant.findById(school).select("name").lean(), AcademicYear.findOne({ _id: r.academicYearId, tenantId: school }).select("name").lean()]);
    return { ...receiptDto(r), school: tenant?.name ?? "", year: year?.name ?? "" };
  }

  static async receipts(tenantId: string, query: { from?: string; to?: string; studentId?: string; mode?: PaymentMode; status: "valid" | "cancelled" | "all" }) {
    const school = asId(tenantId);
    const today = todayInIndia();
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.studentId) filter.studentId = asId(query.studentId);
    if (query.mode) filter.mode = query.mode;
    if (query.status !== "all") filter.status = query.status;
    // With a student, all their receipts; otherwise a window of days (today when none is given).
    if (!query.studentId || query.from || query.to) filter.paidOn = { $gte: toDate(query.from ?? query.to ?? today), $lte: toDate(query.to ?? query.from ?? today) };
    const rows = await FeeReceipt.find(filter).sort({ paidOn: -1, seq: -1 }).limit(RECEIPT_PAGE).lean();
    return { items: rows.map(receiptDto), limit: RECEIPT_PAGE };
  }

  /** What was taken in a window of days (today when none is given): by how it was paid, by day, and what was cancelled. */
  static async summary(tenantId: string, query: { from?: string; to?: string }) {
    const school = asId(tenantId);
    const today = todayInIndia();
    const from = query.from ?? query.to ?? today;
    const to = query.to ?? query.from ?? today;
    const rows = await FeeReceipt.find({ tenantId: school, paidOn: { $gte: toDate(from), $lte: toDate(to) } }).lean();
    const valid = rows.filter((r) => r.status === "valid");
    const byMode = new Map<string, { count: number; total: number }>();
    const byDay = new Map<string, number>();
    for (const r of valid) {
      const m = byMode.get(r.mode) ?? { count: 0, total: 0 };
      byMode.set(r.mode, { count: m.count + 1, total: round2(m.total + r.total) });
      byDay.set(dayOf(r.paidOn), round2((byDay.get(dayOf(r.paidOn)) ?? 0) + r.total));
    }
    return {
      from,
      to,
      receipts: valid.length,
      total: round2(valid.reduce((s, r) => s + r.total, 0)),
      lateFine: round2(valid.reduce((s, r) => s + r.lateFine, 0)),
      cancelled: { count: rows.length - valid.length, total: round2(rows.filter((r) => r.status === "cancelled").reduce((s, r) => s + r.total, 0)) },
      byMode: [...byMode.entries()].map(([mode, v]) => ({ mode, modeLabel: PAYMENT_MODE_LABELS[mode as PaymentMode], ...v })).sort((a, b) => b.total - a.total),
      byDay: [...byDay.entries()].map(([day, total]) => ({ day, total })).sort((a, b) => a.day.localeCompare(b.day)),
    };
  }

  /** Who owes what now, for the running session: each student's instalments that have come due and are not paid, the late ones apart, worst first. */
  static async dues(tenantId: string, query: { classId?: string; search?: string }) {
    const school = asId(tenantId);
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name").lean();
    if (!year) throw ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");
    const rules = await FeeRulesService.getRules(tenantId);
    const todayText = todayInIndia();
    const today = toDate(todayText);
    const charges = await FeeCharge.find({
      tenantId: school,
      academicYearId: year._id,
      dueDate: { $lte: today },
      $expr: { $gt: [{ $subtract: [{ $subtract: ["$amount", "$concession"] }, "$paid"] }, 0.005] },
    }).lean();
    const byStudent = new Map<string, typeof charges>();
    for (const c of charges) byStudent.set(c.studentId.toString(), [...(byStudent.get(c.studentId.toString()) ?? []), c]);

    const studentIds = [...byStudent.keys()].map(asId);
    const [students, places] = await Promise.all([Student.find({ tenantId: school, status: "active", _id: { $in: studentIds } }).select("firstName lastName admissionNumber").lean(), placesOf(school, year._id, studentIds)]);
    const search = query.search?.toLowerCase();
    const items = students
      .map((s) => {
        const mine = byStudent.get(s._id.toString())!;
        const place = places.get(s._id.toString());
        const late = mine.filter((c) => statusOf(c, today, rules.graceDays) === "overdue");
        return {
          studentId: s._id.toString(),
          name: fullName(s),
          admissionNumber: s.admissionNumber,
          classId: place?.classId ?? null,
          classLabel: place ? placeTitle(place.className, place.sectionName) : null,
          dueNow: round2(mine.reduce((t, c) => t + outstandingOf(c), 0)),
          overdue: round2(late.reduce((t, c) => t + outstandingOf(c), 0)),
          instalments: mine.length,
          oldestDue: dayOf(mine.reduce((a, c) => (c.dueDate < a ? c.dueDate : a), mine[0].dueDate)),
          lateFine: lateFineFor(rules, late.map((c) => ({ base: outstandingOf(c), dueDate: c.dueDate })), today),
        };
      })
      .filter((i) => (!query.classId || i.classId === query.classId) && (!search || i.name.toLowerCase().includes(search) || i.admissionNumber.toLowerCase().includes(search)))
      .sort((a, b) => b.overdue - a.overdue || b.dueNow - a.dueNow || a.name.localeCompare(b.name));
    return {
      year: year.name,
      asOn: todayText,
      totals: { students: items.length, dueNow: round2(items.reduce((t, i) => t + i.dueNow, 0)), overdue: round2(items.reduce((t, i) => t + i.overdue, 0)) },
      items,
    };
  }
}
