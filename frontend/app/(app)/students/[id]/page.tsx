"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Phone, Mail, CalendarCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FeeSummaryCard } from "@/components/fees/FeeSummaryCard";
import { formatDate, initials } from "@/lib/utils";
import type { ApiResponse, ClassMaster, Guardian, Section, Student } from "@/types";

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResponse<Student>>(`/students/${params.id}`)
      .then((res) => setStudent(res.data))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <p className="text-sm text-foreground-muted">Loading student…</p>;
  if (!student) return <p className="text-sm text-foreground-muted">Student not found.</p>;

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.push("/students")}
        className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Students
      </button>

      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-lg font-semibold text-primary">
              {initials(`${student.firstName} ${student.lastName}`)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {student.firstName} {student.lastName}
              </h2>
              <p className="text-sm text-foreground-muted">
                {(student.classId as ClassMaster)?.name} - {(student.sectionId as Section)?.name} &middot; Roll #
                {student.rollNumber ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={student.status === "active" ? "success" : "neutral"} className="capitalize">
              {student.status}
            </Badge>
            <Badge tone="neutral" className="font-mono">
              {student.admissionNumber}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-foreground-muted">Date of Birth</p>
            <p className="font-medium text-foreground">{formatDate(student.dob)}</p>
          </div>
          <div>
            <p className="text-foreground-muted">Gender</p>
            <p className="font-medium capitalize text-foreground">{student.gender}</p>
          </div>
          <div>
            <p className="text-foreground-muted">House</p>
            <p className="font-medium text-foreground">{student.house ?? "—"}</p>
          </div>
          <div>
            <p className="text-foreground-muted">Category</p>
            <p className="font-medium text-foreground">{student.category ?? "—"}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <FeeSummaryCard studentId={student._id} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Guardians</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {student.guardians?.length ? (
                student.guardians.map((g, idx) => {
                  const guardian = g.guardianId as Guardian;
                  return (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium text-foreground">{guardian?.name}</p>
                      <p className="text-xs text-foreground-muted">{g.relation}</p>
                      <div className="mt-2 space-y-1 text-xs text-foreground-muted">
                        <p className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {guardian?.phone}
                        </p>
                        {guardian?.email && (
                          <p className="flex items-center gap-1.5">
                            <Mail className="size-3.5" /> {guardian.email}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-foreground-muted">No guardians linked.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push(`/attendance?sectionId=${(student.sectionId as Section)?._id ?? student.sectionId}`)}
              >
                <CalendarCheck className="size-4" />
                View class attendance
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
