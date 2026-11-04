import { useEffect, useState } from "react";
import { ClipboardCheck, ClipboardList, Plus, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useAddTestMutation, useGetTestQuery, useGetTestsQuery, useRemoveTestMutation, useSaveMarksMutation } from "../../redux/api/classroomApi";
import { addDays, shortDay } from "../../utils/calendar";
import { getApiError } from "../../utils/apiErrors";
import { onlyDigits } from "../../utils/teachers";
import { todayInIndia } from "../../utils/students";
import type { ClassTestItem } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useResultModal } from "../ui/ResultModal";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

const fourDigits = onlyDigits(4);
const markText = (v: string) => v.replace(/[^\d.]/g, "").slice(0, 6);

/** Add a test: subject (the teacher's own), the day (Today / Tomorrow), the topic, out of how many marks. */
function AddTestDialog({ classId, sectionId, subjects, onClose, onAdded }: { classId: string; sectionId: string | null; subjects: { id: string; name: string }[]; onClose: () => void; onAdded: (t: ClassTestItem) => void }) {
  const [add] = useAddTestMutation();
  const today = todayInIndia();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const out = Number(maxMarks);
  const problems = {
    subject: subjectId === "" ? "Choose the subject" : undefined,
    date: date === "" ? "Choose the test day" : undefined,
    topic: topic.trim() === "" ? "Write the topic" : undefined,
    maxMarks: !Number.isInteger(out) || out < 1 || out > 1000 ? "1 to 1000" : undefined,
  };
  const shown = (k: keyof typeof problems) => (tried ? problems[k] : undefined);

  function send() {
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    void run(async () => {
      const made = (await add({ classId, sectionId, subjectId, date, topic: topic.trim(), maxMarks: out }).unwrap()).data;
      onAdded(made);
    });
  }

  return (
    <AppModal
      title="Add a test"
      icon={ClipboardList}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} onPress={send}>
            Add test
          </HeroButton>
        </>
      }
    >
      {subjects.length > 1 && (
        <Field id="test-subject" label="Subject" error={shown("subject")}>
          <Select id="test-subject" value={subjectId} options={subjects.map((s) => ({ value: s.id, label: s.name }))} onChange={setSubjectId} />
        </Field>
      )}
      <Field id="test-day" label="Test day" error={shown("date")}>
        <DateBox
          id="test-day"
          label="Test day"
          value={date}
          onChange={setDate}
          invalid={!!shown("date")}
          shortcuts={[
            { label: "Today", value: today },
            { label: "Tomorrow", value: addDays(today, 1) },
            { label: "In a week", value: addDays(today, 7) },
          ]}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field id="test-topic" label="Topic" error={shown("topic")}>
          <Input id="test-topic" value={topic} maxLength={200} placeholder="Fractions" aria-invalid={shown("topic") ? true : undefined} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field id="test-max" label="Out of" error={shown("maxMarks")}>
          <Input id="test-max" inputMode="numeric" value={maxMarks} placeholder="20" aria-invalid={shown("maxMarks") ? true : undefined} onChange={(e) => setMaxMarks(fourDigits(e.target.value))} />
        </Field>
      </div>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}

/** Enter marks: each child's marks out of the test's, or a tick for absent; one Save. */
function MarksDialog({ testId, onClose, onSaved }: { testId: string; onClose: () => void; onSaved: (average: number | null) => void }) {
  const res = useGetTestQuery(testId);
  const [save] = useSaveMarksMutation();
  const test = res.data?.data;
  const [marks, setMarks] = useState<Record<string, { marks: string; absent: boolean }>>({});
  const { busy, error, run } = useSave(() => undefined);
  useEffect(() => {
    if (test) setMarks(Object.fromEntries(test.students.map((s) => [s.id, { marks: s.marks === null ? "" : String(s.marks), absent: s.absent }])));
  }, [test]);
  const over = test ? Object.values(marks).some((m) => !m.absent && m.marks !== "" && Number(m.marks) > test.maxMarks) : false;

  function send() {
    if (!test || over) return;
    void run(async () => {
      const saved = (
        await save({
          id: testId,
          marks: test.students.map((s) => {
            const m = marks[s.id] ?? { marks: "", absent: false };
            return { studentId: s.id, marks: m.absent || m.marks === "" ? null : Number(m.marks), absent: m.absent };
          }),
        }).unwrap()
      ).data;
      onSaved(saved.average);
    });
  }

  return (
    <AppModal
      title={test ? `Marks of ${test.subjectName}: ${test.topic}` : "Marks"}
      icon={ClipboardCheck}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} isDisabled={!test} onPress={send}>
            Save marks
          </HeroButton>
        </>
      }
    >
      {!test ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <>
          <p className="text-sm text-foreground-muted">Out of {test.maxMarks}</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {test.students.map((s) => {
              const m = marks[s.id] ?? { marks: "", absent: false };
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="flex items-center gap-3">
                    <input
                      aria-label={`Marks of ${s.name}`}
                      inputMode="decimal"
                      disabled={m.absent}
                      value={m.marks}
                      onChange={(e) => setMarks((all) => ({ ...all, [s.id]: { ...m, marks: markText(e.target.value) } }))}
                      className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-right text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted"
                    />
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-foreground-muted">
                      <input type="checkbox" aria-label={`${s.name} was absent`} checked={m.absent} onChange={(e) => setMarks((all) => ({ ...all, [s.id]: { marks: "", absent: e.target.checked } }))} className="size-4 accent-primary" />
                      Absent
                    </label>
                  </span>
                </li>
              );
            })}
          </ul>
          {over && <p className="text-sm font-semibold text-danger">Marks are out of {test.maxMarks}</p>}
          <ModalError message={error?.message ?? null} />
        </>
      )}
    </AppModal>
  );
}

/**
 * A class's tests (docs/parent-teacher-flow.md phase 5): **Add a test** (a window), the coming ones (parents see them), and the held ones
 * with **Enter marks** (a window; saved, a window gives the average). A test can be taken away (after asking). Each ends in a window.
 */
export function TestsPanel({ classId, sectionId, subjects }: { classId: string; sectionId: string | null; subjects: { id: string; name: string }[] }) {
  const res = useGetTestsQuery({ classId, sectionId });
  const [remove, { isLoading: removing }] = useRemoveTestMutation();
  const [adding, setAdding] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [asking, setAsking] = useState<ClassTestItem | null>(null);
  const result = useResultModal();
  const tests = res.data?.data.items;
  const today = todayInIndia();

  async function confirmRemove() {
    if (!asking) return;
    try {
      await remove(asking.id).unwrap();
      result.done("Test taken away", `${asking.subjectName}: ${asking.topic} is not on the list any more.`);
    } catch (err) {
      result.failed("Could not take it away", getApiError(err)?.message ?? "Please try again.");
    }
    setAsking(null);
  }

  return (
    <section aria-label="Tests" className="space-y-4">
      {subjects.length > 0 && (
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add a test
        </Button>
      )}
      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !tests ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the tests."}</Card>
      ) : tests.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No test yet</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tests.map((t) => (
            <article key={t.id} aria-label={`${t.subjectName}: ${t.topic}`} className="space-y-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-foreground">
                    {t.subjectName}: {t.topic}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {shortDay(t.date)} · out of {t.maxMarks}
                  </p>
                </div>
                {t.date > today ? <Badge tone="info">Coming</Badge> : t.marked > 0 ? <Badge tone="success">{t.average === null ? "Marks in" : `Average ${t.average}%`}</Badge> : <Badge tone="warning">Marks due</Badge>}
              </div>
              {t.canWrite && (
                <div className="flex gap-2">
                  {t.date <= today && (
                    <Button size="sm" variant={t.marked > 0 ? "outline" : "primary"} onClick={() => setMarking(t.id)}>
                      <ClipboardCheck className="size-4" aria-hidden />
                      {t.marked > 0 ? "Change marks" : "Enter marks"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`Take away ${t.subjectName}: ${t.topic}`} className="hover:text-danger" onClick={() => setAsking(t)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {adding && (
        <AddTestDialog
          classId={classId}
          sectionId={sectionId}
          subjects={subjects}
          onClose={() => setAdding(false)}
          onAdded={(t) => {
            setAdding(false);
            result.done("Test added", `${t.subjectName}: ${t.topic} on ${shortDay(t.date)}. Parents of the class see it coming.`);
          }}
        />
      )}
      {marking && (
        <MarksDialog
          testId={marking}
          onClose={() => setMarking(null)}
          onSaved={(average) => {
            setMarking(null);
            result.done("Marks saved", average === null ? "Parents see their child's marks." : `The class average is ${average}%. Parents see their child's marks.`);
          }}
        />
      )}
      {asking && (
        <AppModal
          title={`Take away ${asking.subjectName}: ${asking.topic}?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={removing}
          onClose={() => setAsking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAsking(null)} isDisabled={removing}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing} onPress={() => void confirmRemove()}>
                Take away
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">Its marks go with it.</p>
        </AppModal>
      )}
      {result.modal}
    </section>
  );
}
