import { Armchair, Download, FileSpreadsheet, PartyPopper, PencilLine, RefreshCw, TriangleAlert, Upload, UsersRound } from "lucide-react";
import { Link } from "react-router";
import { TONES } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The file's name, size, sheet and rows, how many rows are ready and need a fix, and the button to pick another file. */
export function FileBar({
  file,
  sheetName,
  rows,
  ready,
  toFix,
  onChangeFile,
  disabled,
}: {
  file: { name: string; size: number };
  sheetName: string;
  rows: number;
  ready: number;
  toFix: number;
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
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onChangeFile} disabled={disabled}>
        <RefreshCw className="size-3.5" aria-hidden />
        Choose another file
      </Button>
    </Card>
  );
}

/** The sections the ready rows would fill past their seats, and the person's answer. */
export function SeatWarning({ over, allow, onAllow, disabled }: { over: { label: string; coming: number; seatsLeft: number }[]; allow: boolean; onAllow: (allow: boolean) => void; disabled?: boolean }) {
  return (
    <div className="fade-in rounded-2xl border border-warning-line bg-warning-soft p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-warning">
        <Armchair className="size-4" aria-hidden />
        {over.length === 1 ? "One section would go over its seats" : `${over.length} sections would go over their seats`}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {over.map((o) => (
          <li key={o.label}>
            <span className="font-semibold">{o.label}</span>: {o.coming} student{o.coming === 1 ? "" : "s"} in the file, {o.seatsLeft} seat{o.seatsLeft === 1 ? "" : "s"} left
          </li>
        ))}
      </ul>
      <label className={cn("mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-foreground", disabled && "pointer-events-none opacity-60")}>
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={allow} onChange={(e) => onAllow(e.target.checked)} disabled={disabled} />
        <span>
          <span className="font-semibold">Admit them all anyway.</span> These sections will have more students than seats (you can raise the seats in
          Classes & Sections). Without this, the students after the last seat are not admitted.
        </span>
      </label>
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

/** The last step: how many were admitted, the rows still to fix (fix them here, or as a file), and where to go next. */
export function DoneCard({
  admitted,
  notAdmitted,
  linked,
  year,
  onFix,
  onDownloadProblems,
  onAnother,
}: {
  admitted: number;
  notAdmitted: number;
  linked: number;
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
      <h2 className="relative mt-4 text-xl font-extrabold tracking-tight text-foreground">
        {admitted > 0 ? `${admitted} student${admitted === 1 ? "" : "s"} admitted to ${year}` : "No student was admitted"}
      </h2>
      <div className="relative mx-auto mt-2 max-w-xl space-y-1 text-sm text-foreground-muted">
        {linked > 0 && (
          <p className="flex items-center justify-center gap-1.5">
            <UsersRound className="size-4" aria-hidden />
            {linked} of them {linked === 1 ? "was" : "were"} linked to a parent already in your school.
          </p>
        )}
        {notAdmitted > 0 ? (
          <p>
            {notAdmitted} row{notAdmitted === 1 ? " still needs" : "s still need"} a fix. Fix {notAdmitted === 1 ? "it" : "them"} in the table and upload again, or
            download {notAdmitted === 1 ? "it" : "them"} with the problem written beside each row.
          </p>
        ) : (
          <p>Every row of the file was admitted.</p>
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
          to="/school/students"
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all",
            notAdmitted > 0 ? "border border-border bg-surface text-foreground shadow-sm hover:bg-background" : "bg-primary text-primary-foreground hover:bg-primary-hover"
          )}
        >
          Go to students
        </Link>
      </div>
    </Card>
  );
}
