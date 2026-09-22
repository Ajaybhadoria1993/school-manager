"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Printer, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initials } from "@/lib/utils";

interface IdCardProps {
  kind: "student" | "staff";
  name: string;
  subtitle: string; // class/section, or designation
  referenceId: string; // admission number, or employee id
  branchName: string;
  qrValue: string;
}

export function IdCard({ kind, name, subtitle, referenceId, branchName, qrValue }: IdCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrValue, { width: 96, margin: 1 }).catch(() => {});
    }
  }, [qrValue]);

  return (
    <div className="mx-auto max-w-xs">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white text-black shadow-sm print:rounded-none print:border print:shadow-none">
        <div className="flex items-center gap-2 bg-primary px-4 py-3 text-white">
          <GraduationCap className="size-5" />
          <span className="text-xs font-semibold leading-tight">{branchName}</span>
        </div>

        <div className="flex flex-col items-center px-4 py-5">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
            {initials(name)}
          </div>
          <p className="mt-3 text-center text-sm font-semibold">{name}</p>
          <p className="text-center text-xs text-gray-600">{subtitle}</p>

          <canvas ref={canvasRef} className="mt-4" />

          <p className="mt-2 text-[11px] tracking-wide text-gray-500">
            {kind === "student" ? "Admission No." : "Employee ID"}: {referenceId}
          </p>
        </div>
      </div>
    </div>
  );
}
