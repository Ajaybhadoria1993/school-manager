import { Types } from "mongoose";
import { FeeStructure, FeeConcession, FeeTransaction } from "../models/Fee";

export interface InstallmentBreakdown {
  name: string;
  dueDate: Date;
  grossAmount: number;
  concessionAmount: number;
  netAmount: number;
  paidAmount: number;
  outstanding: number;
  isOverdue: boolean;
  status: "paid" | "partial" | "unpaid";
}

export interface StudentFeeSummary {
  feeStructureId: Types.ObjectId | null;
  installments: InstallmentBreakdown[];
  totals: {
    gross: number;
    concession: number;
    net: number;
    paid: number;
    outstanding: number;
  };
}

/**
 * Computes a student's fee position on read (installments minus concessions
 * minus successful payments). Nothing is cached, so a cheque bounce or a
 * late-approved concession is reflected immediately without a reconciliation
 * job (S-5.3, S-5.4).
 */
export async function computeStudentFeeSummary(
  studentId: string,
  branchId: string,
  classId: string,
  academicYearId: string
): Promise<StudentFeeSummary> {
  const structure = await FeeStructure.findOne({ branchId, classId, academicYearId }).populate(
    "installments.items.feeHeadId",
    "name"
  );

  if (!structure) {
    return {
      feeStructureId: null,
      installments: [],
      totals: { gross: 0, concession: 0, net: 0, paid: 0, outstanding: 0 },
    };
  }

  const concessions = await FeeConcession.find({ studentId, academicYearId });
  const transactions = await FeeTransaction.find({
    studentId,
    feeStructureId: structure._id,
    status: { $in: ["success"] },
  });

  const now = new Date();

  const installments: InstallmentBreakdown[] = structure.installments.map((inst) => {
    const grossAmount = inst.items.reduce((sum, item) => sum + item.amount, 0);

    let concessionAmount = 0;
    for (const c of concessions) {
      const appliesToHead =
        !c.feeHeadId || inst.items.some((i) => String(i.feeHeadId) === String(c.feeHeadId));
      if (!appliesToHead) continue;
      concessionAmount += c.type === "percentage" ? (grossAmount * c.value) / 100 : c.value;
    }
    concessionAmount = Math.min(concessionAmount, grossAmount);

    const netAmount = grossAmount - concessionAmount;
    const paidAmount = transactions
      .filter((t) => t.installmentName === inst.name)
      .reduce((sum, t) => sum + t.amount, 0);
    const outstanding = Math.max(netAmount - paidAmount, 0);

    return {
      name: inst.name,
      dueDate: inst.dueDate,
      grossAmount,
      concessionAmount,
      netAmount,
      paidAmount,
      outstanding,
      isOverdue: outstanding > 0 && inst.dueDate < now,
      status: outstanding <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid",
    };
  });

  const totals = installments.reduce(
    (acc, i) => {
      acc.gross += i.grossAmount;
      acc.concession += i.concessionAmount;
      acc.net += i.netAmount;
      acc.paid += i.paidAmount;
      acc.outstanding += i.outstanding;
      return acc;
    },
    { gross: 0, concession: 0, net: 0, paid: 0, outstanding: 0 }
  );

  return { feeStructureId: structure._id, installments, totals };
}

export interface YearFeeSummary extends StudentFeeSummary {
  academicYearId: string;
}

/**
 * Sums a student's fee position across every academic year they've ever
 * been enrolled in for this branch (current + promotionHistory), so dues
 * left over from a year they've since been promoted out of are never
 * silently dropped from the outstanding-dues report (S-1.4).
 */
export async function computeStudentFeeSummaryAllYears(
  studentId: string,
  branchId: string,
  yearEntries: { academicYearId: string; classId: string }[]
): Promise<{ byYear: YearFeeSummary[]; totals: StudentFeeSummary["totals"] }> {
  const seen = new Set<string>();
  const uniqueEntries = yearEntries.filter((e) => {
    if (seen.has(e.academicYearId)) return false;
    seen.add(e.academicYearId);
    return true;
  });

  const byYear = await Promise.all(
    uniqueEntries.map(async (e) => ({
      academicYearId: e.academicYearId,
      ...(await computeStudentFeeSummary(studentId, branchId, e.classId, e.academicYearId)),
    }))
  );

  const totals = byYear.reduce(
    (acc, y) => {
      acc.gross += y.totals.gross;
      acc.concession += y.totals.concession;
      acc.net += y.totals.net;
      acc.paid += y.totals.paid;
      acc.outstanding += y.totals.outstanding;
      return acc;
    },
    { gross: 0, concession: 0, net: 0, paid: 0, outstanding: 0 }
  );

  return { byYear, totals };
}
