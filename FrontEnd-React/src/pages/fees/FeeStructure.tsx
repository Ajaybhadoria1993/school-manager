import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Bus, CalendarX2, CircleAlert, Copy, IndianRupee, ListChecks, Pencil, Plus, School, Trash2 } from "lucide-react";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { CopyFeesDialog } from "../../components/fees/CopyFeesDialog";
import { FeeHeadDialog } from "../../components/fees/FeeHeadDialog";
import { FeeLineDialog } from "../../components/fees/FeeLineDialog";
import { UsualFeesDialog } from "../../components/fees/UsualFeesDialog";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { APPLIES_LABEL } from "../../constants/fees";
import { useCan } from "../../hooks/useCan";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useDeleteFeeLineMutation, useGetFeeStructureQuery } from "../../redux/api/feesApi";
import type { ClassFees, FeeLine } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { howOften, rupees } from "../../utils/fees";
import { cn } from "../../utils/helpers";

const TH = "whitespace-nowrap px-4 py-3 text-left text-[13.5px] font-semibold text-foreground";

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-body-label">{label}</p>
      <p className="text-stat-value">{rupees(value)}</p>
      {hint && <p className="text-caption-subtle">{hint}</p>}
    </div>
  );
}

/**
 * Fees > Fee structure (`/fees/structure`): the fee chart of every class for a session. The classes are on the left with what a new student
 * pays in a year; the class chosen is on the right: each fee with its amount, how often, who pays it, and what the chart comes to for a
 * new student, an existing student and the optional extras. The school adds a fee to one class or many, changes or takes off a line, copies
 * one class's chart to others, and starts a session from the one before with a raise. The upcoming session can be set up before it starts.
 */
export default function FeeStructurePage() {
  const can = useCan();
  const readOnlyYear = useReadOnlyYear();
  const mayChange = can("fees.manage") && !readOnlyYear;
  const { push } = useToast();
  const [yearId, setYearId] = useState<string | undefined>();
  const [picked, setPicked] = useState<string | null>(null);
  const res = useGetFeeStructureQuery({ yearId });
  const data = res.data?.data;
  const [dialog, setDialog] = useState<{ kind: "line"; line?: FeeLine; classId?: string } | { kind: "usual" } | { kind: "head" } | { kind: "copy"; mode: "classes" | "year" } | null>(null);
  const [removing, setRemoving] = useState<{ line: FeeLine; className: string } | null>(null);
  const [deleteLine] = useDeleteFeeLineMutation();

  const selected: ClassFees | undefined = useMemo(() => data?.classes.find((c) => c.id === picked) ?? data?.classes[0], [data, picked]);
  const startMonth = data?.year?.startMonth ?? 4;
  const classOptions = useMemo(() => (data?.classes ?? []).map((c) => ({ id: c.id, name: c.name, fees: c.lines.length })), [data]);
  const anyFees = classOptions.some((c) => c.fees > 0);

  const header = (actions?: React.ReactNode) => <StudentFormHeader title="Fee structure" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={actions} />;

  if (!data) {
    return (
      <div className="space-y-6">
        {header()}
        {res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fees."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-72 rounded-2xl" />
        )}
      </div>
    );
  }

  const actions = mayChange ? (
    <>
      {data.years.length > 1 && (
        <Select
          aria-label="Session"
          className="w-52"
          value={data.year?.id ?? ""}
          onChange={(v) => setYearId(data.years.find((y) => y.id === v)?.status === "active" ? undefined : v)}
          options={data.years.map((y) => ({ value: y.id, label: y.status === "pending" ? `${y.name} (upcoming)` : y.name }))}
        />
      )}
      {data.heads.length > 0 && data.classes.length > 0 && (
        <Button variant="outline" onClick={() => setDialog({ kind: "copy", mode: anyFees ? "classes" : "year" })}>
          <Copy className="size-4" aria-hidden />
          Copy fees
        </Button>
      )}
      {data.heads.length > 0 && data.classes.length > 0 && (
        <Button onClick={() => setDialog({ kind: "line", classId: selected?.id })}>
          <Plus className="size-4" aria-hidden />
          Add fee
        </Button>
      )}
    </>
  ) : undefined;

  const dialogs = (
    <>
      {dialog?.kind === "usual" && <UsualFeesDialog have={data.heads.map((h) => h.name)} onClose={() => setDialog(null)} />}
      {dialog?.kind === "head" && <FeeHeadDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === "line" && (
        <FeeLineDialog
          heads={data.heads}
          classes={data.classes.map((c) => ({ id: c.id, name: c.name }))}
          startMonth={startMonth}
          yearId={yearId}
          presetClassId={dialog.classId}
          line={dialog.line}
          classLabel={dialog.line ? selected?.name : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "copy" && <CopyFeesDialog mode={dialog.mode} classes={classOptions} fromClassId={selected?.id} yearId={yearId} yearName={data.year?.name ?? "this session"} onClose={() => setDialog(null)} />}
      {removing && (
        <ConfirmModal
          title={`Take ${removing.line.headName} off ${removing.className}?`}
          confirmLabel="Take it off"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteLine(removing.line.id).unwrap();
            push("success", "Fee taken off");
          }}
        >
          <p>It leaves the fee chart of {removing.className} for {data.year?.name}. Other classes keep it.</p>
        </ConfirmModal>
      )}
    </>
  );

  if (!data.year) {
    return (
      <div className="space-y-6">
        {header()}
        <StudentsNotice icon={CalendarX2} tone="warning" title="Your school has no current academic year yet">
          <p>Fees are set for an academic year. Set the year up on the dashboard first.</p>
        </StudentsNotice>
      </div>
    );
  }
  if (data.classes.length === 0) {
    return (
      <div className="space-y-6">
        {header()}
        <StudentsNotice icon={School} tone="primary" title="Add your classes first" actions={<Link to="/school-class" className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white">Go to Classes</Link>}>
          <p>Each class has its own fee chart.</p>
        </StudentsNotice>
      </div>
    );
  }
  if (data.heads.length === 0) {
    return (
      <div className="space-y-6">
        {header()}
        <StudentsNotice
          icon={IndianRupee}
          tone="primary"
          title="Start with the list of your fees"
          actions={
            mayChange ? (
              <>
                <Button onClick={() => setDialog({ kind: "usual" })}>
                  <ListChecks className="size-4" aria-hidden />
                  Add the usual fees
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: "head" })}>
                  <Plus className="size-4" aria-hidden />
                  Add a fee
                </Button>
              </>
            ) : undefined
          }
        >
          <p>Registration, admission, tuition, exam, uniform and the rest: pick the ones your school charges, then set each class&apos;s amount.</p>
        </StudentsNotice>
        {dialogs}
      </div>
    );
  }

  const c = selected!;
  const readonlyNote = readOnlyYear ? <Badge tone="neutral">{data.year.name} is over: only to look at</Badge> : null;
  return (
    <div className="space-y-6">
      {header(actions)}
      {data.year.status === "pending" && <Badge tone="info">Setting up {data.year.name}, the upcoming session</Badge>}
      {readonlyNote}

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card aria-label="Classes" className="h-fit p-2">
          <ul className="space-y-1">
            {data.classes.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  aria-current={k.id === c.id ? "true" : undefined}
                  onClick={() => setPicked(k.id)}
                  className={cn("flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", k.id === c.id ? "bg-primary-soft text-primary-deep" : "hover:bg-surface-muted")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{k.name}</span>
                    {k.department && <span className="block truncate text-xs text-foreground-muted">{k.department}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-right text-xs font-semibold">
                    {k.warnings.length > 0 && <CircleAlert className="size-4 text-warning" aria-label="Look at this fee chart again" />}
                    {k.lines.length === 0 ? <span className="text-foreground-muted">Not set</span> : <span>{rupees(k.totals.newStudent)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <section aria-label={`Fees of ${c.name}`} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-section-heading">{c.name}</h2>
            {mayChange && c.lines.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "copy", mode: "classes" })}>
                  <Copy className="size-4" aria-hidden />
                  Copy to other classes
                </Button>
                <Button size="sm" onClick={() => setDialog({ kind: "line", classId: c.id })}>
                  <Plus className="size-4" aria-hidden />
                  Add fee
                </Button>
              </div>
            )}
          </div>

          {c.lines.length === 0 ? (
            <StudentsNotice
              icon={IndianRupee}
              tone="primary"
              title={`No fees for ${c.name} yet`}
              actions={
                mayChange ? (
                  <>
                    <Button onClick={() => setDialog({ kind: "line", classId: c.id })}>
                      <Plus className="size-4" aria-hidden />
                      Add fee
                    </Button>
                    {anyFees && (
                      <Button variant="outline" onClick={() => setDialog({ kind: "copy", mode: "classes" })}>
                        <Copy className="size-4" aria-hidden />
                        Copy from another class
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Figure label="A new student pays" value={c.totals.newStudent} hint={c.totals.atJoining > 0 ? `${rupees(c.totals.atJoining)} of it when joining` : "in the first session"} />
                <Figure label="An existing student pays" value={c.totals.existingStudent} hint="for the session" />
                <Figure label="Optional extras" value={c.totals.optional} hint="if the family chooses them" />
                {c.totals.refundable > 0 && <Figure label="Given back later" value={c.totals.refundable} hint="the refundable deposit" />}
              </div>

              {c.warnings.map((w) => (
                <p key={w} role="status" className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {w}
                </p>
              ))}

              <Card className="overflow-x-auto">
                <table aria-label={`Fees of ${c.name}`} className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/60">
                      <th scope="col" className={TH}>Fee</th>
                      <th scope="col" className={cn(TH, "text-right")}>Amount</th>
                      <th scope="col" className={TH}>How often</th>
                      <th scope="col" className={TH}>Who pays</th>
                      <th scope="col" className={cn(TH, "text-right")}>A year</th>
                      {mayChange && <th scope="col" className="w-24 px-2"><span className="sr-only">Change</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-3 align-top">
                          <span className="block font-bold text-foreground">{l.headName}</span>
                          {l.notes && <span className="block text-xs text-foreground-muted">{l.notes}</span>}
                        </td>
                        <td className="px-4 py-3 text-right align-top font-semibold">{rupees(l.amount)}</td>
                        <td className="px-4 py-3 align-top text-foreground-muted">{howOften(l, startMonth)}</td>
                        <td className="px-4 py-3 align-top">
                          <span className="flex flex-wrap gap-1.5">
                            <Badge tone={l.appliesTo === "all" ? "neutral" : "primary"}>{APPLIES_LABEL[l.appliesTo]}</Badge>
                            {l.optional && <Badge tone="warning">Optional</Badge>}
                            {l.refundable && <Badge tone="success">Refundable</Badge>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right align-top font-semibold">{rupees(l.yearly)}</td>
                        {mayChange && (
                          <td className="px-2 py-3 text-right align-top">
                            <span className="inline-flex gap-1">
                              <Button variant="outline" size="sm" aria-label={`Change ${l.headName}`} onClick={() => setDialog({ kind: "line", line: l, classId: c.id })}>
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button variant="outline" size="sm" aria-label={`Take ${l.headName} off`} onClick={() => setRemoving({ line: l, className: c.name })}>
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {data.heads.some((h) => h.kind === "transport") && (
            <p className="flex items-center gap-2 text-sm text-foreground-muted">
              <Bus className="size-4 shrink-0" aria-hidden />
              The transport fee is not here: it comes from the stop a child boards at.
              <Link to="/transport/routes" className="font-semibold text-primary hover:underline">
                Routes
              </Link>
            </p>
          )}
        </section>
      </div>
      {dialogs}
    </div>
  );
}
