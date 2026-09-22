import { nextSequence } from "../models/Counter";

function pad(num: number, width = 4): string {
  return String(num).padStart(width, "0");
}

/** e.g. ADM-2026-0001, gap-free and unique per branch per academic year */
export async function generateAdmissionNumber(branchId: string, academicYearLabel: string) {
  const seq = await nextSequence(`branch:${branchId}:admission:${academicYearLabel}`);
  return `ADM-${academicYearLabel}-${pad(seq)}`;
}

export async function generateEnrollmentNumber(branchId: string, academicYearLabel: string) {
  const seq = await nextSequence(`branch:${branchId}:enrollment:${academicYearLabel}`);
  return `ENR-${academicYearLabel}-${pad(seq)}`;
}

/** Sequential, non-reusable, per branch per financial year (FR-5.6). */
export async function generateReceiptNumber(branchId: string, financialYearLabel: string) {
  const seq = await nextSequence(`branch:${branchId}:receipt:${financialYearLabel}`);
  return `RCPT-${financialYearLabel}-${pad(seq, 5)}`;
}

/** Serial never repeats, even across academic years or re-issuance (FR-8.1, S-8.2). */
export async function generateCertificateSerial(
  branchId: string,
  type: "TC" | "BONAFIDE" | "FEEPAID"
) {
  const seq = await nextSequence(`branch:${branchId}:cert:${type}`);
  return `${type}-${pad(seq, 5)}`;
}
