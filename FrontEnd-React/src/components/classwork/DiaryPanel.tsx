import { useState } from "react";
import { BookOpenText, NotebookPen } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetDiaryQuery, useSaveDiaryMutation } from "../../redux/api/classroomApi";
import { addDays } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { todayInIndia } from "../../utils/students";
import type { DiaryDay } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";

const areaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#94a3b8] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

type Subject = DiaryDay["subjects"][number];

/** Write one subject's day: what was taught, and the homework. */
function WriteDialog({ day, subject, classId, sectionId, onClose, onSaved }: { day: DiaryDay; subject: Subject; classId: string; sectionId: string | null; onClose: () => void; onSaved: () => void }) {
  const [save] = useSaveDiaryMutation();
  const [taught, setTaught] = useState(subject.entry?.taught ?? "");
  const [homework, setHomework] = useState(subject.entry?.homework ?? "");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const empty = taught.trim() === "" && homework.trim() === "";

  function send() {
    setTried(true);
    if (empty) return;
    void run(async () => {
      await save({ classId, sectionId, date: day.date, subjectId: subject.subjectId, taught: taught.trim(), homework: homework.trim() }).unwrap();
      onSaved();
    });
  }

  return (
    <AppModal
      title={`${subject.subjectName}, ${day.label}`}
      icon={NotebookPen}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} onPress={send}>
            Save
          </HeroButton>
        </>
      }
    >
      <Field id="diary-taught" label="Taught today" error={tried && empty ? "Write what was taught or the homework" : undefined}>
        <textarea id="diary-taught" className={areaClass} rows={3} maxLength={500} placeholder="Fractions: adding and subtracting" value={taught} onChange={(e) => setTaught(e.target.value)} />
      </Field>
      <Field id="diary-homework" label="Homework" optional>
        <textarea id="diary-homework" className={areaClass} rows={3} maxLength={500} placeholder="Page 42, sums 1 to 10" value={homework} onChange={(e) => setHomework(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}

/**
 * A class's diary of a day (docs/parent-teacher-flow.md phase 4): every subject of the class with what was taught and the homework (and
 * who wrote it); the teacher's own subjects (every one for the class teacher) have **Write**, a window; saved, a window says parents see it.
 */
export function DiaryPanel({ classId, sectionId }: { classId: string; sectionId: string | null }) {
  const today = todayInIndia();
  const [date, setDate] = useState(today);
  const res = useGetDiaryQuery({ classId, sectionId, date: date || today });
  const [writing, setWriting] = useState<Subject | null>(null);
  const result = useResultModal();
  const day = res.data?.data;

  return (
    <section aria-label="Diary" className="space-y-4">
      <div className="max-w-sm">
        <Field id="diary-day" label="Day">
          <DateBox
            id="diary-day"
            label="Day"
            value={date}
            onChange={setDate}
            max={today}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Yesterday", value: addDays(today, -1) },
            ]}
          />
        </Field>
      </div>
      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !day ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the diary."}</Card>
      ) : day.subjects.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">This class has no subjects yet</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {day.subjects.map((s) => (
            <article key={s.subjectId} aria-label={s.subjectName} className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-bold text-foreground">
                  <BookOpenText className="size-4 text-primary" aria-hidden />
                  {s.subjectName}
                </h3>
                {s.canWrite && (
                  <Button variant="outline" size="sm" aria-label={`Write ${s.subjectName}`} onClick={() => setWriting(s)}>
                    <NotebookPen className="size-4" aria-hidden />
                    {s.entry ? "Change" : "Write"}
                  </Button>
                )}
              </div>
              {s.entry ? (
                <dl className="space-y-1 text-sm">
                  {s.entry.taught && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Taught today</dt>
                      <dd className="text-foreground">{s.entry.taught}</dd>
                    </div>
                  )}
                  {s.entry.homework && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Homework</dt>
                      <dd className="text-foreground">{s.entry.homework}</dd>
                    </div>
                  )}
                  <p className="text-xs text-foreground-muted">by {s.entry.writtenBy.name}</p>
                </dl>
              ) : (
                <p className="text-sm text-foreground-muted">Nothing written yet</p>
              )}
            </article>
          ))}
        </div>
      )}
      {writing && day && (
        <WriteDialog
          day={day}
          subject={writing}
          classId={classId}
          sectionId={sectionId}
          onClose={() => setWriting(null)}
          onSaved={() => {
            setWriting(null);
            result.done("Diary saved", `${writing.subjectName} of ${day.label}: the parents of the class see it now.`);
          }}
        />
      )}
      {result.modal}
    </section>
  );
}
