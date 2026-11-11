import { useRef, useState } from "react";
import { Link } from "react-router";
import { Download, FileSpreadsheet, KeyRound, ListPlus, Loader2, TriangleAlert, Upload } from "lucide-react";
import { TEACHER_IMPORT } from "../../../constants/teachers";
import { TONES } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { fileProblem } from "../../../utils/studentImport";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

const LEGEND = [
  { colour: "bg-[#92D050]", label: "Green columns are needed for every teacher" },
  { colour: "bg-[#FFD966]", label: "Yellow columns can be left empty" },
];

/**
 * Step 1 of the teachers' bulk upload: the file. A box to drop it on (or browse) and the sample file to start from (on a phone right under
 * the box; on a wide screen at the right). The file is read by the server (nothing is saved) and the next step shows it as a table to correct.
 */
export function TeacherUploadStep({
  onFile,
  reading,
  error,
  onTemplate,
  downloading,
  manageFieldsTo,
}: {
  onFile: (file: File) => void;
  reading: boolean;
  error: string | null;
  onTemplate: () => void;
  downloading: boolean;
  /** Where the school's own fields are managed. */
  manageFieldsTo: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function take(file: File | undefined) {
    if (!file || reading) return;
    const wrong = fileProblem(file, TEACHER_IMPORT.maxFileMb);
    setProblem(wrong);
    if (!wrong) onFile(file);
    if (input.current) input.current.value = "";
  }

  const shown = problem ?? error;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
      <Card className="min-w-0 p-5 sm:p-6 lg:col-start-1 lg:row-start-1">
        <input
          ref={input}
          id="teachers-file"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
          disabled={reading}
        />
        <label
          htmlFor="teachers-file"
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200",
            dragging ? "scale-[1.01] border-primary bg-primary-soft" : "border-border bg-background hover:border-primary/40 hover:bg-primary-soft/40",
            reading && "pointer-events-none opacity-70"
          )}
        >
          <span aria-hidden className={cn("flex size-14 items-center justify-center rounded-2xl", TONES.primary.gradient)}>
            {reading ? <Loader2 className="size-7 animate-spin" /> : <Upload className="size-7" />}
          </span>
          <span className="text-base font-bold text-foreground">{reading ? "Reading your file..." : dragging ? "Drop the file here" : "Drag and drop your teachers file here"}</span>
          {!reading && (
            <span className="text-sm text-foreground-muted">
              or <span className="font-semibold text-primary underline underline-offset-2">browse</span> to choose it
            </span>
          )}
          <span className="text-xs text-foreground-muted">
            Excel (.xlsx) or CSV · up to {TEACHER_IMPORT.maxFileMb} MB · up to {TEACHER_IMPORT.maxRows} teachers in one file
          </span>
        </label>
        {shown && (
          <p role="alert" className="fade-in mt-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {shown}
          </p>
        )}
      </Card>

      <aside className="space-y-5 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Card className="relative overflow-hidden p-5">
          <div aria-hidden className={cn("pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br to-transparent blur-2xl", TONES.success.glow)} />
          <span aria-hidden className={cn("relative flex size-10 items-center justify-center rounded-xl", TONES.success.gradient)}>
            <FileSpreadsheet className="size-5" />
          </span>
          <h2 className="text-section-heading relative mt-3">Start from the sample file</h2>
          <ul className="relative mt-3 space-y-2">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-xs text-foreground">
                <span aria-hidden className={cn("size-3.5 shrink-0 rounded-sm ring-1 ring-black/10", item.colour)} />
                {item.label}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="relative mt-4 w-full" loading={downloading} onClick={onTemplate}>
            {!downloading && <Download className="size-4" aria-hidden />}
            Download sample template
          </Button>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ListPlus className="size-4 text-primary" aria-hidden />
            Your own fields
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">A column of your file that is not on the list can become a field of your own: it comes in with the teachers, shows on their page and goes out in the Excel.</p>
          <Link to={manageFieldsTo} className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
            Manage fields
          </Link>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <KeyRound className="size-4 text-primary" aria-hidden />
            Every teacher gets a login
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            A username and a password are made for each, and you download the list when the upload is done: the passwords are shown that one time only.
          </p>
        </Card>
      </aside>
    </div>
  );
}
