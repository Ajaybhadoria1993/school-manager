"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { IdCard } from "@/components/certificates/IdCard";
import type { ApiResponse, Branch, Staff } from "@/types";

export default function StaffIdCardPage() {
  const params = useParams<{ staffId: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ staff: Staff; branch: Branch } | null>(null);

  useEffect(() => {
    api.get<ApiResponse<{ staff: Staff; branch: Branch }>>(`/certificates/id-card/staff/${params.staffId}`).then((res) => setData(res.data));
  }, [params.staffId]);

  if (!data) return <p className="text-sm text-foreground-muted">Loading…</p>;
  const { staff, branch } = data;

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" />
        Back
      </button>
      <IdCard
        kind="staff"
        name={staff.name}
        subtitle={staff.designation}
        referenceId={staff.employeeId}
        branchName={branch.name}
        qrValue={`STAFF:${staff._id}:${staff.employeeId}`}
      />
    </div>
  );
}
