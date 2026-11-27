import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { FileBadge, FileText, IdCard as IdCardIcon, Printer, Settings2, Ticket } from "lucide-react";
import { AdmitCardView } from "../../components/documents/AdmitCardView";
import { CertificatesPanel } from "../../components/documents/CertificatesPanel";
import { GradingPanel } from "../../components/documents/GradingPanel";
import { IdCardView } from "../../components/documents/IdCardView";
import { PrintPortal } from "../../components/documents/PrintPortal";
import { ReportCardView } from "../../components/documents/ReportCardView";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useGetClassAdmitCardsQuery, useGetClassIdCardsQuery, useGetClassReportCardsQuery, useGetDocumentOptionsQuery } from "../../redux/api/documentsApi";
import { getApiError } from "../../utils/apiErrors";
import { countWords } from "../../utils/fees";

type Kind = "id-cards" | "report-cards" | "admit-cards" | "certificates" | "grading";
const KINDS: { value: Kind; label: string; icon: typeof FileText }[] = [
  { value: "id-cards", label: "ID cards", icon: IdCardIcon },
  { value: "report-cards", label: "Report cards", icon: FileText },
  { value: "admit-cards", label: "Admit cards", icon: Ticket },
  { value: "certificates", label: "Certificates", icon: FileBadge },
  { value: "grading", label: "Grading", icon: Settings2 },
];
const ALL = "";
/** The kinds that are made for a class (or a section) and printed together. */
const CLASS_KINDS: Kind[] = ["id-cards", "report-cards", "admit-cards"];
const NAMES: Record<string, [string, string]> = { "id-cards": ["ID card", "ID cards"], "report-cards": ["report card", "Report cards"], "admit-cards": ["admit card", "Admit cards"] };

/**
 * Documents (`/documents`): the ID cards, exam report cards and admit cards of a whole class (or one of its sections), shown on screen and printed together
 * (a report card or an admit card to a page, ID cards in rows); the register of certificates the school has issued; and how the school grades. One
 * student's own are on the student's page. The tab, class, section and exam are in the address, so a page can be opened ready.
 */
export default function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("kind");
  const kind: Kind = KINDS.some((k) => k.value === asked) ? (asked as Kind) : "id-cards";
  const forClass = CLASS_KINDS.includes(kind);
  const needsExam = kind === "report-cards" || kind === "admit-cards";
  const classId = params.get("classId") ?? "";
  const sectionId = params.get("sectionId") ?? ALL;
  const examParam = params.get("examId") ?? "";
  const [printing, setPrinting] = useState(false);

  const options = useGetDocumentOptionsQuery();
  const classes = options.data?.data.classes ?? [];
  const exams = options.data?.data.exams ?? [];
  const klass = classes.find((c) => c.id === classId);
  const examId = examParam || exams[0]?.id || "";
  const section = sectionId || undefined;

  const cards = useGetClassIdCardsQuery({ classId, sectionId: section }, { skip: kind !== "id-cards" || classId === "" });
  const reports = useGetClassReportCardsQuery({ classId, examId, sectionId: section }, { skip: kind !== "report-cards" || classId === "" || examId === "" });
  const admits = useGetClassAdmitCardsQuery({ classId, examId, sectionId: section }, { skip: kind !== "admit-cards" || classId === "" || examId === "" });
  const active = kind === "id-cards" ? cards : kind === "report-cards" ? reports : admits;
  const count = !forClass ? 0 : kind === "id-cards" ? (cards.data?.data.items.length ?? 0) : kind === "report-cards" ? (reports.data?.data.items.length ?? 0) : (admits.data?.data.items.length ?? 0);

  const set = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === "") merged.delete(k);
      else merged.set(k, v);
    }
    setParams(merged, { replace: true });
  };
  const sectionOptions = useMemo(() => [{ value: ALL, label: "All sections" }, ...(klass?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))], [klass]);

  const sheet =
    kind === "id-cards"
      ? (cards.data?.data.items ?? []).map((c) => <IdCardView key={c.student.id} card={c} />)
      : kind === "report-cards"
        ? (reports.data?.data.items ?? []).map((c) => (
            <div key={c.student.id} className="print-page">
              <ReportCardView card={c} />
            </div>
          ))
        : (admits.data?.data.items ?? []).map((c) => (
            <div key={c.student.id} className="print-page">
              <AdmitCardView card={c} />
            </div>
          ));

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Documents"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        subtitle="ID cards, report cards, admit cards and certificates, to print"
        actions={
          count > 0 ? (
            <Button onClick={() => setPrinting(true)}>
              <Printer className="size-4" aria-hidden />
              Print {countWords(count, NAMES[kind][0])}
            </Button>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="Kind of document" className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
        {KINDS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            className={
              kind === value
                ? "inline-flex h-9 items-center gap-2 rounded-lg bg-primary-soft px-3.5 text-sm font-semibold text-primary-deep"
                : "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-foreground-muted hover:text-foreground"
            }
            onClick={() => set({ kind: value })}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {kind === "certificates" ? (
        <CertificatesPanel />
      ) : kind === "grading" ? (
        <GradingPanel />
      ) : (
        <>
          <Card className="grid gap-4 p-4 sm:grid-cols-3">
            <Field id="doc-class" label="Class">
              <Select id="doc-class" options={classes.map((c) => ({ value: c.id, label: c.name }))} value={classId} onChange={(v) => set({ classId: v, sectionId: "" })} placeholder="Choose the class" />
            </Field>
            <Field id="doc-section" label="Section" optional>
              <Select id="doc-section" options={sectionOptions} value={sectionId} onChange={(v) => set({ sectionId: v })} disabled={!klass || klass.sections.length === 0} />
            </Field>
            {needsExam && (
              <Field id="doc-exam" label="Exam">
                <Select id="doc-exam" options={exams.map((e) => ({ value: e.id, label: e.name }))} value={examId} onChange={(v) => set({ examId: v })} placeholder={exams.length === 0 ? "No exam yet" : "Choose the exam"} />
              </Field>
            )}
          </Card>

          {classId === "" ? (
            <StudentsNotice icon={KINDS.find((k) => k.value === kind)!.icon} tone="primary" title="Choose a class to see its documents" />
          ) : needsExam && exams.length === 0 && !options.isLoading ? (
            <StudentsNotice icon={FileText} tone="warning" title="There is no exam in this session yet">
              Make the exam in Exam{kind === "report-cards" ? " and enter its marks" : ""}, then its {kind === "report-cards" ? "report" : "admit"} cards are made here.
            </StudentsNotice>
          ) : active.isLoading || active.isFetching ? (
            <Skeleton className="h-64 rounded-2xl" />
          ) : active.error ? (
            <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(active.error)?.message ?? "Could not make the documents."}</Card>
          ) : count === 0 ? (
            <StudentsNotice icon={IdCardIcon} tone="primary" title="No student in this class" />
          ) : (
            <section aria-label={NAMES[kind][1]} className="space-y-4 overflow-x-auto">
              {sheet}
            </section>
          )}
        </>
      )}

      {printing && <PrintPortal onDone={() => setPrinting(false)}>{sheet}</PrintPortal>}
    </div>
  );
}
