"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Wallet, GraduationCap, BookOpen, Award } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { formatDate, initials } from "@/lib/utils";
import type { ApiResponse, ClassMaster, Section, Student } from "@/types";

interface AttendanceSummary {
  percentage: number;
  present: number;
  absent: number;
  totalMarked: number;
}

function ChildCard({ child }: { child: Student }) {
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);

  useEffect(() => {
    api
      .get<ApiResponse<AttendanceSummary>>(`/attendance/student/${child._id}/summary`)
      .then((res) => setAttendance(res.data));
  }, [child._id]);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-sm font-semibold text-primary">
          {initials(`${child.firstName} ${child.lastName}`)}
        </div>
        <div>
          <p className="font-semibold text-foreground">
            {child.firstName} {child.lastName}
          </p>
          <p className="text-sm text-foreground-muted">
            {(child.classId as ClassMaster)?.name} - {(child.sectionId as Section)?.name} &middot; Roll #
            {child.rollNumber ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-surface-muted p-3">
          <p className="flex items-center gap-1.5 text-foreground-muted">
            <CalendarCheck className="size-3.5" /> This month
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {attendance ? `${attendance.percentage}%` : "—"}
          </p>
          <p className="text-xs text-foreground-muted">attendance</p>
        </div>
        <div className="rounded-lg bg-surface-muted p-3">
          <p className="flex items-center gap-1.5 text-foreground-muted">
            <GraduationCap className="size-3.5" /> Admission
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{child.admissionNumber}</p>
          <p className="text-xs text-foreground-muted">since {formatDate(child.createdAt)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Link
          href="/fees"
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Wallet className="size-4" />
          Fees
        </Link>
        <Link
          href={`/homework/${child._id}`}
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <BookOpen className="size-4" />
          Homework
        </Link>
        <Link
          href={`/report-cards/${child._id}`}
          className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Award className="size-4" />
          Report Card
        </Link>
      </div>
    </Card>
  );
}

export default function MyChildrenPage() {
  const [children, setChildren] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<Student[]>>("/students/my-children").then((res) => {
      setChildren(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">My Children</h2>
        <p className="text-sm text-foreground-muted">Attendance, fees and academic snapshot for each child.</p>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : children.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState title="No children linked" description="Contact the school office if this looks wrong." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <ChildCard key={child._id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
}
