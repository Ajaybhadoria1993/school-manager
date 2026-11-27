import { useState } from "react";
import { useSearchParams } from "react-router";
import { CircleCheck, CopyPlus } from "lucide-react";
import { useGetExamQuery } from "../../redux/api/examsApi";
import type { Exam, ExamDetail } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { classesOfExam, examDays } from "../../utils/exams";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ChipPicker } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { ClassExamTable } from "./ClassExamTable";
import { ExamRoomsPanel } from "./ExamRoomsPanel";
import { ExamStudents } from "./ExamStudents";
import { PapersDialog } from "./PapersDialog";

export type WorkspaceTab = "timetable" | "students" | "rooms";
const classesOf = classesOfExam;

/**
 * The tabs of one exam on the Exam page (2026-11-27): **Exam Time Table** (a class at the top, its days in a table where a click puts a subject),
 * **Students** (each child's name, father's name, roll number and room; roll numbers given here) and **Rooms** (which run of roll numbers sits in
 * which room). The exam is chosen once for all three (the one that is on, else the next, from the list already read) and kept in the address with
 * the class; only the chosen exam is read.
 */
export function ExamWorkspace({ items, tab }: { items: Exam[]; tab: WorkspaceTab }) {
  const [params, setParams] = useSearchParams();
  // The list comes in the server's order: the exam that is on first, then the next ones, then the ones that are over.
  const chosen = items.find((e) => e.id === params.get("exam")) ?? items[0];
  const res = useGetExamQuery(chosen?.id ?? "", { skip: !chosen });
  const exam = res.currentData?.data;

  if (!chosen) {
    return <Card className="px-5 py-14 text-center text-sm font-semibold text-foreground-muted">Schedule an exam first: its timetable is made here</Card>;
  }

  const chooseExam = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("exam", id);
      next.delete("class");
      next.delete("section");
      return next;
    });

  return (
    <div className="space-y-4">
      <Field id="timetable-exam" label="Exam" quiet className="max-w-md">
        <Select id="timetable-exam" value={chosen.id} onChange={chooseExam} options={items.map((e) => ({ value: e.id, label: `${e.name} · ${examDays(e.startDate, e.endDate)}` }))} />
      </Field>

      {res.isFetching && !exam ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !exam ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exam."}</Card>
      ) : classesOf(exam).length === 0 ? (
        <Card className="px-5 py-14 text-center text-sm font-semibold text-foreground-muted">This exam has no class: change whom it is for</Card>
      ) : tab === "students" ? (
        <ExamStudents exam={exam} />
      ) : tab === "rooms" ? (
        <ExamRoomsPanel exam={exam} />
      ) : (
        <TimetableBody exam={exam} />
      )}
    </div>
  );
}

/**
 * Exam Time Table (2026-11-26, redone 2026-11-27 after the user's screenshot: "upar class rahegi, wahan se select karunga class, fir niche table form
 * mein time table, fir click karke wahan subject dun"): the exam's classes at the top (a tick on the ones that have a timetable), the chosen class's
 * days in a table, and Same for several classes for one timetable of many classes at once.
 */
function TimetableBody({ exam }: { exam: ExamDetail }) {
  const [params, setParams] = useSearchParams();
  const readOnly = useReadOnlyYear();
  const toast = useToast();
  const [several, setSeveral] = useState(false);
  const classes = classesOf(exam);
  const klass = classes.find((c) => c.id === params.get("class")) ?? classes[0];
  const made = new Set(exam.papers.flatMap((p) => p.classIds));
  const done = classes.filter((c) => made.has(c.id)).length;
  const chooseClass = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("class", id);
      return next;
    });

  return (
    <>
      <Card className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            Class
            <span className="ml-2 font-normal text-foreground-muted">{`${done} of ${classes.length} ${classes.length === 1 ? "class has" : "classes have"} a timetable`}</span>
          </p>
          {!readOnly && classes.length > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setSeveral(true)}>
              <CopyPlus className="size-4" aria-hidden />
              Same for several classes
            </Button>
          )}
        </div>
        <ChipPicker
          label="Class"
          value={klass.id}
          onChange={chooseClass}
          options={classes.map((c) => (made.has(c.id) ? { value: c.id, label: c.name, icon: CircleCheck, tone: "success" as const } : { value: c.id, label: c.name }))}
        />
      </Card>
      <ClassExamTable key={`${exam.id}:${klass.id}`} exam={exam} klass={klass} />
      {several && (
        <PapersDialog
          exam={exam}
          onClose={() => setSeveral(false)}
          onDone={(_title, message) => {
            setSeveral(false);
            toast.push("success", message);
          }}
        />
      )}
    </>
  );
}
