"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, Check } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import type { ApiResponse, AttendanceRecord, AttendanceStatus, Student } from "@/types";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; className: string }[] = [
  { value: "present", label: "Present", className: "data-[active=true]:bg-success data-[active=true]:text-white" },
  { value: "absent", label: "Absent", className: "data-[active=true]:bg-danger data-[active=true]:text-white" },
  { value: "late", label: "Late", className: "data-[active=true]:bg-warning data-[active=true]:text-white" },
  { value: "half_day", label: "Half Day", className: "data-[active=true]:bg-info data-[active=true]:text-white" },
  { value: "excused", label: "Excused", className: "data-[active=true]:bg-foreground-muted data-[active=true]:text-white" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { push } = useToast();
  const { classes, sectionsForClass, activeAcademicYear } = useAcademicSetup();
  const searchParams = useSearchParams();

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState(searchParams.get("sectionId") ?? "");
  const [date, setDate] = useState(todayStr());
  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => sectionsForClass(classId), [classId, sectionsForClass]);

  useEffect(() => {
    if (!sectionId || !date) return;
    setLoading(true);
    Promise.all([
      api.get<ApiResponse<Student[]>>("/students", { sectionId, limit: 200 }),
      api.get<ApiResponse<AttendanceRecord[]>>("/attendance/by-day", { sectionId, date }),
    ]).then(([studentsRes, attendanceRes]) => {
      setStudents(studentsRes.data);
      const next: Record<string, AttendanceStatus> = {};
      for (const s of studentsRes.data) next[s._id] = "present";
      for (const rec of attendanceRes.data) {
        const sid = typeof rec.studentId === "string" ? rec.studentId : rec.studentId._id;
        next[sid] = rec.status;
      }
      setStatuses(next);
      setLoading(false);
    });
  }, [sectionId, date]);

  async function submit() {
    if (!sectionId || !classId || !activeAcademicYear) return;
    setSaving(true);
    try {
      await api.post("/attendance/mark", {
        branchId: activeAcademicYear.branchId,
        academicYearId: activeAcademicYear._id,
        classId,
        sectionId,
        date,
        entries: students.map((s) => ({ studentId: s._id, status: statuses[s._id] ?? "present" })),
      });
      push("success", "Attendance submitted. Absent students' guardians have been notified.");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to submit attendance");
    } finally {
      setSaving(false);
    }
  }

  const presentCount = Object.values(statuses).filter((s) => s === "present" || s === "late").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
        <p className="text-sm text-foreground-muted">Mark daily attendance — defaults to Present, tap to change.</p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
            <option value="">Select section</option>
            {sections.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayStr()} />
        </div>
      </Card>

      {!sectionId ? (
        <Card>
          <EmptyState title="Select a class and section" description="Choose a class, section and date to mark attendance." />
        </Card>
      ) : loading ? (
        <p className="text-sm text-foreground-muted">Loading students…</p>
      ) : students.length === 0 ? (
        <Card>
          <EmptyState title="No students in this section" />
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {presentCount}/{students.length} marked present
            </CardTitle>
            <Button onClick={submit} loading={saving}>
              <Check className="size-4" />
              Submit Attendance
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {students.map((s) => (
              <div
                key={s._id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {s.firstName} {s.lastName}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    Roll #{s.rollNumber ?? "—"} &middot; {s.admissionNumber}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      data-active={statuses[s._id] === opt.value}
                      onClick={() => setStatuses((prev) => ({ ...prev, [s._id]: opt.value }))}
                      className={cn(
                        "rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-muted transition-colors",
                        opt.className
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="flex items-center gap-3 p-4">
        <CalendarCheck className="size-5 text-primary" />
        <p className="text-sm text-foreground-muted">
          Parents of students marked <span className="font-medium text-danger">Absent</span> are notified automatically via
          WhatsApp/SMS on submit.
        </p>
      </Card>
    </div>
  );
}
