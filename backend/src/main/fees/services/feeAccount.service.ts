import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Enrolment } from "../../students/models/Enrolment";
import { Student } from "../../students/models/Student";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { fullName, placeTitle, placesOf, type PlaceDto } from "../../students/services/shared";
import { RouteRider } from "../../transport/models/RouteRider";
import { TransportRoute } from "../../transport/models/TransportRoute";
import { findStudents } from "../../transport/services/rider.service";
import { yearlyCost, type LateFineMode } from "../constants";
import { FeeCharge, type IFeeCharge } from "../models/FeeCharge";
import { FeeHead } from "../models/FeeHead";
import { FeeLine } from "../models/FeeLine";
import { FeeReceipt } from "../models/FeeReceipt";
import { StudentConcession } from "../models/StudentConcession";
import { FeeRulesService } from "./feeRules.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
export const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const daysBetween = (later: Date, earlier: Date) => Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
const STUDENT_NOT_FOUND = () => ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");
const NO_YEAR = () => ApiError.conflict("Set up the school's academic year first", "NO_ACADEMIC_YEAR");

/** What is still owed on a charge, in rupees. */
export const outstandingOf = (c: Pick<IFeeCharge, "amount" | "concession" | "paid">) => Math.max(0, round2(c.amount - c.concession - c.paid));

export type ChargeStatus = "paid" | "upcoming" | "overdue" | "partial" | "due";
export interface FineRules {
  dueDay: number;
  graceDays: number;
  lateFine: { mode: LateFineMode; amount: number; maxAmount: number | null };
  allowPartial: boolean;
}

/** Where a charge stands on a day: settled, not due yet, late (past its due day and the days of grace), partly paid, or due. */
export function statusOf(c: Pick<IFeeCharge, "amount" | "concession" | "paid" | "dueDate">, today: Date, graceDays: number): ChargeStatus {
  if (outstandingOf(c) <= 0) return "paid";
  const late = daysBetween(today, c.dueDate);
  if (late < 0) return "upcoming";
  if (late > graceDays) return "overdue";
  return c.paid > 0 ? "partial" : "due";
}

/**
 * The late fine for these amounts on a day, by the school's rules: nothing, a flat amount for each late instalment, an amount for each day late,
 * or a percentage of what is owed for each month (30 days) late; no more than the most a family pays. An instalment is late once the days of
 * grace after its due day have passed.
 */
export function lateFineFor(rules: Pick<FineRules, "graceDays" | "lateFine">, rows: { base: number; dueDate: Date }[], on: Date): number {
  const { mode, amount, maxAmount } = rules.lateFine;
  if (mode === "none" || amount <= 0) return 0;
  let total = 0;
  for (const row of rows) {
    const late = daysBetween(on, row.dueDate);
    if (late <= rules.graceDays) continue;
    if (mode === "flat") total += amount;
    else if (mode === "per_day") total += amount * late;
    else total += (row.base * amount * Math.ceil(late / 30)) / 100;
  }
  if (maxAmount != null) total = Math.min(total, maxAmount);
  return round2(total);
}

export function chargeDto(c: IFeeCharge, today: Date, graceDays: number) {
  return {
    id: c._id.toString(),
    label: c.label,
    headName: c.headName,
    kind: c.kind,
    source: c.source,
    /** The chart line it came from (an optional fee is taken off by it); null for the bus. */
    lineId: c.lineId ? c.lineId.toString() : null,
    dueDate: dayOf(c.dueDate),
    amount: c.amount,
    concession: c.concession,
    net: round2(c.amount - c.concession),
    paid: c.paid,
    outstanding: outstandingOf(c),
    status: statusOf(c, today, graceDays),
  };
}

export function totalsOf(charges: IFeeCharge[], today: Date, graceDays: number) {
  let amount = 0;
  let concession = 0;
  let paid = 0;
  let dueNow = 0;
  let overdue = 0;
  for (const c of charges) {
    amount += c.amount;
    concession += c.concession;
    paid += c.paid;
    const owed = outstandingOf(c);
    const status = statusOf(c, today, graceDays);
    if (owed > 0 && status !== "upcoming") dueNow += owed;
    if (status === "overdue") overdue += owed;
  }
  const net = round2(amount - concession);
  return { amount: round2(amount), concession: round2(concession), net, paid: round2(paid), outstanding: round2(Math.max(0, net - paid)), dueNow: round2(dueNow), overdue: round2(overdue) };
}

/**
 * A student's fee account (2026-11-19): what the school's fee chart makes them owe this session, instalment by instalment (`FeeCharge`), the
 * concessions given to them, and what receipts have settled. The charges are made from the class's fee chart the first time the account is
 * opened and made again (safely: nothing is doubled, nothing paid is changed) whenever it is opened, so a chart that changed, a student who moved
 * class or a bus stop that was set reaches the account by itself.
 */
export class FeeAccountService {
  // ---- who, which class, new or existing ---------------------------------------------------------------------------------------------------
  private static async activeStudent(school: Types.ObjectId, studentId: string) {
    const student = Types.ObjectId.isValid(studentId) ? await Student.findOne({ _id: studentId, tenantId: school, status: "active" }).select("firstName lastName admissionNumber admissionDate").lean() : null;
    if (!student) throw STUDENT_NOT_FOUND();
    return student;
  }

  private static async yearOf(school: Types.ObjectId, yearId?: string) {
    const year = yearId
      ? await AcademicYear.findOne({ _id: yearId, tenantId: school }).select("name startDate status").lean()
      : await AcademicYear.findOne({ tenantId: school, status: "active" }).select("name startDate status").lean();
    if (!year) throw yearId ? ApiError.notFound("That academic year is not in your school.", "YEAR_NOT_FOUND") : NO_YEAR();
    return year;
  }

  /** A child with an enrolment in an earlier session is an existing student; one with none is new (the chart has fees for each). */
  static async audienceOf(school: Types.ObjectId, studentId: Types.ObjectId, startDate: Date): Promise<"new" | "existing"> {
    const earlier = await AcademicYear.find({ tenantId: school, startDate: { $lt: startDate } }).select("_id").lean();
    if (earlier.length === 0) return "new";
    const before = await Enrolment.exists({ tenantId: school, studentId, academicYearId: { $in: earlier.map((y) => y._id) } });
    return before ? "existing" : "new";
  }

  // ---- making the charges ------------------------------------------------------------------------------------------------------------------
  /** The instalments a chart line makes in a session: a one-time fee once (due in the session's first month), a repeating one for each month it falls due. */
  private static periodsOf(line: { frequency: string; dueMonths: number[] }, year: { startDate: Date }, dueDay: number): { key: string; due: Date; month: number | null }[] {
    const startMonth = year.startDate.getUTCMonth() + 1;
    const startYear = year.startDate.getUTCFullYear();
    if (line.frequency === "one_time") return [{ key: "once", due: utcDay(startYear, startMonth, dueDay), month: null }];
    return line.dueMonths.map((m) => {
      const y = m >= startMonth ? startYear : startYear + 1;
      return { key: `${y}-${String(m).padStart(2, "0")}`, due: utcDay(y, m, dueDay), month: m };
    });
  }

  /** Makes the account's charges from the class's fee chart and the bus stop; changes only what nothing has been paid on. Returns how many it made. */
  static async generate(tenantId: string, studentId: string, yearId?: string): Promise<{ made: number; removed: number }> {
    const school = asId(tenantId);
    const student = await FeeAccountService.activeStudent(school, studentId);
    const year = await FeeAccountService.yearOf(school, yearId);
    const sid = student._id;
    const place = (await placesOf(school, year._id, [sid])).get(sid.toString());
    if (!place) return { made: 0, removed: 0 };

    const [audience, rules, heads, rider] = await Promise.all([
      FeeAccountService.audienceOf(school, sid, year.startDate),
      FeeRulesService.getRules(tenantId),
      FeeHead.find({ tenantId: school }).select("name kind").lean(),
      RouteRider.findOne({ tenantId: school, studentId: sid }).lean(),
    ]);
    const lines = await FeeLine.find({ tenantId: school, academicYearId: year._id, classId: asId(place.classId), appliesTo: { $in: ["all", audience] }, optional: false }).lean();
    const headById = new Map(heads.map((h) => [h._id.toString(), h]));

    type Want = Pick<IFeeCharge, "key" | "source" | "lineId" | "headId" | "headName" | "kind" | "label" | "dueDate" | "amount">;
    const wanted = new Map<string, Want>();
    for (const line of lines) {
      const head = headById.get(line.headId.toString());
      for (const p of FeeAccountService.periodsOf(line, year, rules.dueDay)) {
        const key = `${line._id}|${p.key}`;
        wanted.set(key, { key, source: "chart", lineId: line._id, headId: line.headId, headName: head?.name ?? "Fee", kind: head?.kind ?? "other", label: p.month ? `${head?.name ?? "Fee"} · ${MONTHS[p.month - 1]}` : (head?.name ?? "Fee"), dueDate: p.due, amount: line.amount });
      }
    }
    // The bus: the stop's monthly fee, every month of the session (the family chose the bus by being put on a route).
    const route = rider ? await TransportRoute.findOne({ _id: rider.routeId, tenantId: school, isActive: true }).select("stops").lean() : null;
    const stop = route?.stops.find((s) => s.name.toLowerCase().replace(/\s+/g, " ").trim() === rider!.stopName.toLowerCase().replace(/\s+/g, " ").trim());
    if (stop?.fee && stop.fee > 0) {
      for (const p of FeeAccountService.periodsOf({ frequency: "monthly", dueMonths: Array.from({ length: 12 }, (_, i) => ((year.startDate.getUTCMonth() + i) % 12) + 1) }, year, rules.dueDay)) {
        const key = `bus|${p.key}`;
        wanted.set(key, { key, source: "transport", lineId: null, headId: null, headName: "School bus", kind: "transport", label: `School bus · ${MONTHS[p.month! - 1]}`, dueDate: p.due, amount: stop.fee });
      }
    }

    const existing = await FeeCharge.find({ tenantId: school, studentId: sid, academicYearId: year._id }).lean();
    const have = new Map(existing.map((c) => [c.key, c]));
    const add: Record<string, unknown>[] = [];
    for (const w of wanted.values()) {
      const old = have.get(w.key);
      if (!old) add.push({ ...w, tenantId: school, academicYearId: year._id, studentId: sid });
      else if (old.paid === 0 && (old.amount !== w.amount || old.dueDate.getTime() !== w.dueDate.getTime() || old.label !== w.label)) {
        await FeeCharge.updateOne({ _id: old._id, tenantId: school, paid: 0 }, { $set: { amount: w.amount, dueDate: w.dueDate, label: w.label, headName: w.headName } });
      }
    }
    // A fee that is no longer on the chart (the class changed, the stop was taken off) goes, unless money was paid on it.
    const gone = existing.filter((c) => (c.source === "chart" || c.source === "transport") && !wanted.has(c.key) && c.paid === 0);
    if (gone.length > 0) await FeeCharge.deleteMany({ tenantId: school, _id: { $in: gone.map((c) => c._id) } });
    if (add.length > 0) {
      // Two openings of the same account at once can both try to add a charge: the unique index lets one win, the other's duplicates are skipped.
      await FeeCharge.insertMany(add, { ordered: false }).catch((err) => {
        if ((err as { code?: number }).code !== 11000 && !(err as { writeErrors?: { code?: number }[] }).writeErrors?.every((e) => e.code === 11000)) throw err;
      });
    }
    await FeeAccountService.reprice(school, sid, year._id);
    return { made: add.length, removed: gone.length };
  }

  /** Works out what the student's approved concessions take off each charge (never more than what is unpaid of it) and keeps it on the charge. */
  static async reprice(school: Types.ObjectId, studentId: Types.ObjectId, yearId: Types.ObjectId): Promise<void> {
    const [grants, charges] = await Promise.all([
      StudentConcession.find({ tenantId: school, studentId, academicYearId: yearId, status: "approved" }).lean(),
      FeeCharge.find({ tenantId: school, studentId, academicYearId: yearId }).lean(),
    ]);
    for (const c of charges) {
      let off = 0;
      for (const g of grants) {
        // A concession for "every fee" is for the class's fees; the bus and the optional fees are only taken off when the concession names them.
        const applies = g.headIds.length === 0 ? c.source === "chart" : !!c.headId && g.headIds.some((h) => h.equals(c.headId!));
        if (applies) off += g.mode === "percent" ? (c.amount * g.value) / 100 : g.value;
      }
      const concession = round2(Math.max(0, Math.min(off, c.amount - c.paid)));
      if (concession !== c.concession) await FeeCharge.updateOne({ _id: c._id, tenantId: school }, { $set: { concession } });
    }
  }

  /** Makes the accounts of every student of the running session (or one class's). Returns how many students and charges. */
  static async generateAll(tenantId: string, classId?: string) {
    const school = asId(tenantId);
    const year = await FeeAccountService.yearOf(school);
    const enrolments = await Enrolment.find({ tenantId: school, academicYearId: year._id, status: "active", ...(classId ? { classId: asId(classId) } : {}) }).select("studentId").lean();
    const active = await Student.find({ tenantId: school, status: "active", _id: { $in: enrolments.map((e) => e.studentId) } }).select("_id").lean();
    let made = 0;
    for (const s of active) made += (await FeeAccountService.generate(tenantId, s._id.toString())).made;
    return { students: active.length, charges: made };
  }

  // ---- optional fees (a uniform, a hostel bed): the family chooses --------------------------------------------------------------------------
  static async addOptional(tenantId: string, studentId: string, lineId: string) {
    const school = asId(tenantId);
    const student = await FeeAccountService.activeStudent(school, studentId);
    const year = await FeeAccountService.yearOf(school);
    const place = (await placesOf(school, year._id, [student._id])).get(student._id.toString());
    const line = place && Types.ObjectId.isValid(lineId) ? await FeeLine.findOne({ _id: lineId, tenantId: school, academicYearId: year._id, classId: asId(place.classId), optional: true }).lean() : null;
    if (!line) throw ApiError.badRequest("That fee is not an optional fee of this student's class", "FEE_LINE_NOT_FOUND", [{ path: "lineId", message: "Choose one of the optional fees of the class" }]);
    const [head, rules] = await Promise.all([FeeHead.findOne({ _id: line.headId, tenantId: school }).select("name kind").lean(), FeeRulesService.getRules(tenantId)]);
    const rows = FeeAccountService.periodsOf(line, year, rules.dueDay).map((p) => ({
      tenantId: school,
      academicYearId: year._id,
      studentId: student._id,
      key: `${line._id}|${p.key}`,
      source: "optional",
      lineId: line._id,
      headId: line.headId,
      headName: head?.name ?? "Fee",
      kind: head?.kind ?? "other",
      label: p.month ? `${head?.name ?? "Fee"} · ${MONTHS[p.month - 1]}` : (head?.name ?? "Fee"),
      dueDate: p.due,
      amount: line.amount,
    }));
    if (await FeeCharge.exists({ tenantId: school, studentId: student._id, academicYearId: year._id, lineId: line._id })) {
      throw ApiError.conflict("This fee is already on the account.", "OPTIONAL_ALREADY_ADDED");
    }
    await FeeCharge.insertMany(rows);
    await FeeAccountService.reprice(school, student._id, year._id);
    return FeeAccountService.account(tenantId, studentId);
  }

  static async removeOptional(tenantId: string, studentId: string, lineId: string) {
    const school = asId(tenantId);
    const student = await FeeAccountService.activeStudent(school, studentId);
    const year = await FeeAccountService.yearOf(school);
    const filter = { tenantId: school, studentId: student._id, academicYearId: year._id, lineId: asId(lineId), source: "optional" };
    const mine = await FeeCharge.find(filter).lean();
    if (mine.length === 0) throw ApiError.notFound("That fee is not on this account", "CHARGE_NOT_FOUND");
    if (mine.some((c) => c.paid > 0)) throw ApiError.conflict("Money has been paid on this fee. Cancel that receipt first.", "CHARGE_HAS_PAYMENTS");
    await FeeCharge.deleteMany(filter);
    return FeeAccountService.account(tenantId, studentId);
  }

  // ---- reading the account -----------------------------------------------------------------------------------------------------------------
  /** Students to find a fee account by (the cashier types a name or an admission number). */
  static async search(tenantId: string, q: string) {
    return { items: await findStudents(asId(tenantId), q) };
  }

  /** The student's account for a session (the running one unless a past one is asked for: a past one is only read, never made). */
  static async account(tenantId: string, studentId: string, yearId?: string) {
    const school = asId(tenantId);
    const student = await FeeAccountService.activeStudent(school, studentId);
    const year = await FeeAccountService.yearOf(school, yearId);
    if (year.status === "active") await FeeAccountService.generate(tenantId, studentId, year._id.toString());
    const [rules, charges, grants, receipts, placeMap] = await Promise.all([
      FeeRulesService.getRules(tenantId),
      FeeCharge.find({ tenantId: school, studentId: student._id, academicYearId: year._id }).sort({ dueDate: 1, label: 1 }).lean(),
      StudentConcession.find({ tenantId: school, studentId: student._id, academicYearId: year._id }).sort({ createdAt: 1 }).lean(),
      FeeReceipt.find({ tenantId: school, studentId: student._id, academicYearId: year._id }).sort({ seq: -1 }).limit(50).lean(),
      placesOf(school, year._id, [student._id]),
    ]);
    const place = placeMap.get(student._id.toString()) ?? null;
    const today = utcDay(...(todayInIndia().split("-").map(Number) as [number, number, number]));
    const dues = charges.filter((c) => outstandingOf(c) > 0 && statusOf(c, today, rules.graceDays) === "overdue");
    return {
      student: { id: student._id.toString(), name: fullName(student), admissionNumber: student.admissionNumber, classLabel: place ? placeTitle(place.className, place.sectionName) : null },
      year: { id: year._id.toString(), name: year.name, status: year.status },
      rules: { dueDay: rules.dueDay, graceDays: rules.graceDays, lateFine: rules.lateFine, allowPartial: rules.allowPartial },
      charges: charges.map((c) => chargeDto(c, today, rules.graceDays)),
      totals: totalsOf(charges, today, rules.graceDays),
      /** What the late fine would be if every late instalment were paid today. */
      lateFineToday: lateFineFor(rules, dues.map((c) => ({ base: outstandingOf(c), dueDate: c.dueDate })), today),
      concessions: grants.map((g) => ({ id: g._id.toString(), name: g.name, mode: g.mode, value: g.value, status: g.status, note: g.note, headIds: g.headIds.map(String), givenBy: g.givenBy.name })),
      receipts: receipts.map((r) => ({ id: r._id.toString(), number: r.number, paidOn: dayOf(r.paidOn), total: r.total, mode: r.mode, status: r.status })),
      optional: year.status === "active" ? await FeeAccountService.optionalOffer(school, year._id, place, charges) : [],
    };
  }

  /** The optional fees of the student's class they have not taken yet. */
  private static async optionalOffer(school: Types.ObjectId, yearId: Types.ObjectId, place: PlaceDto | null, taken: IFeeCharge[]) {
    if (!place) return [];
    const [lines, heads] = await Promise.all([FeeLine.find({ tenantId: school, academicYearId: yearId, classId: asId(place.classId), optional: true }).lean(), FeeHead.find({ tenantId: school }).select("name").lean()]);
    const name = new Map(heads.map((h) => [h._id.toString(), h.name]));
    const have = new Set(taken.filter((c) => c.lineId).map((c) => c.lineId!.toString()));
    return lines
      .filter((l) => !have.has(l._id.toString()))
      .map((l) => ({ lineId: l._id.toString(), headName: name.get(l.headId.toString()) ?? "Fee", amount: l.amount, frequency: l.frequency, yearly: yearlyCost(l.amount, l.frequency, l.dueMonths) }));
  }
}
