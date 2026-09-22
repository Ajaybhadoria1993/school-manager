"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Certificate, ClassMaster, Section, Student } from "@/types";

export function CertificatePrintView({ certificate, branchName }: { certificate: Certificate; branchName: string }) {
  const student = certificate.studentId as Student;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-10 text-black shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="border-b-2 border-black pb-4 text-center">
          <h1 className="text-xl font-bold">{branchName}</h1>
          <p className="mt-1 text-sm uppercase tracking-wide text-gray-600">
            {certificate.type === "transfer"
              ? "Transfer Certificate"
              : certificate.type === "bonafide"
              ? "Bonafide Certificate"
              : "Fee Paid Certificate"}
          </p>
        </div>

        <div className="mt-4 flex justify-between text-sm">
          <span>
            Serial No: <strong>{certificate.serialNumber}</strong>
          </span>
          <span>Date: {formatDate(certificate.issuedAt)}</span>
        </div>

        <div className="mt-6 space-y-3 text-sm leading-relaxed">
          {certificate.type === "transfer" && (
            <p>
              This is to certify that <strong>{student.firstName} {student.lastName}</strong> (Admission No.{" "}
              {student.admissionNumber}), {(student.classId as unknown as ClassMaster)?.name} - {(student.sectionId as unknown as Section)?.name},
              was a bonafide student of this institution. The student&apos;s conduct during their time here was{" "}
              <strong>{String(certificate.data.conduct)}</strong>. Last date of attendance:{" "}
              <strong>{formatDate(String(certificate.data.lastAttendanceDate))}</strong>. Reason for leaving:{" "}
              <strong>{String(certificate.data.reasonForLeaving)}</strong>.
            </p>
          )}
          {certificate.type === "bonafide" && (
            <p>
              This is to certify that <strong>{student.firstName} {student.lastName}</strong> (Admission No.{" "}
              {student.admissionNumber}), {(student.classId as unknown as ClassMaster)?.name} - {(student.sectionId as unknown as Section)?.name}, is a
              bonafide student of this institution. This certificate is issued for the purpose of{" "}
              <strong>{String(certificate.data.purpose)}</strong>.
            </p>
          )}
          {certificate.type === "fee_paid" && (
            <p>
              This is to certify that a total of <strong>{formatCurrency(Number(certificate.data.totalPaid))}</strong> was
              received from <strong>{student.firstName} {student.lastName}</strong> (Admission No. {student.admissionNumber})
              towards school fees for the financial year <strong>{String(certificate.data.financialYear)}</strong>, as per
              the school&apos;s fee ledger.
            </p>
          )}
        </div>

        <div className="mt-16 flex justify-between text-sm">
          <div>
            <div className="h-12" />
            <p className="border-t border-black pt-1">School Seal</p>
          </div>
          <div className="text-right">
            <div className="h-12" />
            <p className="border-t border-black pt-1">Authorized Signatory</p>
          </div>
        </div>

        {certificate.status === "superseded" && (
          <p className="mt-6 text-center text-xs font-semibold uppercase tracking-wide text-red-600 print:hidden">
            Superseded — a re-issued certificate exists
          </p>
        )}
      </div>
    </div>
  );
}
