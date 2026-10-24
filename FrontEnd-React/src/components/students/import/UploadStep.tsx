import { useRef, useState } from "react";
import { ClipboardPaste, Download, FileSpreadsheet, Info, Loader2, Table2, TriangleAlert, Upload } from "lucide-react";
import { MAX_IMPORT_FILE_MB, MAX_IMPORT_ROWS } from "../../../constants/students";
import { TONES } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { fileProblem } from "../../../utils/studentImport";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Textarea } from "../../ui/Input";

const LEGEND = [
  { colour: "bg-[#92D050]", label: "Green columns are needed for every student" },
  { colour: "bg-[#9BC2E6]", label: "Blue: at least one parent with a mobile number" },
  { colour: "bg-[#FFD966]", label: "Yellow columns can be left empty" },
];

/**
 * Step 1 of the bulk upload: the file. A box to drop it on (or browse), what the file may look like, and the sample file to start from
 * (on a phone right under the box; on a wide screen at the right). The file is read by the server (nothing is saved) and the next step
 * shows it as a table to correct.
 */
export function UploadStep({
  onFile,
  onPaste,
  onBlank,
  reading,
  error,
  onTemplate,
  downloading,
  year,
}: {
  onFile: (file: File) => void;
  /** Text copied from a sheet (with its heading row), as the server reads a file. */
  onPaste: (text: string) => void;
  /** An empty table to type the students into. */
  onBlank: () => void;
  reading: boolean;
  error: string | null;
  onTemplate: () => void;
  downloading: boolean;
  year: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  function take(file: File | undefined) {
    if (!file || reading) return;
    const wrong = fileProblem(file, MAX_IMPORT_FILE_MB);
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
          id="students-file"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0])}
          disabled={reading}
        />
        <label
          htmlFor="students-file"
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
          <span className="text-base font-bold text-foreground">
            {reading ? "Reading your file..." : dragging ? "Drop the file here" : "Drag and drop your students file here"}
          </span>
          {!reading && (
            <span className="text-sm text-foreground-muted">
              or <span className="font-semibold text-primary underline underline-offset-2">browse</span> to choose it
            </span>
          )}
          <span className="text-xs text-foreground-muted">
            Excel (.xlsx) or CSV · up to {MAX_IMPORT_FILE_MB} MB · up to {MAX_IMPORT_ROWS} students in one file
          </span>
        </label>
        <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          <span aria-hidden className="h-px flex-1 bg-border" />
          No file? Use one of these
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={pasting}
            onClick={() => setPasting((p) => !p)}
            disabled={reading}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              pasting ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-primary/40 hover:bg-primary-soft/40"
            )}
          >
            <ClipboardPaste className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-foreground">Paste from a sheet</span>
              <span className="block text-xs text-foreground-muted">Copy the table in Google Sheets, Word or any app, with its heading row, and paste it here.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onBlank}
            disabled={reading}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            <Table2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-foreground">Type the students here</span>
              <span className="block text-xs text-foreground-muted">An empty table: type each student in a row, with dropdown suggestions. No file needed.</span>
            </span>
          </button>
        </div>
        {pasting && (
          <div className="fade-in mt-4 space-y-3">
            <Textarea
              aria-label="Paste the table here"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Name\tClass\tFather's Mobile\nAsha Verma\t5-A\t9876543210"}
              className="font-mono text-xs"
            />
            <Button disabled={!text.trim() || reading} loading={reading} onClick={() => onPaste(text)}>
              Show it as a table
            </Button>
          </div>
        )}
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
          <h2 className="relative mt-3 text-base font-bold text-foreground">Start from the sample file</h2>
          <p className="relative mt-1 text-sm text-foreground-muted">
            An Excel file with the right columns, dropdowns for gender, class and state, and a sheet listing your classes and sections.
          </p>
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
          <h2 className="text-sm font-bold text-foreground">Already have a students sheet?</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Upload it as it is. Its first row of titles is found even under a school name or a heading, and a column with the whole name
            (Student Name) is split into first and last name.
          </p>
        </Card>
      </aside>

      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">
        <div className="rounded-2xl border border-info-line bg-info-soft p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-info">
            <Info className="size-4" aria-hidden />
            How it works
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            <li>Use the sample file, or your school's own Excel or CSV sheet as it is: its columns (Name, Class, Father's Mobile...) are recognised by their titles. No file? Paste a copied table, or type the students in an empty table.</li>
            <li>The file opens as a table. Change any cell, choose what each column is, add a missing column or leave a row out; red cells show what to fix.</li>
            <li>Every student goes into the class (and section) written in the file, in {year}. "V", "5th", "Class 5" and "5-A" are all understood.</li>
            <li>A parent whose mobile number is already in your school is linked to the child, never added twice. Brothers and sisters in one file share their parents.</li>
            <li>The admission numbers your school already gave are kept. A row without one gets the next number (ADM-...).</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-warning-line bg-warning-soft p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-warning">
            <TriangleAlert className="size-4" aria-hidden />
            Note
          </p>
          <p className="mt-1.5 text-sm text-foreground">
            Only the first sheet of the file is read, from its row of column titles down. Dates are read day first (14-05-2016). A student who is
            already admitted (same name, date of birth and parent's mobile) is not admitted again, so the same file can be uploaded twice safely.
          </p>
        </div>
      </div>
    </div>
  );
}
