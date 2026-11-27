import { useState } from "react";
import { BookOpenText, ListOrdered, NotebookPen } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetDiaryQuery, useSaveDiaryMutation } from "../../redux/api/classroomApi";
import { addDays } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { todayInIndia } from "../../utils/students";
import type { DiaryDay } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ChapterBar } from "../progress/ChapterBar";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { useResultModal } from "../ui/ResultModal";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { ChaptersDialog } from "./ChaptersDialog";

const areaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#94a3b8] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

type Subject = DiaryDay["subjects"][number];

/** The "no chapter" row of the Chapter list. */
const NO_CHAPTER = "none";
/** "2. Fractions", or nothing for a chapter that is not in the list. */
function chapterLine(subject: Subject, id: string | null | undefined): string | null {
  const at = subject.chapters.findIndex((c) => c.id === id);
  return at < 0 ? null : `${at + 1}. ${subject.chapters[at].name}`;
}

/** Write one subject's day: the chapter, what was taught, and the homework. */
function WriteDialog({ day, subject, classId, sectionId, onClose, onSaved }: { day: DiaryDay; subject: Subject; classId: string; sectionId: string | null; onClose: () => void; onSaved: () => void }) {
  const [save] = useSaveDiaryMutation();
  const [taught, setTaught] = useState(subject.entry?.taught ?? "");
  const [homework, setHomework] = useState(subject.entry?.homework ?? "");
  const [chapterId, setChapterId] = useState(subject.entry?.chapterId ?? "");
  const chapter = subject.chapters.find((c) => c.id === chapterId);
  // The tick as the teacher left it; until touched, whether the chosen chapter is finished already.
  const [ticked, setTicked] = useState<boolean | null>(null);
  const finished = ticked ?? !!chapter?.done;
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const empty = taught.trim() === "" && homework.trim() === "" && !chapter;

  function send() {
    setTried(true);
    if (empty) return;
    void run(async () => {
      // A subject with no chapters sends nothing about them.
      const about = subject.chapters.length === 0 ? {} : chapter ? { chapterId: chapter.id, chapterDone: finished } : { chapterId: null };
      await save({ classId, sectionId, date: day.date, subjectId: subject.subjectId, taught: taught.trim(), homework: homework.trim(), ...about }).unwrap();
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
      {subject.chapters.length > 0 && (
        <div className="space-y-2">
          <Field id="diary-chapter" label="Chapter" optional>
            <Select
              id="diary-chapter"
              value={chapterId}
              placeholder="Choose the chapter"
              options={[{ value: NO_CHAPTER, label: "No chapter" }, ...subject.chapters.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.name}` }))]}
              onChange={(v) => {
                setChapterId(v === NO_CHAPTER ? "" : v);
                setTicked(null);
              }}
            />
          </Field>
          {chapter && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" className="size-4 accent-primary" checked={finished} onChange={(e) => setTicked(e.target.checked)} />
              Chapter finished
            </label>
          )}
        </div>
      )}
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
  const [listing, setListing] = useState<Subject | null>(null);
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
              {(s.chapters.length > 0 || s.canWrite) && (
                <div className="flex items-center justify-between gap-3">
                  {s.chapters.length > 0 ? <ChapterBar done={s.chapters.filter((c) => c.done).length} total={s.chapters.length} words="chapters done" className="flex-1" /> : <span />}
                  {s.chapters.some((c) => c.late) && <Badge tone="danger">{s.chapters.filter((c) => c.late).length} late</Badge>}
                  {s.canWrite && (
                    <Button variant="ghost" size="sm" aria-label={s.chapters.length > 0 ? `Chapters of ${s.subjectName}` : `Add chapters of ${s.subjectName}`} onClick={() => setListing(s)}>
                      <ListOrdered className="size-4" aria-hidden />
                      {s.chapters.length > 0 ? "Chapters" : "Add chapters"}
                    </Button>
                  )}
                </div>
              )}
              {s.entry ? (
                <dl className="space-y-1 text-sm">
                  {chapterLine(s, s.entry.chapterId) && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Chapter</dt>
                      <dd className="font-semibold text-foreground">{chapterLine(s, s.entry.chapterId)}</dd>
                    </div>
                  )}
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
      {listing && day && (
        <ChaptersDialog
          subject={listing}
          classId={classId}
          sectionId={sectionId}
          onClose={() => setListing(null)}
          onSaved={() => {
            setListing(null);
            result.done("Chapters saved", `${listing.subjectName} of ${day.label}: the school and the parents see how far it is.`);
          }}
        />
      )}
      {result.modal}
    </section>
  );
}
