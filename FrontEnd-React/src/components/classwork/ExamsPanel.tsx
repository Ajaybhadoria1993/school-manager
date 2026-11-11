import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetClassExamsQuery, useGetMarksSheetQuery, useSaveExamMarksMutation } from "../../redux/api/examsApi";
import { getApiError } from "../../utils/apiErrors";
import { clock12, durationText, examDays, isHalfMark, weekdayDay } from "../../utils/exams";
import type { ClassPaper } from "../../types";
import { STATUS_LOOK } from "../exams/look";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";

const markText = (v: string) => v.replace(/[^\d.]/g, "").slice(0, 6);

/** The marks of one paper for this class: each child's marks out of the paper's, or a tick for absent; one Save. Read only for a teacher who does not write the subject. */
function MarksDialog({
  paper,
  classId,
  sectionId,
  onClose,
  onSaved,
}: {
  paper: ClassPaper;
  classId: string;
  sectionId: string | null;
  onClose: () => void;
  onSaved: (average: number | null, label: string) => void;
}) {
  const res = useGetMarksSheetQuery({ paperId: paper.id, classId, sectionId });
  const [save] = useSaveExamMarksMutation();
  const sheet = res.data?.data;
  const [marks, setMarks] = useState<Record<string, { marks: string; absent: boolean }>>({});
  const { busy, error, run } = useSave(() => undefined);
  useEffect(() => {
    if (sheet) setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, { marks: s.marks === null ? "" : String(s.marks), absent: s.absent }])));
  }, [sheet]);
  const entered = Object.values(marks).filter((m) => !m.absent && m.marks !== "");
  const max = sheet?.maxMarks ?? paper.maxMarks ?? 0;
  const over = entered.some((m) => Number(m.marks) > max);
  const odd = !over && entered.some((m) => Number.isNaN(Number(m.marks)) || !isHalfMark(Number(m.marks)));
  const editable = !!sheet?.canWrite;

  function send() {
    if (!sheet || over || odd) return;
    void run(async () => {
      const saved = (
        await save({
          paperId: paper.id,
          classId,
          sectionId,
          marks: sheet.students.map((s) => {
            const m = marks[s.id] ?? { marks: "", absent: false };
            return { studentId: s.id, marks: m.absent || m.marks === "" ? null : Number(m.marks), absent: m.absent };
          }),
        }).unwrap()
      ).data;
      onSaved(saved.average, saved.label);
    });
  }

  return (
    <AppModal
      title={`Marks of ${paper.subject.name}`}
      icon={ClipboardCheck}
      busy={busy}
      onClose={onClose}
      footer={
        editable ? (
          <>
            <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </HeroButton>
            <HeroButton variant="primary" isPending={busy} onPress={send}>
              Save marks
            </HeroButton>
          </>
        ) : (
          <HeroButton variant="primary" onPress={onClose}>
            Close
          </HeroButton>
        )
      }
    >
      {!sheet ? (
        res.error ? (
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the marks."}</p>
        ) : (
          <Skeleton className="h-40 rounded-xl" />
        )
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            {sheet.exam.name} · {weekdayDay(sheet.date)} · Out of {sheet.maxMarks}
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {sheet.students.map((s) => {
              const m = marks[s.id] ?? { marks: "", absent: false };
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="flex items-center gap-3">
                    <input
                      aria-label={`Marks of ${s.name}`}
                      inputMode="decimal"
                      disabled={!editable || m.absent}
                      value={m.marks}
                      onChange={(e) => setMarks((all) => ({ ...all, [s.id]: { ...m, marks: markText(e.target.value) } }))}
                      className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-right text-sm text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted"
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                      <input
                        type="checkbox"
                        aria-label={`${s.name} was absent`}
                        disabled={!editable}
                        checked={m.absent}
                        onChange={(e) => setMarks((all) => ({ ...all, [s.id]: { marks: "", absent: e.target.checked } }))}
                        className="size-4 accent-primary"
                      />
                      Absent
                    </label>
                  </span>
                </li>
              );
            })}
          </ul>
          {over && <p className="text-sm font-semibold text-danger">Marks are out of {max}</p>}
          {odd && <p className="text-sm font-semibold text-danger">Marks are whole or half marks</p>}
          <ModalError message={error?.message ?? null} />
        </>
      )}
    </AppModal>
  );
}

/** What a paper says about its marks, and the button that opens them (if the caller may). */
function PaperAction({ paper, onOpen }: { paper: ClassPaper; onOpen: (paper: ClassPaper) => void }) {
  if (!paper.held) return <Badge tone="info">Coming</Badge>;
  if (paper.maxMarks === null) return <span className="text-sm text-foreground-muted">Marks not set</span>;
  const subject = paper.subject.name;
  return (
    <div className="flex items-center gap-2">
      {paper.marked > 0 ? <span className="text-sm text-foreground-muted">{`Marks of ${paper.marked} of ${paper.children}`}</span> : <Badge tone="warning">Marks due</Badge>}
      {paper.canWrite ? (
        <Button size="sm" variant={paper.marked > 0 ? "outline" : "primary"} aria-label={`${paper.marked > 0 ? "Change" : "Enter"} marks of ${subject}`} onClick={() => onOpen(paper)}>
          <ClipboardCheck className="size-4" aria-hidden />
          {paper.marked > 0 ? "Change marks" : "Enter marks"}
        </Button>
      ) : (
        paper.marked > 0 && (
          <Button size="sm" variant="outline" aria-label={`View marks of ${subject}`} onClick={() => onOpen(paper)}>
            View marks
          </Button>
        )
      )}
    </div>
  );
}

/**
 * A class's exams (2026-11-06, the Exams tab of its work): each exam of the year with its days and the school's hours and, under it,
 * this class's own papers in date order (the subject, the day and time, the topic, what it is out of). After a paper is held, the
 * teacher of its subject, the class teacher and the school **enter the marks** (a window with every child); other teachers of the class
 * can look. A day that became a holiday after the paper was set is said, so the school can move it. One read for the whole tab.
 */
export function ExamsPanel({ classId, sectionId }: { classId: string; sectionId: string | null }) {
  const res = useGetClassExamsQuery({ classId, sectionId });
  const [marking, setMarking] = useState<ClassPaper | null>(null);
  const result = useResultModal();
  const exams = res.data?.data.items;

  return (
    <section aria-label="Exams" className="space-y-4">
      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !exams ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exams."}</Card>
      ) : exams.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No exam or test yet</Card>
      ) : (
        exams.map((exam) => (
          <section key={exam.id} aria-label={exam.name} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted/50 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-section-heading">{exam.name}</h3>
                <p className="text-sm text-foreground-muted">
                  {exam.typeLabel} · {examDays(exam.startDate, exam.endDate)}
                  {exam.schoolHours && ` · School ${clock12(exam.schoolHours.start)} to ${clock12(exam.schoolHours.end)}`}
                </p>
              </div>
              <Badge tone={STATUS_LOOK[exam.status].tone}>{STATUS_LOOK[exam.status].label}</Badge>
            </div>
            {exam.papers.length === 0 ? (
              <p className="px-4 py-4 text-sm text-foreground-muted">Timetable not made yet</p>
            ) : (
              <ul className="divide-y divide-border">
                {exam.papers.map((p) => (
                  <li key={p.id} aria-label={`${p.subject.name}, ${weekdayDay(p.date)}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-bold text-foreground">
                        {p.subject.name}
                        {p.topic && <span className="ml-2 font-normal text-foreground-muted">{p.topic}</span>}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        {weekdayDay(p.date)} · {clock12(p.startTime)} to {clock12(p.endTime)} · {durationText(p.durationMinutes)}
                        {p.maxMarks !== null && ` · out of ${p.maxMarks}`}
                      </p>
                      {p.holiday && <Badge tone="warning">Holiday: {p.holiday}</Badge>}
                    </div>
                    <PaperAction paper={p} onOpen={setMarking} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {marking && (
        <MarksDialog
          paper={marking}
          classId={classId}
          sectionId={sectionId}
          onClose={() => setMarking(null)}
          onSaved={(average, label) => {
            const subject = marking.subject.name;
            setMarking(null);
            result.done("Marks saved", `${subject} marks of ${label} are saved.${average === null ? "" : ` The class average is ${average}%.`}`);
          }}
        />
      )}
      {result.modal}
    </section>
  );
}
