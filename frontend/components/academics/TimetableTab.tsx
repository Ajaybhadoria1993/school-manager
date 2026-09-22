"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ApiResponse, Staff, Subject, TimetableSlot } from "@/types";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export function TimetableTab({ canEdit }: { canEdit: boolean }) {
  const { push } = useToast();
  const { classes, sectionsForClass, activeAcademicYear } = useAcademicSetup();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Staff[]>([]);
  const [editing, setEditing] = useState<{ day: number; period: number } | null>(null);

  useEffect(() => {
    if (!classId) return;
    api.get<ApiResponse<Subject[]>>("/academics/subjects").then((res) => setSubjects(res.data.filter((s) => s.classId === classId)));
  }, [classId]);

  useEffect(() => {
    api.get<ApiResponse<Staff[]>>("/staff", { category: "teaching" }).then((res) => setTeachers(res.data));
  }, []);

  async function loadSlots() {
    if (!sectionId) return;
    const res = await api.get<ApiResponse<TimetableSlot[]>>("/timetable", { sectionId });
    setSlots(res.data);
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const slotFor = (day: number, period: number) => slots.find((s) => s.dayOfWeek === day && s.periodNumber === period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          className="w-48"
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
        <Select className="w-40" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
          <option value="">Select section</option>
          {sectionsForClass(classId).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {!sectionId ? (
        <Card className="p-10 text-center text-sm text-foreground-muted">Select a class and section to view its timetable.</Card>
      ) : (
        <Card className="overflow-x-auto p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-20 p-2 text-left text-xs font-semibold uppercase text-foreground-muted">Period</th>
                {DAYS.map((d) => (
                  <th key={d.value} className="p-2 text-left text-xs font-semibold uppercase text-foreground-muted">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period} className="border-t border-border">
                  <td className="p-2 font-medium text-foreground-muted">P{period}</td>
                  {DAYS.map((d) => {
                    const slot = slotFor(d.value, period);
                    return (
                      <td key={d.value} className="p-1">
                        <button
                          disabled={!canEdit}
                          onClick={() => setEditing({ day: d.value, period })}
                          className="flex h-16 w-full flex-col items-start justify-center rounded-lg border border-border px-2 text-left hover:bg-surface-muted disabled:cursor-default"
                        >
                          {slot ? (
                            slot.isBreak ? (
                              <span className="text-xs font-medium text-foreground-muted">Break</span>
                            ) : (
                              <>
                                <span className="text-xs font-medium text-foreground">
                                  {(slot.subjectId as Subject)?.name}
                                </span>
                                <span className="text-[11px] text-foreground-muted">{(slot.staffId as Staff)?.name}</span>
                              </>
                            )
                          ) : (
                            canEdit && <Plus className="size-3.5 text-foreground-muted" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Period ${editing?.period} — ${DAYS.find((d) => d.value === editing?.day)?.label}`}>
        {editing && (
          <SlotForm
            existing={slotFor(editing.day, editing.period)}
            subjects={subjects}
            teachers={teachers}
            onSave={async (data) => {
              if (!activeAcademicYear) return;
              try {
                await api.post("/timetable", {
                  branchId: activeAcademicYear.branchId,
                  academicYearId: activeAcademicYear._id,
                  sectionId,
                  dayOfWeek: editing.day,
                  periodNumber: editing.period,
                  ...data,
                });
                push("success", "Timetable updated");
                setEditing(null);
                loadSlots();
              } catch (err) {
                push("error", err instanceof ApiRequestError ? err.message : "Failed to save slot");
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function SlotForm({
  existing,
  subjects,
  teachers,
  onSave,
}: {
  existing?: TimetableSlot;
  subjects: Subject[];
  teachers: Staff[];
  onSave: (data: {
    startTime: string;
    endTime: string;
    isBreak: boolean;
    subjectId?: string;
    staffId?: string;
  }) => void;
}) {
  const [isBreak, setIsBreak] = useState(existing?.isBreak ?? false);
  const [subjectId, setSubjectId] = useState(
    typeof existing?.subjectId === "string" ? existing.subjectId : existing?.subjectId?._id ?? ""
  );
  const [staffId, setStaffId] = useState(typeof existing?.staffId === "string" ? existing.staffId : existing?.staffId?._id ?? "");
  const [startTime, setStartTime] = useState(existing?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "09:40");

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
        This is a break / interval
      </label>

      {!isBreak && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Subject</label>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Teacher</label>
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select teacher</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Start</label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">End</label>
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() =>
          onSave({
            startTime,
            endTime,
            isBreak,
            subjectId: isBreak ? undefined : subjectId || undefined,
            staffId: isBreak ? undefined : staffId || undefined,
          })
        }
      >
        Save Slot
      </Button>
    </div>
  );
}
