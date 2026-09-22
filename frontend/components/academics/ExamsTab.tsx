"use client";

import { useEffect, useState } from "react";
import { Plus, Lock, LockOpen, Save } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Exam, ExamSubject, MarksSheetRow, Subject } from "@/types";

export function ExamsTab({ canManage, canReopen }: { canManage: boolean; canReopen: boolean }) {
  const { push } = useToast();
  const { classes, sectionsForClass, activeAcademicYear } = useAcademicSetup();
  const [classId, setClassId] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadExams(forClassId: string) {
    if (!forClassId) return setExams([]);
    const res = await api.get<ApiResponse<Exam[]>>("/exams", { classId: forClassId });
    setExams(res.data);
  }

  useEffect(() => {
    loadExams(classId);
    setSelectedExam(null);
  }, [classId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          className="w-48"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} disabled={!classId}>
            <Plus className="size-4" />
            New Exam
          </Button>
        )}
      </div>

      {!classId ? (
        <Card className="p-10 text-center text-sm text-foreground-muted">Select a class to view its exams.</Card>
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState title="No exams scheduled" description="Create an exam to start entering marks." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {exams.map((exam) => (
            <button
              key={exam._id}
              onClick={() => setSelectedExam(exam)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                selectedExam?._id === exam._id ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <p className="font-medium text-foreground">{exam.name}</p>
              <p className="mt-1 text-xs capitalize text-foreground-muted">{exam.examType.replace("_", " ")}</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedExam && (
        <ExamSubjectsPanel
          exam={selectedExam}
          classId={classId}
          sectionsForClass={sectionsForClass}
          canManage={canManage}
          canReopen={canReopen}
        />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Exam">
        <CreateExamForm
          onSave={async (data) => {
            if (!activeAcademicYear) return;
            try {
              await api.post("/exams", { academicYearId: activeAcademicYear._id, classId, ...data });
              push("success", "Exam created");
              setCreateOpen(false);
              loadExams(classId);
            } catch (err) {
              push("error", err instanceof ApiRequestError ? err.message : "Failed to create exam");
            }
          }}
        />
      </Modal>
    </div>
  );
}

function CreateExamForm({
  onSave,
}: {
  onSave: (data: { name: string; examType: string; startDate: string; endDate: string }) => void;
}) {
  const [name, setName] = useState("");
  const [examType, setExamType] = useState("unit_test");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <div className="space-y-4">
      <FormField label="Exam Name">
        <Input required placeholder="Mid-Term Exam" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Type">
        <Select value={examType} onChange={(e) => setExamType(e.target.value)}>
          <option value="unit_test">Unit Test</option>
          <option value="mid_term">Mid-Term</option>
          <option value="final">Final</option>
          <option value="other">Other</option>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start Date">
          <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="End Date">
          <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>
      <Button
        className="w-full"
        disabled={!name || !startDate || !endDate}
        onClick={() => onSave({ name, examType, startDate, endDate })}
      >
        Create Exam
      </Button>
    </div>
  );
}

function ExamSubjectsPanel({
  exam,
  classId,
  sectionsForClass,
  canManage,
  canReopen,
}: {
  exam: Exam;
  classId: string;
  sectionsForClass: (classId: string) => { _id: string; name: string }[];
  canManage: boolean;
  canReopen: boolean;
}) {
  const { push } = useToast();
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [activeSubject, setActiveSubject] = useState<ExamSubject | null>(null);

  async function load() {
    const res = await api.get<ApiResponse<ExamSubject[]>>(`/exams/${exam._id}/subjects`);
    setExamSubjects(res.data);
  }

  useEffect(() => {
    load();
    setActiveSubject(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam._id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{exam.name} — Subjects</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add Subject
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {examSubjects.length === 0 ? (
          <p className="text-sm text-foreground-muted">No subjects added to this exam yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {examSubjects.map((es) => (
              <button
                key={es._id}
                onClick={() => setActiveSubject(es)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  activeSubject?._id === es._id ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground-muted hover:bg-surface-muted"
                }`}
              >
                {(es.subjectId as Subject)?.name}
                {es.isLocked && <Lock className="size-3" />}
              </button>
            ))}
          </div>
        )}

        {activeSubject && (
          <MarksSheet
            examSubject={activeSubject}
            sections={sectionsForClass(classId)}
            canReopen={canReopen}
            onLockChange={load}
          />
        )}
      </CardContent>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Subject to Exam">
        <AddSubjectForm
          classId={classId}
          onSave={async (data) => {
            try {
              await api.post(`/exams/${exam._id}/subjects`, data);
              push("success", "Subject added to exam");
              setAddOpen(false);
              load();
            } catch (err) {
              push("error", err instanceof ApiRequestError ? err.message : "Failed to add subject");
            }
          }}
        />
      </Modal>
    </Card>
  );
}

function AddSubjectForm({ classId, onSave }: { classId: string; onSave: (data: { subjectId: string; maxInternal: number; maxWritten: number }) => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [maxInternal, setMaxInternal] = useState("20");
  const [maxWritten, setMaxWritten] = useState("80");

  useEffect(() => {
    api.get<ApiResponse<Subject[]>>("/academics/subjects").then((res) => setSubjects(res.data.filter((s) => s.classId === classId)));
  }, [classId]);

  return (
    <div className="space-y-4">
      <FormField label="Subject">
        <Select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Select subject</option>
          {subjects.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Max Internal">
          <Input type="number" value={maxInternal} onChange={(e) => setMaxInternal(e.target.value)} />
        </FormField>
        <FormField label="Max Written">
          <Input type="number" value={maxWritten} onChange={(e) => setMaxWritten(e.target.value)} />
        </FormField>
      </div>
      <Button
        className="w-full"
        disabled={!subjectId}
        onClick={() => onSave({ subjectId, maxInternal: Number(maxInternal), maxWritten: Number(maxWritten) })}
      >
        Add Subject
      </Button>
    </div>
  );
}

function MarksSheet({
  examSubject,
  sections,
  canReopen,
  onLockChange,
}: {
  examSubject: ExamSubject;
  sections: { _id: string; name: string }[];
  canReopen: boolean;
  onLockChange: () => void;
}) {
  const { push } = useToast();
  const [sectionId, setSectionId] = useState(sections[0]?._id ?? "");
  const [rows, setRows] = useState<MarksSheetRow[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!sectionId) return;
    const res = await api.get<ApiResponse<{ rows: MarksSheetRow[] }>>(`/exams/subjects/${examSubject._id}/marks`, { sectionId });
    setRows(res.data.rows);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, examSubject._id]);

  function update(studentId: string, patch: Partial<MarksSheetRow>) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    try {
      await api.post(`/exams/subjects/${examSubject._id}/marks`, { entries: rows });
      push("success", "Marks saved");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to save marks");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    try {
      await api.patch(`/exams/subjects/${examSubject._id}/submit`, {});
      push("success", "Marks submitted and locked");
      onLockChange();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to submit marks");
    }
  }

  async function reopen() {
    try {
      await api.patch(`/exams/subjects/${examSubject._id}/reopen`, {});
      push("success", "Marks reopened for editing");
      onLockChange();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to reopen marks");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select className="w-36" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s._id} value={s._id}>
                Section {s.name}
              </option>
            ))}
          </Select>
          {examSubject.isLocked ? (
            <Badge tone="warning">
              <Lock className="mr-1 size-3" />
              Locked
            </Badge>
          ) : (
            <Badge tone="neutral">Editable</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!examSubject.isLocked && (
            <>
              <Button size="sm" variant="outline" loading={saving} onClick={save}>
                <Save className="size-3.5" />
                Save
              </Button>
              <Button size="sm" onClick={submit}>
                Submit &amp; Lock
              </Button>
            </>
          )}
          {examSubject.isLocked && canReopen && (
            <Button size="sm" variant="outline" onClick={reopen}>
              <LockOpen className="size-3.5" />
              Reopen
            </Button>
          )}
        </div>
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Roll</Th>
            <Th>Student</Th>
            <Th>Internal (max {examSubject.maxInternal})</Th>
            <Th>Written (max {examSubject.maxWritten})</Th>
            <Th>Absent</Th>
          </Tr>
        </Thead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.studentId}>
              <Td>{row.rollNumber ?? "—"}</Td>
              <Td className="font-medium">{row.name}</Td>
              <Td>
                <Input
                  type="number"
                  className="w-20"
                  disabled={examSubject.isLocked || row.isAbsent}
                  value={row.internalMarks}
                  onChange={(e) => update(row.studentId, { internalMarks: Number(e.target.value) })}
                />
              </Td>
              <Td>
                <Input
                  type="number"
                  className="w-20"
                  disabled={examSubject.isLocked || row.isAbsent}
                  value={row.writtenMarks}
                  onChange={(e) => update(row.studentId, { writtenMarks: Number(e.target.value) })}
                />
              </Td>
              <Td>
                <input
                  type="checkbox"
                  disabled={examSubject.isLocked}
                  checked={row.isAbsent}
                  onChange={(e) => update(row.studentId, { isAbsent: e.target.checked })}
                />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
