import { useState } from "react";
import { Copy, ListOrdered, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { MAX_CHAPTERS, MAX_CHAPTER_NAME } from "../../constants/classwork";
import { useLazyGetChapterSourcesQuery, useSaveSyllabusMutation } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { copyChapters } from "../../utils/teachingProgress";
import type { ApiError, ChapterDraft, DiaryDay } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

type Subject = DiaryDay["subjects"][number];

/** What the server said is wrong: the first field's own words (a day outside the session), else its message. */
function saidWrong(error: ApiError | null): string | null {
  if (!error) return null;
  const details = Array.isArray(error.details) ? (error.details as { message?: string }[]) : [];
  return details[0]?.message ?? error.message;
}

/** "Copy from": the other sections' and earlier years' lists of this subject, asked for only when wanted. */
function CopyFrom({ classId, sectionId, subjectId, onPick }: { classId: string; sectionId: string | null; subjectId: string; onPick: (chapters: { name: string; plannedOn: string | null }[]) => void }) {
  const [ask, res] = useLazyGetChapterSourcesQuery();
  const sources = res.data?.data;

  if (!sources) {
    return (
      <div className="space-y-2">
        <Button variant="ghost" size="sm" disabled={res.isFetching} onClick={() => void ask({ classId, sectionId, subjectId })}>
          <Copy className="size-4" aria-hidden />
          Copy from another section or year
        </Button>
        {res.isError && <ModalError message={getApiError(res.error)?.message ?? "Could not load the other chapters."} />}
      </div>
    );
  }
  if (sources.length === 0) return <p className="text-sm text-foreground-muted">No other chapters to copy</p>;
  return (
    <Field id="chapters-copy" label="Copy from">
      <Select
        id="chapters-copy"
        value=""
        placeholder="Choose a section or year"
        options={sources.map((s) => ({ value: s.id, label: s.label }))}
        onChange={(id) => {
          const found = sources.find((s) => s.id === id);
          if (found) onPick(found.chapters);
        }}
      />
    </Field>
  );
}

/**
 * The chapters of one subject in a class (docs/teaching-progress.md): say how many there are (or copy another section's or year's list),
 * name them (a name left empty is "Chapter 3"), give each the day it is to be finished by if the school plans one, tick the ones finished,
 * and one Save. The rows past the total are only hidden while the window is open, so typing "12" does not lose the names after the "1".
 * The server refuses to take off a chapter that was taught, and says which.
 */
export function ChaptersDialog({ subject, classId, sectionId, onClose, onSaved }: { subject: Subject; classId: string; sectionId: string | null; onClose: () => void; onSaved: () => void }) {
  const [save] = useSaveSyllabusMutation();
  const [rows, setRows] = useState<ChapterDraft[]>(() => subject.chapters.map((c, i) => ({ key: i, id: c.id, name: c.name, done: c.done, plannedOn: c.plannedOn ?? "" })));
  const [total, setTotal] = useState(subject.chapters.length > 0 ? String(subject.chapters.length) : "");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const count = Math.min(Math.max(Math.trunc(Number(total)) || 0, 0), MAX_CHAPTERS);
  const shown = rows.slice(0, count);
  const missing = total.trim() === "";

  function changeTotal(text: string) {
    const next = text === "" ? "" : String(Math.min(Math.max(Math.trunc(Number(text)) || 0, 0), MAX_CHAPTERS));
    setTotal(next);
    setRows((all) => {
      const wanted = Number(next);
      if (wanted <= all.length) return all;
      const from = all.reduce((top, r) => Math.max(top, r.key + 1), 0);
      return [...all, ...Array.from({ length: wanted - all.length }, (_, i) => ({ key: from + i, name: "", done: false, plannedOn: "" }))];
    });
  }

  const change = (key: number, patch: Partial<ChapterDraft>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function remove(key: number) {
    const left = shown.filter((r) => r.key !== key);
    setRows(left);
    setTotal(String(left.length));
  }

  function copy(chapters: { name: string; plannedOn: string | null }[]) {
    const next = copyChapters(shown, chapters);
    setRows(next);
    setTotal(String(next.length));
  }

  function send() {
    setTried(true);
    if (missing) return;
    void run(async () => {
      await save({
        classId,
        sectionId,
        subjectId: subject.subjectId,
        chapters: shown.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim() || `Chapter ${i + 1}`, done: r.done, plannedOn: r.plannedOn || null })),
      }).unwrap();
      onSaved();
    });
  }

  return (
    <AppModal
      title={`Chapters of ${subject.subjectName}`}
      icon={ListOrdered}
      size="lg"
      wide
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
      <Field id="chapters-total" label="Total chapters" error={tried && missing ? "Enter how many chapters there are" : undefined}>
        <Input id="chapters-total" type="number" inputMode="numeric" min={0} max={MAX_CHAPTERS} placeholder="12" value={total} onChange={(e) => changeTotal(e.target.value)} />
      </Field>
      <CopyFrom classId={classId} sectionId={sectionId} subjectId={subject.subjectId} onPick={copy} />
      {shown.length > 0 && (
        <div className="space-y-2">
          <div aria-hidden className="flex gap-2 pl-8 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            <span className="flex-1">Chapter</span>
            <span className="w-44 shrink-0">Finish by</span>
            <span className="w-[5.75rem] shrink-0" />
          </div>
          <ol className="space-y-2">
            {shown.map((r, i) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2">
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-foreground-muted">{i + 1}</span>
                <div className="min-w-[10rem] flex-1">
                  <Input aria-label={`Name of chapter ${i + 1}`} placeholder={`Chapter ${i + 1}`} maxLength={MAX_CHAPTER_NAME} value={r.name} onChange={(e) => change(r.key, { name: e.target.value })} />
                </div>
                <div className="w-44 shrink-0">
                  <span id={`chapter-${r.key}-by-label`} className="sr-only">
                    Finish by day of chapter {i + 1}
                  </span>
                  <DateBox id={`chapter-${r.key}-by`} label={`Finish by day of chapter ${i + 1}`} value={r.plannedOn} onChange={(plannedOn) => change(r.key, { plannedOn })} />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                  <input type="checkbox" aria-label={`Chapter ${i + 1} finished`} className="size-4 accent-primary" checked={r.done} onChange={(e) => change(r.key, { done: e.target.checked })} />
                  Done
                </label>
                <button
                  type="button"
                  aria-label={`Remove chapter ${i + 1}`}
                  onClick={() => remove(r.key)}
                  className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-foreground-muted hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <ModalError message={saidWrong(error)} />
    </AppModal>
  );
}
