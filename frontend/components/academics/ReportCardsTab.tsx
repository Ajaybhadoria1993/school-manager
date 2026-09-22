"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import type { ApiResponse, Exam, ReportCardData } from "@/types";

export function ReportCardsTab({ canPublish }: { canPublish: boolean }) {
  const { push } = useToast();
  const { classes } = useAcademicSetup();
  const [classId, setClassId] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!classId) return setExams([]);
    api.get<ApiResponse<Exam[]>>("/exams", { classId }).then((res) => setExams(res.data));
    setExamId("");
  }, [classId]);

  async function load() {
    if (!examId) return;
    setLoading(true);
    const res = await api.get<ApiResponse<ReportCardData[]>>(`/exams/${examId}/report-cards`);
    setReports(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function publishAll() {
    try {
      await api.post(`/exams/${examId}/report-cards/publish-all`, {});
      push("success", "All report cards published to parents");
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to publish report cards");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Select className="w-48" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-56" value={examId} onChange={(e) => setExamId(e.target.value)} disabled={!classId}>
            <option value="">Select exam</option>
            {exams.map((ex) => (
              <option key={ex._id} value={ex._id}>
                {ex.name}
              </option>
            ))}
          </Select>
        </div>
        {canPublish && reports.length > 0 && (
          <Button onClick={publishAll}>
            <Send className="size-4" />
            Publish All to Parents
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-foreground-muted">Loading report cards…</p>
      ) : !examId ? (
        <Card className="p-10 text-center text-sm text-foreground-muted">Select a class and exam to review report cards.</Card>
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState title="No students found" description="This class may not have any active students yet." />
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCardRow key={report.student.id} report={report} examId={examId} canPublish={canPublish} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCardRow({
  report,
  examId,
  canPublish,
  onChange,
}: {
  report: ReportCardData;
  examId: string;
  canPublish: boolean;
  onChange: () => void;
}) {
  const { push } = useToast();
  const [remarks, setRemarks] = useState(report.teacherRemarks);
  const [saving, setSaving] = useState(false);

  async function saveRemarks() {
    setSaving(true);
    try {
      await api.patch(`/exams/${examId}/report-cards/${report.student.id}/remarks`, { teacherRemarks: remarks });
      push("success", "Remarks saved");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to save remarks");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    try {
      await api.post(`/exams/${examId}/report-cards/${report.student.id}/publish`, {});
      push("success", `Published to ${report.student.name}'s parent`);
      onChange();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to publish");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {report.student.name}{" "}
          <span className="ml-1 font-normal text-foreground-muted">({report.student.admissionNumber})</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge tone={report.status === "published" ? "success" : "neutral"} className="capitalize">
            {report.status}
          </Badge>
          {report.status === "published" && <CheckCircle2 className="size-4 text-success" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm">
          {report.subjects.map((s) => (
            <div key={s.subjectName} className="rounded-lg border border-border px-3 py-1.5">
              <span className="text-foreground-muted">{s.subjectName}: </span>
              <span className="font-medium text-foreground">{s.isAbsent ? "AB" : `${s.obtained}/${s.maxTotal}`}</span>
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
            Percentage: <span className="font-medium text-foreground">{report.totals.percentage}%</span>
          </span>
          <span>
            Overall Grade: <span className="font-medium text-foreground">{report.totals.grade}</span>
          </span>
          <span>
            Attendance: <span className="font-medium text-foreground">{report.attendancePercentage ?? "—"}%</span>
          </span>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground-muted">Teacher Remarks</label>
          <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" loading={saving} onClick={saveRemarks}>
            Save Remarks
          </Button>
          {canPublish && report.status !== "published" && (
            <Button size="sm" onClick={publish}>
              Publish
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
