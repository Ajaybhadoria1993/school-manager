import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarDays, ClipboardList, Clock3, Pencil, Trash2, UsersRound } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useDeleteExamMutation, useGetExamQuery } from "../../redux/api/examsApi";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { clock12, examDays } from "../../utils/exams";
import { ExamDialog } from "../../components/exams/ExamDialog";
import { ExamTimetable } from "../../components/exams/ExamTimetable";
import { STATUS_LOOK, classesText, papersText } from "../../components/exams/look";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { AppModal } from "../../components/ui/AppModal";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useResultModal } from "../../components/ui/ResultModal";
import { Skeleton } from "../../components/ui/Skeleton";

/**
 * One exam (`/school/exams/:id`): what it is, whom it is for and whether it has come, and its timetable (the same as the Exam Time Table tab:
 * whom it is for and which classes have one yet, Add timetable, by class or by date, a paper's pencil and bin). The exam itself is changed or
 * deleted from the top. Every action ends in a window that says so.
 */
export default function ExamDetailPage() {
  // A year that is over is only looked at: the exam and its timetable are not changed (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const res = useGetExamQuery(id);
  const [removeExam, { isLoading: deleting }] = useDeleteExamMutation();
  const [changingExam, setChangingExam] = useState(false);
  const [askingExam, setAskingExam] = useState(false);
  const result = useResultModal();
  const exam = res.data?.data;

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

  const actions =
    exam && !readOnly ? (
      <>
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
      <StudentFormHeader title={exam?.name ?? "Exam"} crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Exam", to: "/school/exams" }]} actions={actions} />

      {res.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !exam ? (
        <Card className="space-y-3 px-5 py-8 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the exam."}</p>
          <Link to="/school/exams" className="text-sm font-semibold text-primary hover:underline">
            Back to Exam
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
              {exam.audience && (
                <span className="flex items-center gap-2">
                  <UsersRound className="size-4 text-foreground-muted" aria-hidden />
                  {exam.audience.label}
                </span>
              )}
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

          <ExamTimetable key={exam.id} exam={exam} />
        </>
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
