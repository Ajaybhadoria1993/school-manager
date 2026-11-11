import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCheck, CircleAlert, ClipboardList, Hourglass, Rocket, Save, Send, Undo2, X } from "lucide-react";
import { STUDENT_APPROVERS } from "../../constants/students";
import { useGetAcademicYearsQuery } from "../../redux/api/academicsApi";
import {
  useCancelPromotionMutation,
  useGetPromotionQuery,
  useStartPromotionMutation,
  useSubmitPromotionMutation,
  useUpdatePromotionMutation,
} from "../../redux/api/studentsApi";
import { useAppSelector } from "../../redux/hooks";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { plural } from "../../utils/academics";
import { istDay } from "../../utils/students";
import type { Promotion, PromotionChange, PromotionEntry, PromotionOutcome } from "../../types";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { ApproveDialog, RejectDialog } from "../../components/students/promotion/PromotionDialogs";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const OUTCOMES: { value: PromotionOutcome; label: "Promote" | "Stay" | "Leave" }[] = [
  { value: "promote", label: "Promote" },
  { value: "retain", label: "Stay" },
  { value: "leave", label: "Leave" },
];
const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-surface-muted text-foreground-muted" },
  submitted: { label: "Waiting for approval", className: "bg-warning-soft text-warning" },
  approved: { label: "Approved", className: "bg-success-soft text-success" },
};

/**
 * Manage school > Promotion (`/school/promotion`): who goes to which class when the running year ends. The list is made for the year that
 * waits with a suggestion for every student (the next class, the same section; leave from the last class), changed here (each student
 * promotes, stays or leaves; a class can be sent to another class as a whole), saved, and sent for approval. Only the school admin
 * approves (or sends it back with a note); approval gives each student who goes on a place in the next year. Changes are kept in the
 * page until Save changes (one request with only what changed); the list is one piece, so every action answers with the whole list.
 */
export default function PromotionPage() {
  const role = useAppSelector((state) => state.auth.user?.role);
  const yearsRes = useGetAcademicYearsQuery();
  const years = yearsRes.data?.data ?? [];
  const next = years.find((y) => y.status === "pending");
  const running = years.find((y) => y.status === "active");
  const promotionRes = useGetPromotionQuery(next?.id ?? "", { skip: !next });
  const [start, { isLoading: starting }] = useStartPromotionMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const promotion = promotionRes.data?.data ?? null;

  const title = promotion ? `Promote ${promotion.fromYear.name} to ${promotion.toYear.name}` : "Promotion";

  return (
    <div className="space-y-6">
      <StudentFormHeader title={title} subtitle="Who goes to which class when the year ends. The school admin approves the list." crumbs={[{ label: "Academic years", to: "/school/academic-years" }]} />

      {yearsRes.isLoading || (next && promotionRes.isLoading) ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (yearsRes.error && !yearsRes.data) || (promotionRes.error && !promotionRes.data) ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(yearsRes.error ?? promotionRes.error)?.message ?? "Could not load the promotion."}</p>
          <Button
            variant="outline"
            onClick={() => {
              void yearsRes.refetch();
              void promotionRes.refetch();
            }}
          >
            Try again
          </Button>
        </Card>
      ) : !next || !running ? (
        <StudentsNotice
          icon={Rocket}
          tone="primary"
          title="There is no next year yet"
          actions={
            <Link to="/school/academic-years" className={outlineLink}>
              Make the next year
            </Link>
          }
        >
          <p>Students are promoted into the next academic year. Make it first (its sections are copied from the running year), then come back here.</p>
        </StudentsNotice>
      ) : !promotion ? (
        <StudentsNotice
          icon={ClipboardList}
          tone="primary"
          title={`Promote the students of ${running.name}`}
          actions={
            <Button
              loading={starting}
              onClick={async () => {
                setProblem(null);
                try {
                  await start({ toAcademicYearId: next.id }).unwrap();
                } catch (err) {
                  setProblem(getApiError(err)?.message ?? "Could not make the list. Please try again.");
                }
              }}
            >
              Make the promotion list
            </Button>
          }
        >
          <p>
            Every student of {running.name} gets a suggestion: the next class, in the same section when {next.name} has it. You change what is not right, then send
            the list to the school admin, who approves it. Nothing happens to any student until it is approved.
          </p>
          {problem && <p className="font-semibold text-danger">{problem}</p>}
        </StudentsNotice>
      ) : (
        <PromotionList key={promotion.id} promotion={promotion} role={role} />
      )}
    </div>
  );
}

function PromotionList({ promotion, role }: { promotion: Promotion; role: string | undefined }) {
  const { push } = useToast();
  const mayApprove = !!role && (STUDENT_APPROVERS as readonly string[]).includes(role);
  const [update, { isLoading: saving }] = useUpdatePromotionMutation();
  const [submit, { isLoading: sending }] = useSubmitPromotionMutation();
  const [cancel] = useCancelPromotionMutation();
  const [edits, setEdits] = useState<Record<string, PromotionChange>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | "cancel" | null>(null);

  const editable = promotion.status === "draft";
  const changed = Object.keys(edits).length;
  const targetName = (classId: string) => promotion.targets.find((t) => t.classId === classId)?.className ?? "";

  /** What an entry is, with the person's unsaved change over it. */
  const outcomeOf = (e: PromotionEntry): PromotionOutcome => edits[e.studentId]?.outcome ?? e.outcome;
  const counts = promotion.entries.reduce(
    (sum, e) => {
      sum[outcomeOf(e)] += 1;
      return sum;
    },
    { promote: 0, retain: 0, leave: 0 }
  );

  const groups = useMemo(() => {
    const byClass = new Map<string, { classId: string; className: string; entries: PromotionEntry[] }>();
    for (const e of promotion.entries) {
      const group = byClass.get(e.from.classId) ?? { classId: e.from.classId, className: e.from.className, entries: [] };
      group.entries.push(e);
      byClass.set(e.from.classId, group);
    }
    return [...byClass.values()];
  }, [promotion.entries]);

  /** Records a change for a student; a change that puts the student back as saved is no change. */
  function change(list: { entry: PromotionEntry; change: PromotionChange }[]) {
    setEdits((previous) => {
      const next = { ...previous };
      for (const { entry, change: c } of list) {
        const same = c.outcome === entry.outcome && (c.outcome !== "promote" || !c.classId || c.classId === entry.to?.classId);
        if (same) delete next[entry.studentId];
        else next[entry.studentId] = c;
      }
      return next;
    });
  }

  const placeText = (e: PromotionEntry) => {
    const c = edits[e.studentId];
    const outcome = outcomeOf(e);
    if (outcome === "leave") return "Leaves the school";
    if (outcome === "retain") return `Stays in ${e.from.className}`;
    if (c) return c.classId ? `${targetName(c.classId)} (section set on save)` : "The next class (set on save)";
    return e.to ? `${e.to.className}${e.to.sectionName ? ` · ${e.to.sectionName}` : ""}` : "Not chosen";
  };

  async function save() {
    setProblem(null);
    try {
      const res = await update({ id: promotion.id, entries: Object.values(edits) }).unwrap();
      setEdits({});
      push("success", res.message ?? "Saved");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not save the changes. Please try again.");
    }
  }

  async function send() {
    setProblem(null);
    try {
      const res = await submit(promotion.id).unwrap();
      push("success", res.message ?? "Sent for approval");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not send the list. Please try again.");
    }
  }

  const status = STATUS[promotion.status] ?? STATUS.draft;
  const rejected = promotion.status === "draft" && promotion.decision?.outcome === "rejected" ? promotion.decision : null;

  return (
    <>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", status.className)}>{status.label}</span>
          <p className="text-sm font-semibold text-foreground" aria-live="polite">
            {plural(promotion.summary.total, "student")}: {counts.promote} go on · {counts.retain} stay · {counts.leave} leaving
          </p>
          <p className="text-xs text-foreground-muted">
            Made by {promotion.createdBy.name} on {formatDay(istDay(promotion.createdAt))}
          </p>
        </div>

        {rejected && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-foreground">
            <Undo2 className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              Sent back by {rejected.by.name}
              {rejected.note ? `: ${rejected.note}` : ". Change what is needed and send it again."}
            </span>
          </p>
        )}
        {promotion.status === "submitted" && (
          <p className="flex items-center gap-2 rounded-xl bg-warning-soft/60 px-4 py-3 text-sm text-foreground">
            <Hourglass className="size-4 shrink-0 text-warning" aria-hidden />
            {mayApprove ? "Waiting for your approval." : "Waiting for the school admin to approve. Nothing can be changed until they decide."}
          </p>
        )}
        {promotion.status === "approved" && promotion.decision && (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft/60 px-4 py-3 text-sm text-foreground">
            <CheckCheck className="size-4 shrink-0 text-success" aria-hidden />
            Approved by {promotion.decision.by.name} on {formatDay(istDay(promotion.decision.at))}. The students who go on have a place in {promotion.toYear.name}; the students who leave become
            inactive when {promotion.toYear.name} is switched on.
          </p>
        )}
        {problem && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              {changed > 0 && (
                <Button variant="ghost" onClick={() => setEdits({})} disabled={saving}>
                  <X className="size-4" aria-hidden />
                  Discard changes
                </Button>
              )}
              <Button variant="outline" disabled={changed === 0} loading={saving} onClick={() => void save()}>
                <Save className="size-4" aria-hidden />
                {changed > 0 ? `Save changes (${changed})` : "Save changes"}
              </Button>
              <Button disabled={changed > 0 || saving} loading={sending} onClick={() => void send()} title={changed > 0 ? "Save your changes first" : undefined}>
                <Send className="size-4" aria-hidden />
                Send for approval
              </Button>
            </>
          )}
          {promotion.status === "submitted" && mayApprove && (
            <>
              <Button onClick={() => setDialog("approve")}>
                <CheckCheck className="size-4" aria-hidden />
                Approve
              </Button>
              <Button variant="outline" onClick={() => setDialog("reject")}>
                <Undo2 className="size-4" aria-hidden />
                Send back
              </Button>
            </>
          )}
          {promotion.status === "approved" && (
            <Link to="/school/academic-years" className={outlineLink}>
              Go to Academic years
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
          <Button variant="ghost" className="ml-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDialog("cancel")}>
            Cancel the list
          </Button>
        </div>
      </Card>

      {groups.map((group) => (
        <section key={group.classId} aria-label={group.className} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-3">
            <h2 className="text-section-heading">{group.className}</h2>
            <p className="text-xs font-semibold text-foreground-muted">{plural(group.entries.length, "student")}</p>
            {editable && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="w-44">
                  <Select
                    id={`goes-to-${group.classId}`}
                    aria-label={`Send all of ${group.className} to`}
                    value=""
                    placeholder="Send all to…"
                    options={promotion.targets.map((t) => ({ value: t.classId, label: t.className }))}
                    onChange={(classId) => change(group.entries.map((entry) => ({ entry, change: { studentId: entry.studentId, outcome: "promote", classId } })))}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => change(group.entries.map((entry) => ({ entry, change: { studentId: entry.studentId, outcome: "retain" } })))}>
                  All stay in {group.className}
                </Button>
                <Button variant="outline" size="sm" onClick={() => change(group.entries.map((entry) => ({ entry, change: { studentId: entry.studentId, outcome: "leave" } })))}>
                  Nobody continues
                </Button>
              </div>
            )}
          </div>
          <table className="w-full border-collapse text-sm" aria-label={`Students of ${group.className}`}>
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
                <th scope="col" className="px-4 py-2">
                  Student
                </th>
                <th scope="col" className="hidden px-4 py-2 sm:table-cell">
                  Section
                </th>
                <th scope="col" className="px-4 py-2">
                  What happens
                </th>
                <th scope="col" className="px-4 py-2">
                  In {promotion.toYear.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((e) => {
                const outcome = outcomeOf(e);
                return (
                  <tr key={e.studentId} className={cn("border-t border-surface-muted", edits[e.studentId] && "bg-warning-soft/40")}>
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-foreground">{e.name}</span>
                      <span className="block font-mono text-xs text-foreground-muted">{e.admissionNumber}</span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-foreground-muted sm:table-cell">{e.from.sectionName ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      {editable ? (
                        <div role="group" aria-label={`What happens to ${e.name}`} className="inline-flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
                          {OUTCOMES.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              aria-pressed={outcome === o.value}
                              aria-label={`${e.name}: ${o.label}`}
                              onClick={() => change([{ entry: e, change: { studentId: e.studentId, outcome: o.value } }])}
                              className={cn(
                                "h-8 cursor-pointer rounded-md px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                                outcome === o.value
                                  ? o.value === "leave"
                                    ? "bg-danger-soft text-danger"
                                    : "bg-primary text-primary-foreground"
                                  : "text-foreground-muted hover:bg-background hover:text-foreground"
                              )}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{OUTCOMES.find((o) => o.value === outcome)?.label === "Promote" ? "Goes on" : outcome === "retain" ? "Stays" : "Leaves"}</span>
                      )}
                    </td>
                    <td className={cn("px-4 py-2.5 font-semibold", outcome === "leave" ? "text-danger" : "text-foreground")}>{placeText(e)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {dialog === "approve" && <ApproveDialog promotion={promotion} onClose={() => setDialog(null)} />}
      {dialog === "reject" && <RejectDialog promotion={promotion} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && (
        <ConfirmModal
          title="Cancel this promotion list?"
          confirmLabel="Cancel the list"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const res = await cancel(promotion.id).unwrap();
            push("success", res.message ?? "Cancelled");
          }}
        >
          <p>The list is dropped{promotion.status === "approved" ? ` and the places it made in ${promotion.toYear.name} are taken back` : ""}. No student is changed, and a new list can be made.</p>
        </ConfirmModal>
      )}
    </>
  );
}
