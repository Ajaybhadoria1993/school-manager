import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CalendarCheck, CalendarPlus, CalendarRange, History, Rocket } from "lucide-react";
import { STUDENT_APPROVERS } from "../../constants/students";
import { useActivateAcademicYearMutation, useCreateNextAcademicYearMutation, useGetAcademicYearsQuery } from "../../redux/api/academicsApi";
import { useGetPromotionQuery } from "../../redux/api/studentsApi";
import { useAppSelector } from "../../redux/hooks";
import { formatDayRange, nextYearAfter } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { AcademicYear, Promotion } from "../../types";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** Where the promotion list is, in words, for the card of the year that waits. */
function promotionLine(promotion: Promotion | null | undefined, nextName: string): { text: string; done: boolean } {
  if (!promotion) return { text: "Not started", done: false };
  if (promotion.status === "draft") return { text: `Being made: ${promotion.summary.total} students`, done: false };
  if (promotion.status === "submitted") return { text: "Waiting for the school admin to approve", done: false };
  if (promotion.status === "approved") return { text: `Approved: the students have a place in ${nextName}`, done: true };
  return { text: promotion.status, done: false };
}

/** "Make the next year": its name and days, suggested from the running year and changeable, and whether its sections are copied. */
function NextYearForm({ running }: { running: AcademicYear }) {
  const suggestion = nextYearAfter(running);
  const [name, setName] = useState(suggestion.name);
  const [startDate, setStartDate] = useState(suggestion.startDate);
  const [endDate, setEndDate] = useState(suggestion.endDate);
  const [copySections, setCopySections] = useState(true);
  const [copyTimetable, setCopyTimetable] = useState(true);
  const [problems, setProblems] = useState<Partial<Record<"name" | "startDate" | "endDate", string>>>({});
  const [make, { isLoading }] = useCreateNextAcademicYearMutation();
  const [failure, setFailure] = useState<string | null>(null);
  const { push } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    const found: typeof problems = {};
    if (name.trim().length < 4) found.name = "Enter the name of the next year, for example 2027-2028";
    if (!startDate) found.startDate = "Choose the day it starts";
    if (!endDate) found.endDate = "Choose the day it ends";
    else if (startDate && endDate <= startDate) found.endDate = "The end day must be after the start day";
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    try {
      const res = await make({ name: name.trim(), startDate, endDate, copySections, copyTimetable }).unwrap();
      push("success", `${res.data.name} is made. Its sections${res.data.sectionsCopied > 0 ? ` (${res.data.sectionsCopied}) were copied` : " were not copied"}${res.data.timetablesCopied > 0 ? `, and ${res.data.timetablesCopied} timetable${res.data.timetablesCopied === 1 ? "" : "s"}` : ""}.`);
    } catch (err) {
      const error = getApiError(err);
      const details = (Array.isArray(error?.details) ? error.details : []) as { path?: string; message?: string }[];
      const mapped: typeof problems = {};
      for (const d of details) if (d.path === "name" || d.path === "startDate" || d.path === "endDate") mapped[d.path] = d.message;
      if (Object.keys(mapped).length > 0) setProblems(mapped);
      else setFailure(error?.message ?? "Could not make the next year. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="next-year-name" label="Name of the next year" error={problems.name}>
          <Input id="next-year-name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="next-year-start" label="Starts on" error={problems.startDate}>
          <Input id="next-year-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field id="next-year-end" label="Ends on" error={problems.endDate}>
          <Input id="next-year-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
        <input type="checkbox" checked={copySections} onChange={(e) => setCopySections(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="font-semibold">Copy the sections of {running.name}</span>
          <span className="block text-xs text-foreground-muted">Their names, seats and rooms become the sections of the next year, to promote the students into. You can change them after it is switched on.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
        <input type="checkbox" checked={copyTimetable} onChange={(e) => setCopyTimetable(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="font-semibold">Copy what each class studies and its timetable</span>
          <span className="block text-xs text-foreground-muted">The subjects, periods and teachers of each class, and its weekly timetable, as drafts to look at and change. The running year is not touched.</span>
        </span>
      </label>
      {failure && <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{failure}</p>}
      <Button type="submit" loading={isLoading}>
        <CalendarPlus className="size-4" aria-hidden />
        Make the next year
      </Button>
    </form>
  );
}

/**
 * Manage school > Academic years (`/school/academic-years`): the running year, the next one and the years that are over. The next year is
 * made here (its name and days are suggested from the running year; its sections are copied from it), then students are promoted into
 * it (Promote the students) and the school admin switches it on, which closes the running year. Nothing is deleted: every record of a
 * closed year stays with that year. Reads the school's years, and the open promotion list of the year that waits.
 */
export default function AcademicYearsPage() {
  const role = useAppSelector((state) => state.auth.user?.role);
  const mayActivate = !!role && STUDENT_APPROVERS.includes(role);
  const { push } = useToast();
  const yearsRes = useGetAcademicYearsQuery();
  const [activate] = useActivateAcademicYearMutation();
  const [switching, setSwitching] = useState(false);

  const years = yearsRes.data?.data ?? [];
  const running = years.find((y) => y.status === "active");
  const next = years.find((y) => y.status === "pending");
  const over = years.filter((y) => y.status === "closed");
  const promotionRes = useGetPromotionQuery(next?.id ?? "", { skip: !next });
  const line = next ? promotionLine(promotionRes.data?.data, next.name) : null;

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Academic years" subtitle="The running year, the next one, and the years that are over." crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />

      {yearsRes.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : yearsRes.error && !yearsRes.data ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(yearsRes.error)?.message ?? "Could not load the academic years."}</p>
          <Button variant="outline" onClick={() => yearsRes.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !running ? (
        <StudentsNotice
          icon={CalendarRange}
          tone="warning"
          title="Your school has no running academic year yet"
          actions={
            <Link to="/dashboard" className={outlineLink}>
              Go to the dashboard
            </Link>
          }
        >
          <p>Set up the running year on the dashboard first. The next year is made from it.</p>
        </StudentsNotice>
      ) : (
        <>
          <section aria-label="Running year">
            <Card className="flex flex-wrap items-center gap-4 p-5">
              <span aria-hidden className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
                <CalendarCheck className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Running year</p>
                <p className="text-xl font-extrabold tracking-tight text-foreground">{running.name}</p>
                <p className="text-sm text-foreground-muted">{formatDayRange(running.startDate, running.endDate)}</p>
              </div>
              <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">Running</span>
            </Card>
          </section>

          <section aria-label="Next year">
            <Card className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Rocket className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Next year</p>
                  <p className="text-lg font-extrabold tracking-tight text-foreground">{next ? next.name : "Not made yet"}</p>
                  {next && <p className="text-sm text-foreground-muted">{formatDayRange(next.startDate, next.endDate)}</p>}
                </div>
                {next && <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">Waiting</span>}
              </div>

              {!next ? (
                <NextYearForm running={running} />
              ) : (
                <>
                  <ol className="space-y-3">
                    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-background/70 px-4 py-3">
                      <span aria-hidden className={cn("flex size-6 items-center justify-center rounded-full text-xs font-bold", line?.done ? "bg-success text-white" : "bg-surface-muted text-foreground-muted")}>
                        1
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">Promote the students</p>
                        <p className="text-xs text-foreground-muted">
                          {promotionRes.isLoading ? "Reading the promotion list…" : line?.text}
                        </p>
                      </div>
                      <Link to="/school/promotion" className={line?.done ? outlineLink : plainLink}>
                        {promotionRes.data?.data ? "Open the promotion list" : "Promote the students"}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </li>
                    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-background/70 px-4 py-3">
                      <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-foreground-muted">
                        2
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">Switch on {next.name}</p>
                        <p className="text-xs text-foreground-muted">
                          {mayActivate ? `${running.name} is closed and ${next.name} becomes the school's year.` : "Only the school admin can switch the next year on."}
                        </p>
                      </div>
                      {mayActivate && (
                        <Button onClick={() => setSwitching(true)}>
                          <CalendarCheck className="size-4" aria-hidden />
                          Switch on {next.name}
                        </Button>
                      )}
                    </li>
                  </ol>
                </>
              )}
            </Card>
          </section>

          {over.length > 0 && (
            <section aria-label="Years that are over">
              <Card className="p-5">
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
                  <History className="size-4 text-foreground-muted" aria-hidden />
                  Years that are over
                </h2>
                <ul className="divide-y divide-border">
                  {over.map((y) => (
                    <li key={y.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="font-semibold text-foreground">{y.name}</span>
                      <span className="text-foreground-muted">{formatDayRange(y.startDate, y.endDate)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}

      {switching && next && running && (
        <ConfirmModal
          title={`Switch on ${next.name}?`}
          icon={CalendarCheck}
          tone="primary"
          confirmLabel="Switch on"
          onClose={() => setSwitching(false)}
          onConfirm={async () => {
            const res = await activate(next.id).unwrap();
            push("success", `${res.data.name} is now the school's year${res.data.leftSchool > 0 ? `. ${res.data.leftSchool} students who were leaving are inactive now.` : "."}`);
          }}
        >
          <p>
            {running.name} is closed and {next.name} becomes the year of the school: the students, the classes and the sections everywhere are {next.name}&apos;s from then on.
          </p>
          <p>Students who go on are in their new classes, and students who leave become inactive (they can be made active again). Every record of {running.name} stays with that year; nothing is deleted.</p>
          <p className="font-semibold text-foreground">It cannot be switched back, so make sure the promotion list is approved.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
