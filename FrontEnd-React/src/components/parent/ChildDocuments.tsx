import { useState } from "react";
import { FileText, IdCard as IdCardIcon, Ticket } from "lucide-react";
import { useGetChildAdmitCardQuery, useGetChildExamsQuery, useGetChildIdCardQuery, useGetChildReportCardQuery } from "../../redux/api/parentApi";
import { getApiError } from "../../utils/apiErrors";
import { AdmitCardView } from "../documents/AdmitCardView";
import { DocumentDialog } from "../documents/DocumentDialog";
import { IdCardView } from "../documents/IdCardView";
import { ReportCardView } from "../documents/ReportCardView";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

function IdCardDialog({ childId, onClose }: { childId: string; onClose: () => void }) {
  const res = useGetChildIdCardQuery(childId);
  return (
    <DocumentDialog title="ID card" onClose={onClose}>
      {res.data ? <IdCardView card={res.data.data} /> : res.error ? <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the ID card."}</p> : <Skeleton className="h-40 rounded-xl" />}
    </DocumentDialog>
  );
}

function ExamDocumentDialog({ childId, kind, onClose }: { childId: string; kind: "report" | "admit"; onClose: () => void }) {
  // The exams of the child's class: the same read the Exams section makes (one request).
  const list = useGetChildExamsQuery(childId);
  const exams = list.data?.data.items ?? [];
  const [chosen, setChosen] = useState("");
  const examId = chosen || exams[0]?.id || "";
  const report = useGetChildReportCardQuery({ id: childId, examId }, { skip: kind !== "report" || examId === "" });
  const admit = useGetChildAdmitCardQuery({ id: childId, examId }, { skip: kind !== "admit" || examId === "" });
  const res = kind === "report" ? report : admit;
  return (
    <DocumentDialog
      title={kind === "report" ? "Report card" : "Admit card"}
      onClose={onClose}
      extra={
        exams.length > 1 ? (
          <div className="max-w-xs">
            <Select id="child-report-exam" aria-label="Exam" options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={setChosen} />
          </div>
        ) : undefined
      }
    >
      {list.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : exams.length === 0 ? (
        <p className="text-sm text-foreground-secondary">There is no exam yet, so there is no {kind === "report" ? "report" : "admit"} card.</p>
      ) : res.data ? (
        kind === "report" ? <ReportCardView card={report.data!.data} /> : <AdmitCardView card={admit.data!.data} />
      ) : res.error ? (
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the report card."}</p>
      ) : (
        <Skeleton className="h-64 rounded-xl" />
      )}
    </DocumentDialog>
  );
}

/** On the child's page: their ID card and the report card of an exam, to read and print (or save as a PDF from the print window). */
export function ChildDocuments({ childId }: { childId: string }) {
  const [open, setOpen] = useState<"id" | "report" | "admit" | null>(null);
  return (
    <section aria-label="Documents" className="space-y-3">
      <h2 className="text-section-heading flex items-center gap-2">
        <FileText className="size-5 text-primary" aria-hidden />
        Documents
      </h2>
      <Card className="flex flex-wrap items-center gap-3 p-5">
        <Button variant="outline" onClick={() => setOpen("id")}>
          <IdCardIcon className="size-4" aria-hidden />
          ID card
        </Button>
        <Button variant="outline" onClick={() => setOpen("report")}>
          <FileText className="size-4" aria-hidden />
          Report card
        </Button>
        <Button variant="outline" onClick={() => setOpen("admit")}>
          <Ticket className="size-4" aria-hidden />
          Admit card
        </Button>
        <p className="text-sm text-foreground-muted">Open a document to read it and print it.</p>
      </Card>
      {open === "id" && <IdCardDialog childId={childId} onClose={() => setOpen(null)} />}
      {open === "report" && <ExamDocumentDialog childId={childId} kind="report" onClose={() => setOpen(null)} />}
      {open === "admit" && <ExamDocumentDialog childId={childId} kind="admit" onClose={() => setOpen(null)} />}
    </section>
  );
}
