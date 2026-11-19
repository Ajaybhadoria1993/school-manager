import { useState } from "react";
import { FileBadge, FileText, IdCard as IdCardIcon, Ticket } from "lucide-react";
import { useCan } from "../../../hooks/useCan";
import { useGetAdmitCardQuery, useGetDocumentOptionsQuery, useGetIdCardQuery, useGetReportCardQuery } from "../../../redux/api/documentsApi";
import type { StudentDetail } from "../../../types";
import { getApiError } from "../../../utils/apiErrors";
import { AdmitCardView } from "../../documents/AdmitCardView";
import { CertificateDialog, IssueCertificateDialog } from "../../documents/CertificateDialogs";
import { DocumentDialog } from "../../documents/DocumentDialog";
import { IdCardView } from "../../documents/IdCardView";
import { PhotoField } from "../../documents/PhotoField";
import { RemarkBox } from "../../documents/RemarkBox";
import { ReportCardView } from "../../documents/ReportCardView";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";

function IdCardDialog({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const res = useGetIdCardQuery(studentId);
  return (
    <DocumentDialog title="ID card" onClose={onClose}>
      {res.data ? <IdCardView card={res.data.data} /> : res.error ? <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the ID card."}</p> : <Skeleton className="h-40 rounded-xl" />}
    </DocumentDialog>
  );
}

/** A report card or an admit card: the exam is the latest to start with and the person may choose another. */
function ExamDocumentDialog({ studentId, kind, mayRemark, onClose }: { studentId: string; kind: "report" | "admit"; mayRemark: boolean; onClose: () => void }) {
  const options = useGetDocumentOptionsQuery();
  const exams = options.data?.data.exams ?? [];
  const [chosen, setChosen] = useState("");
  const examId = chosen || exams[0]?.id || "";
  const report = useGetReportCardQuery({ studentId, examId }, { skip: kind !== "report" || examId === "" });
  const admit = useGetAdmitCardQuery({ studentId, examId }, { skip: kind !== "admit" || examId === "" });
  const res = kind === "report" ? report : admit;
  const card = res.data?.data;
  return (
    <DocumentDialog
      title={kind === "report" ? "Report card" : "Admit card"}
      onClose={onClose}
      extra={
        <>
          {exams.length > 1 && (
            <div className="max-w-xs">
              <Select id="doc-exam-pick" aria-label="Exam" options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={setChosen} />
            </div>
          )}
          {kind === "report" && mayRemark && report.data && <RemarkBox key={`${examId}-${report.data.data.remark ?? ""}`} studentId={studentId} examId={examId} saved={report.data.data.remark} />}
        </>
      }
    >
      {options.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : exams.length === 0 ? (
        <p className="text-sm text-foreground-secondary">The school has no exam in this session yet, so there is nothing to make.</p>
      ) : card ? (
        kind === "report" ? (
          <ReportCardView card={report.data!.data} />
        ) : (
          <AdmitCardView card={admit.data!.data} />
        )
      ) : res.error ? (
        <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not make the document."}</p>
      ) : (
        <Skeleton className="h-64 rounded-xl" />
      )}
    </DocumentDialog>
  );
}

/**
 * On a student's page: their photo (for the ID card), and their ID card, exam report card (with the class teacher's remark), admit card and certificates
 * to read, print and issue. The photo is changed by a person who may edit students; the documents are for a person the school allowed to print them, and
 * remarks and certificates for one allowed to manage them (Permissions > Documents). A student who has left has only the transfer certificate.
 */
export function StudentDocumentsCard({ student, readOnlyYear }: { student: StudentDetail; readOnlyYear: boolean }) {
  const can = useCan();
  const left = student.status === "inactive";
  const mayPrint = can("documents.view");
  const mayManage = can("documents.manage") && !readOnlyYear;
  const mayPhoto = can("students.edit") && !readOnlyYear && !left;
  const [open, setOpen] = useState<"id" | "report" | "admit" | "issue" | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  if (left ? !mayManage : !mayPrint && !mayPhoto) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4" aria-label="Photo and documents" role="group">
      {!left && <PhotoField studentId={student.id} name={student.name} canChange={mayPhoto} />}
      <div className="flex flex-wrap items-center gap-2">
        {!left && mayPrint && (
          <>
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
          </>
        )}
        {mayManage && (
          <Button variant="outline" onClick={() => setOpen("issue")}>
            <FileBadge className="size-4" aria-hidden />
            {left ? "Transfer certificate" : "Certificate"}
          </Button>
        )}
      </div>
      {open === "id" && <IdCardDialog studentId={student.id} onClose={() => setOpen(null)} />}
      {open === "report" && <ExamDocumentDialog studentId={student.id} kind="report" mayRemark={mayManage} onClose={() => setOpen(null)} />}
      {open === "admit" && <ExamDocumentDialog studentId={student.id} kind="admit" mayRemark={false} onClose={() => setOpen(null)} />}
      {open === "issue" && (
        <IssueCertificateDialog
          student={{ id: student.id, name: student.name, left }}
          onClose={() => setOpen(null)}
          onIssued={(c) => {
            setOpen(null);
            setIssued(c.id);
          }}
        />
      )}
      {issued && <CertificateDialog id={issued} onClose={() => setIssued(null)} />}
    </Card>
  );
}
