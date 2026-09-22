"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { IdCard } from "@/components/certificates/IdCard";
import type { ApiResponse, Branch, ClassMaster, Section, Student } from "@/types";

export default function StudentIdCardPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ student: Student; branch: Branch } | null>(null);

  useEffect(() => {
    api
      .get<ApiResponse<{ student: Student; branch: Branch }>>(`/certificates/id-card/student/${params.studentId}`)
      .then((res) => setData(res.data));
  }, [params.studentId]);

  if (!data) return <p className="text-sm text-foreground-muted">Loading…</p>;
  const { student, branch } = data;

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" />
        Back
      </button>
      <IdCard
        kind="student"
        name={`${student.firstName} ${student.lastName}`}
        subtitle={`${(student.classId as ClassMaster)?.name} - ${(student.sectionId as Section)?.name}`}
        referenceId={student.admissionNumber}
        branchName={branch.name}
        qrValue={`STUDENT:${student._id}:${student.admissionNumber}`}
      />
    </div>
  );
}
