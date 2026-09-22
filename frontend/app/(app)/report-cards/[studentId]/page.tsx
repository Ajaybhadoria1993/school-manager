"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Award, Clock } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Exam, ReportCardData, Student } from "@/types";

export default function StudentReportCardsPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, ReportCardData | "not_published" | "error">>({});

  useEffect(() => {
    api.get<ApiResponse<Student>>(`/students/${params.studentId}`).then((studentRes) => {
      api
        .get<ApiResponse<Exam[]>>("/exams", { classId: typeof studentRes.data.classId === "string" ? studentRes.data.classId : studentRes.data.classId._id })
        .then((res) => setExams(res.data))
        .finally(() => setLoading(false));
    });
  }, [params.studentId]);

  async function toggle(examId: string) {
    if (openExamId === examId) {
      setOpenExamId(null);
      return;
    }
    setOpenExamId(examId);
    if (reports[examId]) return;
    try {
      const res = await api.get<ApiResponse<ReportCardData>>(`/exams/${examId}/report-cards/${params.studentId}`);
      setReports((prev) => ({ ...prev, [examId]: res.data }));
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "";
      setReports((prev) => ({ ...prev, [examId]: message.includes("not been published") ? "not_published" : "error" }));
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Report Cards</h2>
        <p className="text-sm text-foreground-muted">Tap an exam to view results once published by the school.</p>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState title="No exams yet" />
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const report = reports[exam._id];
            return (
              <Card key={exam._id} className="overflow-hidden">
                <button
                  onClick={() => toggle(exam._id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-muted"
                >
                  <div>
                    <p className="font-medium text-foreground">{exam.name}</p>
                    <p className="text-xs text-foreground-muted">
                      {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
                    </p>
                  </div>
                  {report && typeof report === "object" && (
                    <Badge tone="success">
                      <Award className="mr-1 size-3" />
                      {report.totals.percentage}%
                    </Badge>
                  )}
                </button>

                {openExamId === exam._id && (
                  <div className="border-t border-border p-4">
                    {!report ? (
                      <p className="text-sm text-foreground-muted">Loading…</p>
                    ) : report === "not_published" ? (
                      <div className="flex items-center gap-2 text-sm text-foreground-muted">
                        <Clock className="size-4" />
                        Not published yet — check back after the school releases results.
                      </div>
                    ) : report === "error" ? (
                      <p className="text-sm text-danger">Unable to load this report card.</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {report.subjects.map((s) => (
                            <div key={s.subjectName} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                              <span className="text-foreground-muted">{s.subjectName}: </span>
                              <span className="font-medium text-foreground">
                                {s.isAbsent ? "AB" : `${s.obtained}/${s.maxTotal}`}
                              </span>
                              <Badge tone="primary" className="ml-1.5">
                                {s.grade}
                              </Badge>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-6 text-sm text-foreground-muted">
                          <span>
                            Total: <span className="font-medium text-foreground">{report.totals.obtained}/{report.totals.max}</span>
                          </span>
                          <span>
                            Grade: <span className="font-medium text-foreground">{report.totals.grade}</span>
                          </span>
                          <span>
                            Attendance: <span className="font-medium text-foreground">{report.attendancePercentage ?? "—"}%</span>
                          </span>
                        </div>
                        {report.teacherRemarks && (
                          <p className="rounded-lg bg-surface-muted p-3 text-sm text-foreground">
                            <span className="font-medium">Teacher&apos;s remarks: </span>
                            {report.teacherRemarks}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
