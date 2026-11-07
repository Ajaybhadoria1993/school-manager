import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarDays, CalendarPlus, ClipboardList, Clock3, Pencil, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useDeleteExamMutation, useDeletePaperMutation, useGetExamQuery } from "../../redux/api/examsApi";
import type { ExamPaper } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { clock12, examDays, groupByDate, groupByTimetable } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { ExamDialog } from "../../components/exams/ExamDialog";
import { STATUS_LOOK, classesText, papersText } from "../../components/exams/look";
import { PapersDialog } from "../../components/exams/PapersDialog";
import { ClassGroupCard, DaySection } from "../../components/exams/PaperViews";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { AppModal } from "../../components/ui/AppModal";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useResultModal } from "../../components/ui/ResultModal";
import { Skeleton } from "../../components/ui/Skeleton";

type View = "class" | "date";
const VIEWS: { value: View; label: string }[] = [
  { value: "class", label: "By class" },
  { value: "date", label: "By date" },
];

/**
 * One exam (`/school/exams/:id`): what it is and whether it has come, and its timetable, either by class (the classes with the same dates
 * and times are one card) or by date (each day with the school's hours). "Add timetable" puts papers for some classes at once; a paper's
 * pencil and bin change or take it away; the exam itself is changed or deleted from the top. Every action ends in a window that says so.
 */
export default function ExamDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const res = useGetExamQuery(id);
  const [removePaper, { isLoading: removing }] = useDeletePaperMutation();
  const [removeExam, { isLoading: deleting }] = useDeleteExamMutation();
  const [view, setView] = useState<View>("class");
  const [adding, setAdding] = useState(false);
  const [editingPaper, setEditingPaper] = useState<ExamPaper | null>(null);
  const [changingExam, setChangingExam] = useState(false);
  const [askingPaper, setAskingPaper] = useState<ExamPaper | null>(null);
  const [askingExam, setAskingExam] = useState(false);
  const result = useResultModal();
  const exam = res.data?.data;
  const groups = useMemo(() => groupByTimetable(exam?.papers ?? []), [exam]);
  const days = useMemo(() => groupByDate(exam?.papers ?? []), [exam]);

  async function confirmRemovePaper() {
    if (!askingPaper || !exam) return;
    try {
      await removePaper({ examId: exam.id, paperId: askingPaper.id }).unwrap();
      result.done("Taken away", `${askingPaper.subject.name} is not in this timetable any more.`);
    } catch (err) {
      result.failed("Could not take it away", getApiError(err)?.message ?? "Please try again.");
    }
    setAskingPaper(null);
  }

  async function confirmRemoveExam() {
    if (!exam) return;
    try {
      await removeExam(exam.id).unwrap();
      navigate("/school/exams");
    } catch (err) {
      setAskingExam(false);
      result.failed("Could not delete it", getApiError(err)?.message ?? "Please try again.");
    }
  }

  const addTimetable = (
    <Button onClick={() => setAdding(true)}>
      <CalendarPlus className="size-4" aria-hidden />
      Add timetable
    </Button>
  );
  const actions = exam ? (
    <>
      {addTimetable}
      <Button variant="secondary" aria-label="Change exam" onClick={() => setChangingExam(true)}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button variant="secondary" aria-label="Delete exam" className="hover:text-danger" onClick={() => setAskingExam(true)}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </>
  ) : undefined;
  const look = exam ? STATUS_LOOK[exam.status] : null;

  return (
    <div className="space-y-6">
      <StudentFormHeader title={exam?.name ?? "Exam"} crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Test & Exam", to: "/school/exams" }]} actions={actions} />

      {res.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !exam ? (
        <Card className="space-y-3 px-5 py-8 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exam."}</p>
          <Link to="/school/exams" className="text-sm font-semibold text-primary hover:underline">
            Back to Test &amp; Exam
          </Link>
        </Card>
      ) : (
        <>
          <Card role="region" aria-label="About the exam" className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-primary-deep">{exam.typeLabel}</span>
              {look && <Badge tone={look.tone}>{look.label}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4 text-foreground-muted" aria-hidden />
                {examDays(exam.startDate, exam.endDate)}
              </span>
              {exam.full && exam.schoolHours && (
                <span className="flex items-center gap-2">
                  <Clock3 className="size-4 text-foreground-muted" aria-hidden />
                  School {clock12(exam.schoolHours.start)} to {clock12(exam.schoolHours.end)}
                </span>
              )}
              {exam.paperCount > 0 && (
                <span className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-foreground-muted" aria-hidden />
                  {papersText(exam.paperCount)}
                  <span className="text-foreground-muted"> · {classesText(exam.classCount)}</span>
                </span>
              )}
            </div>
            {exam.note && <p className="text-sm text-foreground">{exam.note}</p>}
          </Card>

          {exam.papers.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-5 py-14 text-center">
              <p className="text-base font-bold text-foreground">No timetable yet</p>
              {addTimetable}
            </Card>
          ) : (
            <>
              <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg bg-surface-muted p-1">
                {VIEWS.map((v) => (
                  <label
                    key={v.value}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center rounded-md px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/20",
                      view === v.value ? "bg-surface text-primary-deep shadow-sm" : "text-foreground-muted hover:text-foreground"
                    )}
                  >
                    <input type="radio" name="exam-view" className="sr-only" checked={view === v.value} onChange={() => setView(v.value)} />
                    {v.label}
                  </label>
                ))}
              </div>
              <div className="space-y-4">
                {view === "class"
                  ? groups.map((g) => <ClassGroupCard key={g.classes.map((c) => c.id).join()} group={g} onEdit={setEditingPaper} onRemove={setAskingPaper} />)
                  : days.map((d) => <DaySection key={d.date} date={d.date} papers={d.papers} exam={exam} onEdit={setEditingPaper} onRemove={setAskingPaper} />)}
              </div>
            </>
          )}
        </>
      )}

      {exam && adding && (
        <PapersDialog
          exam={exam}
          onClose={() => setAdding(false)}
          onDone={(title, message) => {
            setAdding(false);
            result.done(title, message);
          }}
        />
      )}
      {exam && editingPaper && (
        <PapersDialog
          exam={exam}
          paper={editingPaper}
          onClose={() => setEditingPaper(null)}
          onDone={(title, message) => {
            setEditingPaper(null);
            result.done(title, message);
          }}
        />
      )}
      {exam && changingExam && (
        <ExamDialog
          exam={exam}
          onClose={() => setChangingExam(false)}
          onSaved={(saved) => {
            setChangingExam(false);
            result.done("Saved", `${saved.name} is changed.`);
          }}
        />
      )}
      {askingPaper && (
        <AppModal
          title={`Take ${askingPaper.subject.name} away?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={removing}
          onClose={() => setAskingPaper(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAskingPaper(null)} isDisabled={removing}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing} onPress={() => void confirmRemovePaper()}>
                Take away
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">
            It goes from the timetable of {askingPaper.classes.map((c) => c.name).join(", ")}.
            {askingPaper.marked > 0 && ` The marks of ${askingPaper.marked} ${askingPaper.marked === 1 ? "child" : "children"} go with it.`}
          </p>
        </AppModal>
      )}
      {exam && askingExam && (
        <AppModal
          title={`Delete ${exam.name}?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={deleting}
          onClose={() => setAskingExam(false)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAskingExam(false)} isDisabled={deleting}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={deleting} onPress={() => void confirmRemoveExam()}>
                Delete
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">{exam.paperCount > 0 ? `Its ${exam.paperCount} ${exam.paperCount === 1 ? "paper goes" : "papers go"} with it.` : "It has no papers yet."}</p>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
