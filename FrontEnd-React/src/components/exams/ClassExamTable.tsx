import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useAddPapersMutation, useDeletePaperMutation, useUpdatePaperMutation } from "../../redux/api/examsApi";
import { useGetSubjectsQuery } from "../../redux/api/timetableApi";
import type { ExamClassRef, ExamDetail, ExamPaper } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { classDayDefaults, clock12, durationText, examDates, minutesOf, weekdayDay } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";

/** A day of the timetable being written: a new paper on `date`, or `paper` being changed. */
interface Editing {
  date: string;
  paper: ExamPaper | null;
}

interface Draft {
  subjectId: string;
  startTime: string;
  endTime: string;
  marks: string;
  topic: string;
}

const isSunday = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay() === 0;
/** "Fri, 6 Nov": the day as the table's first column says it. */
const dayLabel = (day: string) => weekdayDay(day);

/** The first thing the server said is wrong (a box's message, else the whole answer's). */
function serverMessage(err: unknown): string {
  const e = getApiError(err);
  const detail = Array.isArray(e?.details) ? (e.details as { message?: string }[]).find((d) => typeof d?.message === "string")?.message : undefined;
  return detail ?? e?.message ?? "Could not save it. Please try again.";
}

/**
 * One class's exam timetable as a table (2026-11-27, the user: "upar class rahegi, wahan se select karunga, niche table form mein time table, time
 * date sab rahe, fir click karke wahan subject dun"): a row for every day of the exam (a Sunday says so), each paper of the class that day with its
 * subject, time, marks and topic. A click on a day writes a paper right in its row (the subject, from when to when: the school's time for the class
 * that day, the marks and the topic) with an explicit Save; a paper's pencil changes it, its bin takes it off the class (a paper shared with other
 * classes only loses this one). The subjects are read the first time a day is clicked. A year that is over is only looked at.
 */
export function ClassExamTable({ exam, klass }: { exam: ExamDetail; klass: ExamClassRef }) {
  const readOnly = useReadOnlyYear();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState<ExamPaper | null>(null);
  const [opened, setOpened] = useState(false);
  const subjects = useGetSubjectsQuery("active", { skip: !opened });
  const [add, adding] = useAddPapersMutation();
  const [change, changing] = useUpdatePaperMutation();
  const [remove, removing] = useDeletePaperMutation();
  const busy = adding.isLoading || changing.isLoading;
  const papers = exam.papers.filter((p) => p.classIds.includes(klass.id));
  const subjectOptions = [...(subjects.data?.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name }));

  function open(next: Editing) {
    const times = next.paper ? { startTime: next.paper.startTime, endTime: next.paper.endTime } : classDayDefaults(exam, papers, next.date);
    setOpened(true);
    setEditing(next);
    setDraft({ subjectId: next.paper?.subject.id ?? "", ...times, marks: next.paper?.maxMarks == null ? "" : String(next.paper.maxMarks), topic: next.paper?.topic ?? "" });
    setTried(false);
    setFailed(null);
  }
  const close = () => {
    setEditing(null);
    setDraft(null);
  };

  const minutes = draft ? minutesOf(draft.endTime) - minutesOf(draft.startTime) : NaN;
  const problems = draft
    ? {
        subject: draft.subjectId === "" ? "Choose the subject" : undefined,
        time: Number.isNaN(minutesOf(draft.startTime))
          ? "Enter the start time"
          : Number.isNaN(minutesOf(draft.endTime))
            ? "Enter the end time"
            : minutes <= 0
              ? "The paper must end after it starts"
              : minutes < 5 || minutes > 600
                ? "The time is 5 minutes to 10 hours"
                : undefined,
        marks: draft.marks.trim() !== "" && (!Number.isInteger(Number(draft.marks)) || Number(draft.marks) < 1 || Number(draft.marks) > 1000) ? "The marks are 1 to 1000" : undefined,
      }
    : {};
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  async function save() {
    if (!editing || !draft) return;
    setTried(true);
    setFailed(null);
    if (Object.values(problems).some(Boolean)) return;
    const body = {
      subjectId: draft.subjectId,
      date: editing.date,
      startTime: draft.startTime,
      durationMinutes: minutes,
      maxMarks: draft.marks.trim() === "" ? null : Number(draft.marks),
      topic: draft.topic.trim() || null,
    };
    const subjectName = subjectOptions.find((s) => s.value === draft.subjectId)?.label ?? editing.paper?.subject.name ?? "The paper";
    try {
      if (editing.paper) {
        await change({ examId: exam.id, paperId: editing.paper.id, ...body }).unwrap();
        toast.push("success", `${subjectName} is saved.`);
      } else {
        await add({ examId: exam.id, classIds: [klass.id], papers: [body] }).unwrap();
        toast.push("success", `${subjectName} is on ${dayLabel(editing.date)} for ${klass.name}.`);
      }
      close();
    } catch (err) {
      setFailed(serverMessage(err));
    }
  }

  async function takeOff() {
    if (!asking) return;
    const paper = asking;
    try {
      // A paper the class shares with others only loses this class; one of this class alone goes.
      if (paper.classIds.length > 1) await change({ examId: exam.id, paperId: paper.id, classIds: paper.classIds.filter((c) => c !== klass.id) }).unwrap();
      else await remove({ examId: exam.id, paperId: paper.id }).unwrap();
      toast.push("success", `${paper.subject.name} is off ${klass.name}.`);
    } catch (err) {
      toast.push("error", serverMessage(err));
    }
    setAsking(null);
  }

  const dateCell = (date: string) => (
    <td className="whitespace-nowrap px-4 py-3 align-top">
      <span className="block font-semibold text-foreground">{dayLabel(date)}</span>
      {isSunday(date) && <span className="block text-xs font-semibold text-foreground-muted">Sunday</span>}
    </td>
  );

  const editorRow = (date: string, key: string) =>
    draft && (
      <tr key={key} className="bg-primary-soft/30 align-top">
        {dateCell(date)}
        <td className="px-3 py-2.5">
          <Select id={`cell-subject-${date}`} aria-label="Subject" placeholder="Pick a subject" value={draft.subjectId} options={subjectOptions} invalid={!!shown("subject")} onChange={(v) => setDraft({ ...draft, subjectId: v })} />
          {shown("subject") && <p className="mt-1 text-xs font-medium text-danger">{shown("subject")}</p>}
          {failed && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {failed}
            </p>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Input type="time" aria-label="Starts" value={draft.startTime} aria-invalid={shown("time") ? true : undefined} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            <span className="text-foreground-muted">to</span>
            <Input type="time" aria-label="Ends" value={draft.endTime} aria-invalid={shown("time") ? true : undefined} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
          </div>
          {shown("time") ? <p className="mt-1 text-xs font-medium text-danger">{shown("time")}</p> : minutes >= 5 && <p className="mt-1 text-xs text-foreground-muted">{durationText(minutes)}</p>}
        </td>
        <td className="px-3 py-2.5">
          <Input type="number" aria-label="Marks" min={1} max={1000} placeholder="Out of" value={draft.marks} aria-invalid={shown("marks") ? true : undefined} onChange={(e) => setDraft({ ...draft, marks: e.target.value })} />
          {shown("marks") && <p className="mt-1 text-xs font-medium text-danger">{shown("marks")}</p>}
        </td>
        <td className="px-3 py-2.5">
          <Input aria-label="Topic" maxLength={200} placeholder="Optional" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end gap-1.5">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table aria-label={`Timetable of ${klass.name}`} className="w-full min-w-[56rem] text-left text-sm">
        <colgroup>
          <col className="w-36" />
          <col className="w-64" />
          <col className="w-80" />
          <col className="w-28" />
          <col />
          <col className="w-40" />
        </colgroup>
        <thead className="border-b border-border bg-surface-muted/50">
          <tr className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
            <th scope="col" className="px-4 py-3">Date</th>
            <th scope="col" className="px-4 py-3">Subject</th>
            <th scope="col" className="px-4 py-3">Time</th>
            <th scope="col" className="px-4 py-3">Marks</th>
            <th scope="col" className="px-4 py-3">Topic</th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Change</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {examDates(exam.startDate, exam.endDate).flatMap((date) => {
            const ofDay = papers.filter((p) => p.date === date);
            const newHere = editing?.paper === null && editing.date === date;
            const rows = ofDay.map((p, i) =>
              editing?.paper?.id === p.id ? (
                editorRow(date, p.id)
              ) : (
                <tr key={p.id} className="align-top transition-colors hover:bg-surface-muted/40">
                  {dateCell(date)}
                  <td className="px-4 py-3">
                    <span className="font-semibold text-foreground">{p.subject.name}</span>
                    {p.classIds.length > 1 && <span className="mt-0.5 block text-xs text-foreground-muted">Also {p.classes.filter((c) => c.id !== klass.id).map((c) => c.name).join(", ")}</span>}
                    {p.holiday && (
                      <span className="mt-1 block">
                        <Badge tone="warning">Holiday: {p.holiday}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    {clock12(p.startTime)} to {clock12(p.endTime)}
                    <span className="block text-xs text-foreground-muted">{durationText(p.durationMinutes)}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{p.maxMarks ?? <span className="text-foreground-muted">–</span>}</td>
                  <td className="px-4 py-3 text-foreground">{p.topic ?? <span className="text-foreground-muted">–</span>}</td>
                  <td className="px-3 py-2">
                    {!readOnly && (
                      <span className="flex justify-end gap-1">
                        {i === ofDay.length - 1 && !newHere && (
                          <Button variant="ghost" size="sm" aria-label={`Add another subject on ${dayLabel(date)}`} onClick={() => open({ date, paper: null })}>
                            <Plus className="size-4" aria-hidden />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" aria-label={`Change ${p.subject.name}`} onClick={() => open({ date, paper: p })}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Take ${p.subject.name} off ${klass.name}`} className="hover:text-danger" onClick={() => setAsking(p)}>
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            );
            if (newHere) rows.push(editorRow(date, `new-${date}`));
            if (rows.length > 0) return rows;
            return [
              <tr key={date} className={cn("align-top", isSunday(date) && "bg-surface-muted/40")}>
                {dateCell(date)}
                <td colSpan={5} className="px-4 py-2.5">
                  {readOnly ? (
                    <span className="text-foreground-muted">–</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Add subject on ${dayLabel(date)}`}
                      onClick={() => open({ date, paper: null })}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-sm font-semibold text-foreground-muted transition-colors hover:border-primary/60 hover:bg-primary-soft/40 hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                    >
                      <Plus className="size-4" aria-hidden />
                      Add subject
                    </button>
                  )}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>

      {asking && (
        <AppModal
          title={`Take ${asking.subject.name} off ${klass.name}?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={removing.isLoading || changing.isLoading}
          onClose={() => setAsking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAsking(null)} isDisabled={removing.isLoading || changing.isLoading}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing.isLoading || changing.isLoading} onPress={() => void takeOff()}>
                Take off
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">
            {asking.classIds.length > 1 ? `The other classes keep it (${asking.classes.filter((c) => c.id !== klass.id).map((c) => c.name).join(", ")}).` : "It goes from the exam."}
            {asking.marked > 0 && ` Marks entered for it go with it.`}
          </p>
        </AppModal>
      )}
    </div>
  );
}
