import { useState } from "react";
import { CalendarPlus, Pencil, Plus, X } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useAddPapersMutation, useUpdatePaperMutation } from "../../redux/api/examsApi";
import { useGetSubjectsQuery } from "../../redux/api/timetableApi";
import type { ExamDetail, ExamPaper } from "../../types";
import { clock12, endClock, minutesOf, nextRowDefaults } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

interface Row {
  subjectId: string;
  date: string;
  startTime: string;
  minutes: string;
  marks: string;
  topic: string;
}

type RowField = "subject" | "date" | "start" | "minutes" | "marks" | "topic";
const FIELD_OF: Record<string, RowField> = { subjectId: "subject", date: "date", startTime: "start", durationMinutes: "minutes", maxMarks: "marks", topic: "topic" };

const rowFrom = (p: ExamPaper): Row => ({ subjectId: p.subject.id, date: p.date, startTime: p.startTime, minutes: String(p.durationMinutes), marks: p.maxMarks === null ? "" : String(p.maxMarks), topic: p.topic ?? "" });

/** What the server said, put where it belongs: under a row's box, under the classes, or (the rest) at the top. */
function serverProblems(details: unknown) {
  const rows = new Map<string, string>();
  let classes: string | undefined;
  for (const d of Array.isArray(details) ? (details as { path?: string; message?: string }[]) : []) {
    if (typeof d?.path !== "string" || typeof d.message !== "string") continue;
    const parts = d.path.split(".");
    if (parts[0] === "classIds") classes = d.message;
    else if (parts[0] === "papers" && FIELD_OF[parts[2]]) rows.set(`${parts[1]}:${FIELD_OF[parts[2]]}`, d.message);
    else if (FIELD_OF[parts[0]]) rows.set(`0:${FIELD_OF[parts[0]]}`, d.message);
  }
  return { rows, classes, any: rows.size > 0 || !!classes };
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The timetable of an exam for some classes: tick the classes (or All classes: the whole school), then one row for each paper: the
 * subject, the day, the time it starts, how many minutes, the marks and the topic (the last two are optional). A new row follows the one
 * before it (the next day at the same time), so a whole timetable is filled in quickly. With `paper` it changes that one paper instead.
 * The classes and subjects are read when it opens, not before.
 */
export function PapersDialog({ exam, paper, onClose, onDone }: { exam: ExamDetail; paper?: ExamPaper | null; onClose: () => void; onDone: (title: string, message: string) => void }) {
  const structure = useGetStructureQuery();
  const subjects = useGetSubjectsQuery("active");
  const [add] = useAddPapersMutation();
  const [change] = useUpdatePaperMutation();
  const classes = structure.data?.data.classes ?? [];
  const [classIds, setClassIds] = useState<string[]>(paper?.classIds ?? []);
  const first = nextRowDefaults(null, exam);
  const [rows, setRows] = useState<Row[]>([paper ? rowFrom(paper) : { subjectId: "", date: first.date, startTime: first.startTime, minutes: String(first.durationMinutes), marks: "", topic: "" }]);
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const server = serverProblems(error?.details);

  const subjectOptions = [...(subjects.data?.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name }));

  const rowProblem = (r: Row): Partial<Record<RowField, string>> => {
    const minutes = Number(r.minutes);
    const marks = Number(r.marks);
    return {
      subject: r.subjectId === "" ? "Choose the subject" : undefined,
      date: r.date === "" ? "Choose the day" : undefined,
      start: Number.isNaN(minutesOf(r.startTime)) ? "Enter the start time" : undefined,
      minutes: r.minutes.trim() === "" || !Number.isInteger(minutes) || minutes < 5 || minutes > 600 ? "The time is 5 minutes to 10 hours" : undefined,
      marks: r.marks.trim() !== "" && (!Number.isInteger(marks) || marks < 1 || marks > 1000) ? "The marks are 1 to 1000" : undefined,
    };
  };
  const classesProblem = classIds.length === 0 ? "Choose at least one class" : undefined;
  const invalid = classesProblem !== undefined || rows.some((r) => Object.values(rowProblem(r)).some(Boolean));
  const problemOf = (i: number, field: RowField) => (tried ? rowProblem(rows[i])[field] : undefined) ?? server.rows.get(`${i}:${field}`);

  const update = (i: number, over: Partial<Row>) => setRows((all) => all.map((r, at) => (at === i ? { ...r, ...over } : r)));
  const toggle = (id: string) => setClassIds((all) => (all.includes(id) ? all.filter((c) => c !== id) : classes.map((c) => c.id).filter((c) => c === id || all.includes(c))));

  function addRow() {
    const last = rows[rows.length - 1];
    const next = nextRowDefaults({ date: last.date || exam.startDate, startTime: last.startTime, durationMinutes: Number(last.minutes) || 0 }, exam);
    setRows((all) => [...all, { subjectId: "", date: next.date, startTime: next.startTime, minutes: last.minutes, marks: "", topic: "" }]);
  }

  function save() {
    setTried(true);
    if (invalid) return;
    const papers = rows.map((r) => ({
      subjectId: r.subjectId,
      date: r.date,
      startTime: r.startTime,
      durationMinutes: Number(r.minutes),
      maxMarks: r.marks.trim() === "" ? null : Number(r.marks),
      topic: r.topic.trim() || null,
    }));
    const names = joinNames(classes.filter((c) => classIds.includes(c.id)).map((c) => c.name));
    void run(async () => {
      if (paper) {
        await change({ examId: exam.id, paperId: paper.id, classIds, ...papers[0] }).unwrap();
        onDone("Saved", `${subjectOptions.find((s) => s.value === papers[0].subjectId)?.label ?? paper.subject.name} is changed.`);
      } else {
        await add({ examId: exam.id, classIds, papers }).unwrap();
        onDone("Timetable added", `${papers.length} ${papers.length === 1 ? "paper is" : "papers are"} in the timetable of ${names}.`);
      }
    });
  }

  return (
    <AppModal
      title={paper ? `Change ${paper.subject.name}` : "Add timetable"}
      icon={paper ? Pencil : CalendarPlus}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} onPress={save}>
            Save
          </HeroButton>
        </>
      }
    >
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            Classes<span className="ml-0.5 text-danger" aria-hidden>*</span>
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setClassIds(classes.map((c) => c.id))}>
              All classes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClassIds([])}>
              Clear
            </Button>
          </div>
        </div>
        <div role="group" aria-label="Classes" className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <label key={c.id} className="relative block">
              <input type="checkbox" className="peer sr-only" checked={classIds.includes(c.id)} onChange={() => toggle(c.id)} />
              <span
                className={cn(
                  "inline-flex h-9 cursor-pointer select-none items-center rounded-xl border px-3 text-sm font-semibold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
                  classIds.includes(c.id) ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40" : "border-border bg-surface text-foreground hover:border-primary/50"
                )}
              >
                {c.name}
              </span>
            </label>
          ))}
        </div>
        {(tried ? classesProblem : undefined) ?? server.classes ? (
          <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
            {(tried ? classesProblem : undefined) ?? server.classes}
          </p>
        ) : null}
      </div>

      {rows.map((r, i) => (
        <div key={i} role="group" aria-label={`Paper ${i + 1}`} className="grid gap-3 rounded-xl border border-border bg-surface-muted/40 p-3 sm:grid-cols-6">
          {rows.length > 1 && (
            <div className="-mt-1 flex items-center justify-between sm:col-span-6">
              <p className="text-xs font-bold uppercase tracking-wide text-foreground-muted">Paper {i + 1}</p>
              <Button variant="ghost" size="sm" aria-label={`Remove paper ${i + 1}`} className="size-7 px-0 hover:text-danger" onClick={() => setRows((all) => all.filter((_, at) => at !== i))}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          )}
          <Field id={`paper-${i}-subject`} label="Subject" className="sm:col-span-3" error={problemOf(i, "subject")}>
            <Select id={`paper-${i}-subject`} value={r.subjectId} options={subjectOptions} placeholder="Choose" invalid={!!problemOf(i, "subject")} onChange={(v) => update(i, { subjectId: v })} />
          </Field>
          <Field id={`paper-${i}-date`} label="Day" className="sm:col-span-3" error={problemOf(i, "date")}>
            <DateBox id={`paper-${i}-date`} label="Day" value={r.date} onChange={(v) => update(i, { date: v })} min={exam.startDate} max={exam.endDate} invalid={!!problemOf(i, "date")} />
          </Field>
          <Field id={`paper-${i}-start`} label="Starts" quiet className="sm:col-span-2" error={problemOf(i, "start")}>
            <Input id={`paper-${i}-start`} type="time" value={r.startTime} aria-invalid={problemOf(i, "start") ? true : undefined} onChange={(e) => update(i, { startTime: e.target.value })} />
          </Field>
          <Field
            id={`paper-${i}-minutes`}
            label="Minutes"
            quiet
            className="sm:col-span-2"
            error={problemOf(i, "minutes")}
            hint={endClock(r.startTime, Number(r.minutes)) && Number(r.minutes) >= 5 ? `Ends ${clock12(endClock(r.startTime, Number(r.minutes)))}` : undefined}
          >
            <Input id={`paper-${i}-minutes`} type="number" min={5} max={600} step={5} value={r.minutes} aria-invalid={problemOf(i, "minutes") ? true : undefined} onChange={(e) => update(i, { minutes: e.target.value })} />
          </Field>
          <Field id={`paper-${i}-marks`} label="Marks" quiet className="sm:col-span-2" error={problemOf(i, "marks")}>
            <Input id={`paper-${i}-marks`} type="number" min={1} max={1000} value={r.marks} placeholder="Out of" aria-invalid={problemOf(i, "marks") ? true : undefined} onChange={(e) => update(i, { marks: e.target.value })} />
          </Field>
          <Field id={`paper-${i}-topic`} label="Topic" quiet className="sm:col-span-6" error={problemOf(i, "topic")}>
            <Input id={`paper-${i}-topic`} value={r.topic} maxLength={200} placeholder="Topic or chapters (optional)" onChange={(e) => update(i, { topic: e.target.value })} />
          </Field>
        </div>
      ))}

      {!paper && (
        <Button variant="secondary" size="sm" onClick={addRow}>
          <Plus className="size-4" aria-hidden />
          Add paper
        </Button>
      )}
      <ModalError message={error && !server.any ? error.message : null} />
    </AppModal>
  );
}
