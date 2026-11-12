import type { ReactNode } from "react";
import { Armchair, Download, FileSpreadsheet, PartyPopper, PencilLine, RefreshCw, TriangleAlert, Upload, UsersRound } from "lucide-react";
import { Link } from "react-router";
import { TONES } from "../../../constants/tones";
import type { SeatsRaised } from "../../../types";
import { cn } from "../../../utils/helpers";
import { joinNames } from "../../../utils/studentImport";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * The file's name, size, sheet and rows, how many rows are ready, need a fix and are students the school already has, and the button
 * to pick another file.
 */
export function FileBar({
  file,
  sheetName,
  rows,
  ready,
  toFix,
  already = 0,
  onChangeFile,
  disabled,
  children,
}: {
  /** A row under the file: who it is for (the whole school, one class or one section). */
  children?: ReactNode;
  file: { name: string; size: number };
  sheetName: string;
  rows: number;
  ready: number;
  toFix: number;
  /** Rows whose student is in the school already: not uploaded again, and no fix needed. */
  already?: number;
  onChangeFile: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground" title={file.name}>
            {file.name} {file.size > 0 && <span className="font-normal text-foreground-muted">({sizeText(file.size)})</span>}
          </p>
          <p className="text-xs text-foreground-muted" aria-live="polite">
            {sheetName && `${sheetName} · `}{rows} row{rows === 1 ? "" : "s"} · <span className="font-semibold text-success">{ready} ready</span>
            {toFix > 0 && (
              <>
                {" "}
                · <span className="font-semibold text-danger">{toFix} need a fix</span>
              </>
            )}
            {already > 0 && (
              <>
                {" "}
                · <span className="font-semibold text-primary-deep">{already} already in your school</span>
              </>
            )}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onChangeFile} disabled={disabled}>
        <RefreshCw className="size-3.5" aria-hidden />
        Choose another file
      </Button>
      {children && <div className="w-full border-t border-border pt-3">{children}</div>}
    </Card>
  );
}

/**
 * The sections the ready rows would fill past their seats. Nobody is turned away: everyone is admitted and the seats are raised to fit
 * them, so this only tells the person (no question), and recommends dividing the class into more sections.
 */
export function SeatWarning({ over }: { over: { label: string; className: string; coming: number; seatsLeft: number }[] }) {
  return (
    <div className="fade-in rounded-2xl border border-warning-line bg-warning-soft p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-warning">
        <Armchair className="size-4" aria-hidden />
        {over.length === 1 ? `${over[0].label} will get more seats` : `${over.length} sections will get more seats`}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {over.map((o) => (
          <li key={o.label}>
            <span className="font-semibold">{o.label}</span>: {o.coming} student{o.coming === 1 ? "" : "s"} in the file, {o.seatsLeft} seat{o.seatsLeft === 1 ? "" : "s"} left
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-foreground">
        Everyone is admitted and the seats are raised to fit. <span className="font-semibold">Recommended: divide {joinNames(over.map((o) => o.className))} into more sections.</span>
      </p>
    </div>
  );
}

/** A bar for the upload while its requests run. */
export function ProgressCard({ label, done, total, note }: { label: string; done: number; total: number; note: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Card className="fade-in p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-foreground">{label}</span>
        <span className="font-semibold text-foreground-muted">
          {done} of {total}
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
      <p className="mt-2 text-xs text-foreground-muted">{note}</p>
    </Card>
  );
}

/** The red note when a request of the upload did not go through. */
export function StoppedNote({ message }: { message: string }) {
  return (
    <p role="alert" className="fade-in flex items-start gap-2 rounded-2xl border border-danger-line bg-danger-soft p-4 text-sm text-danger">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

/**
 * The last step: how many were admitted, the rows of students the school already had (not admitted again, nothing to fix), the rows
 * still to fix (fix them here, or as a file), and where to go next.
 */
export function DoneCard({
  admitted,
  notAdmitted,
  already = 0,
  linked,
  raised = [],
  year,
  studentsTo = "/school/students",
  studentsLabel,
  onFix,
  onDownloadProblems,
  onAnother,
}: {
  /** Where the last button leads: the students (the default), or the class page the upload was opened from, named by `studentsLabel`. */
  studentsTo?: string;
  studentsLabel?: string;
  admitted: number;
  /** Rows that still need a fix. */
  notAdmitted: number;
  /** Rows whose student was in the school already. */
  already?: number;
  linked: number;
  /** The sections that were given more seats so that everyone had one. */
  raised?: SeatsRaised[];
  year: string;
  onFix: () => void;
  onDownloadProblems: () => void;
  onAnother: () => void;
}) {
  return (
    <Card className="fade-in relative overflow-hidden px-6 py-8 text-center sm:py-10">
      <div aria-hidden className={cn("absolute -right-16 -top-16 size-56 rounded-full bg-gradient-to-br to-transparent blur-3xl", TONES.success.glow)} />
      <span aria-hidden className={cn("relative mx-auto flex size-14 items-center justify-center rounded-2xl", admitted > 0 ? TONES.success.gradient : TONES.warning.gradient)}>
        {admitted > 0 ? <PartyPopper className="size-7" /> : <TriangleAlert className="size-7" />}
      </span>
      <h2 className="text-section-heading relative mt-4">
        {admitted > 0 ? `${admitted} student${admitted === 1 ? "" : "s"} admitted to ${year}` : "No student was admitted"}
      </h2>
      <div className="relative mx-auto mt-2 max-w-xl space-y-1 text-sm text-foreground-muted">
        {linked > 0 && (
          <p className="flex items-center justify-center gap-1.5">
            <UsersRound className="size-4" aria-hidden />
            {linked} of them {linked === 1 ? "was" : "were"} linked to a parent already in your school.
          </p>
        )}
        {already > 0 && (
          <p>
            {already} row{already === 1 ? " was" : "s were"} already in your school: {already === 1 ? "it was" : "they were"} not admitted again.
          </p>
        )}
        {raised.length > 0 && (
          <div className="mx-auto max-w-xl rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-left text-sm text-foreground">
            {raised.map((r) => (
              <p key={r.sectionId ?? r.classId} className="flex items-start gap-2">
                <Armchair className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {r.sectionName ? `${r.className} - ${r.sectionName}` : r.className}: seats raised from {r.from} to {r.to}.
                  {r.classTo !== null && ` ${r.className} now has ${r.classTo} seats.`}
                </span>
              </p>
            ))}
            <p className="mt-1.5 font-semibold text-warning">Recommended: divide {joinNames(raised.map((r) => r.className))} into more sections.</p>
          </div>
        )}
        {notAdmitted > 0 ? (
          <p>
            {notAdmitted} row{notAdmitted === 1 ? " still needs" : "s still need"} a fix. Fix {notAdmitted === 1 ? "it" : "them"} in the table and upload again, or
            download {notAdmitted === 1 ? "it" : "them"} with the problem written beside each row.
          </p>
        ) : (
          <p>{already > 0 ? "Every other row of the file was admitted." : "Every row of the file was admitted."}</p>
        )}
      </div>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {notAdmitted > 0 && (
          <>
            <Button onClick={onFix}>
              <PencilLine className="size-4" aria-hidden />
              Fix the {notAdmitted} row{notAdmitted === 1 ? "" : "s"}
            </Button>
            <Button variant="outline" onClick={onDownloadProblems}>
              <Download className="size-4" aria-hidden />
              Download them
            </Button>
          </>
        )}
        <Button variant="outline" onClick={onAnother}>
          <Upload className="size-4" aria-hidden />
          Upload another file
        </Button>
        <Link
          to={studentsTo}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all",
            notAdmitted > 0 ? "border border-border bg-surface text-foreground shadow-sm hover:bg-background" : "bg-primary text-primary-foreground hover:bg-primary-hover"
          )}
        >
          Go to {studentsLabel ?? "students"}
        </Link>
      </div>
    </Card>
  );
}
