import { Types } from "mongoose";
import { AcademicYear } from "../../academics/models/AcademicYear";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { FeeAccountService } from "../../fees/services/feeAccount.service";
import { FeeStructureService } from "../../fees/services/feeStructure.service";
import { FeeRulesService } from "../../fees/services/feeRules.service";
import { Enrolment } from "../../students/models/Enrolment";
import { placesOf, placeTitle } from "../../students/services/shared";
import { RiderService } from "../../transport/services/rider.service";
import { ParentService } from "./parent.service";

/**
 * What a parent reads about their child's fees (2026-11-19): the child's fee ACCOUNT (what is owed instalment by instalment, what the
 * school's concessions took off, what has been paid and what is due now, and the receipts), the school's fee chart for the child's class (what it
 * charges a student like theirs, with the optional fees), the transport fee of the stop the child boards at, and the school's rules for due days
 * and late fines. A parent cannot pay here (there is no payment gateway): the money is taken at the school office, and the account and the receipts
 * follow from it. A concession still waiting for the principal's approval is not shown (it takes nothing off yet).
 */
export class ChildFeesService {
  static async get(tenantId: string, userId: string, studentId: string) {
    await ParentService.childOf(tenantId, userId, studentId);
    const school = new Types.ObjectId(tenantId);
    const [rules, yearId] = await Promise.all([FeeRulesService.getRules(tenantId), AcademicYearService.activeYearId(school)]);
    const year = yearId ? await AcademicYear.findOne({ _id: yearId, tenantId: school }).select("name startDate").lean() : null;
    const rulesDto = { dueDay: rules.dueDay, graceDays: rules.graceDays, lateFine: rules.lateFine, allowPartial: rules.allowPartial };
    const empty = { account: null, year: year ? { name: year.name, startMonth: year.startDate.getUTCMonth() + 1 } : null, rules: rulesDto, className: null as string | null, audience: null as "new" | "existing" | null, chart: null, transport: null };
    if (!year || !yearId) return empty;

    const place = (await placesOf(school, yearId, [new Types.ObjectId(studentId)])).get(studentId);
    if (!place) return empty;

    // A child who was enrolled in an earlier session is an existing student; one with no earlier enrolment is new (the chart has fees for each).
    const earlier = await AcademicYear.find({ tenantId: school, startDate: { $lt: year.startDate } }).select("_id").lean();
    const before = earlier.length > 0 ? await Enrolment.exists({ tenantId: school, studentId: new Types.ObjectId(studentId), academicYearId: { $in: earlier.map((y) => y._id) } }) : null;
    const audience = before ? ("existing" as const) : ("new" as const);

    const [chart, bus] = await Promise.all([FeeStructureService.chartFor(school, yearId, new Types.ObjectId(place.classId), audience), RiderService.forChild(tenantId, studentId)]);
    const transport = bus.assigned && bus.stop ? { route: bus.route!.name, stop: bus.stop.name, monthlyFee: bus.stop.fee } : null;
    // Opening the account makes (or brings up to date) the child's charges from the chart: safe to repeat, it never changes what has been paid.
    const full = await FeeAccountService.account(tenantId, studentId);
    const account = {
      charges: full.charges,
      totals: full.totals,
      lateFineToday: full.lateFineToday,
      concessions: full.concessions.filter((c) => c.status === "approved").map((c) => ({ id: c.id, name: c.name, mode: c.mode, value: c.value })),
      receipts: full.receipts.filter((r) => r.status === "valid"),
    };
    return {
      account,
      year: { name: year.name, startMonth: year.startDate.getUTCMonth() + 1 },
      rules: rulesDto,
      className: placeTitle(place.className, place.sectionName),
      audience,
      chart: {
        lines: chart.lines.map((l) => ({
          id: l.id,
          headName: l.headName,
          kind: l.kind,
          amount: l.amount,
          frequency: l.frequency,
          dueMonths: l.dueMonths,
          appliesTo: l.appliesTo,
          optional: l.optional,
          refundable: l.refundable,
          notes: l.notes,
          yearly: l.yearly,
        })),
        compulsory: chart.compulsory,
        optional: chart.optional,
        refundable: chart.refundable,
      },
      transport,
    };
  }
}
