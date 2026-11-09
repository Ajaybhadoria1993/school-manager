import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { ChevronLeft, ChevronRight, FolderTree, UserPlus } from "lucide-react";
import { IMPORT_ROWS_PER_PAGE } from "../../constants/students";
import { MAX_CUSTOM_FIELDS, isCustomKey, newCustomKey, type CustomFieldDef } from "../../constants/studentFields";
import { useSampleDownload } from "../../hooks/useSampleDownload";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useAppDispatch } from "../../redux/hooks";
import { refreshAfterTeacherImport, timetableApi, useGetSubjectsQuery, useGetTeacherSettingsQuery, useImportTeachersMutation, useUpdateTeacherSettingsMutation } from "../../redux/api/timetableApi";
import type { ImportSheet } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { problemsCsv, saveBlob, tidy } from "../../utils/studentImport";
import {
  assignTeacherColumn,
  autoMapTeachers,
  crossCheckTeachers,
  inTeacherParts,
  loginsCsv,
  newFieldCandidates,
  normaliseOwnCell,
  normaliseTeacherCell,
  ownColumnsOf,
  prepareTeacherRow,
  serverTeacherProblem,
  teacherColumnsToAdd,
  teacherFieldNamed,
  teacherFieldsByColumn,
  teacherHeading,
  type OwnColumn,
  type PreparedTeacher,
  type TeacherImportField,
  type TeacherMapping,
  type TeacherRowProblem,
} from "../../utils/teacherImport";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { TEACHER_WORDS } from "../../constants/teachers";
import { CustomFieldDialog } from "../../components/students/export/CustomFieldDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FileBar, ProgressCard, StoppedNote } from "../../components/students/import/ImportPanels";
import { ImportStepper } from "../../components/students/import/ImportStepper";
import { PreviewToolbar, type RowFilter } from "../../components/students/import/PreviewPanels";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { TeacherDoneCard, TeacherLogins, type AddedTeacher } from "../../components/teachers/import/TeacherDoneCard";
import { TeacherPreviewGrid, type TeacherGridRow } from "../../components/teachers/import/TeacherPreviewGrid";
import { TeacherUploadStep } from "../../components/teachers/import/TeacherUploadStep";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/toast-context";

/** What the server said about a row at the last upload: its reasons, and whether the teacher is in the school already. */
interface ServerAnswer {
  problems: TeacherRowProblem[];
  already?: { label: string; detail: string };
}

/** The teacher was in the school already (the same mobile number). */
const MOBILE_EXISTS = "TEACHER_MOBILE_EXISTS";

/** A cell of a row, set (the row is padded with empty cells when a column was added after it was read). */
const withCell = (cells: string[], column: number, value: string): string[] => {
  const next = Array.from({ length: Math.max(cells.length, column + 1) }, (_, i) => cells[i] ?? "");
  next[column] = value;
  return next;
};

/**
 * Teacher (or Manage school > Manage Teacher) > Bulk upload (`/teachers/import`, `/school/teachers/import`): the teachers a school
 * already has, from any spreadsheet, in three steps, like the students' bulk upload.
 *  1. Upload: the sample file (made by the server with the school's subjects) or the school's own sheet (.xlsx / .csv). The server reads it
 *     (nothing is kept) and sends back its column titles and rows.
 *  2. Preview & fix: the file as a table, and nothing else: everything is fixed in the table itself. Each column is recognised by its
 *     title; the name and the mobile number (every teacher gets a login, which needs it) are added empty when the file has no column for
 *     them. A box that needs a fix is red and says under it what is wrong, and the row's Status takes the person to it. Only the ready
 *     rows are uploaded.
 *  3. Done: the ready rows are made, 10 a request, each with a login (the username and password the file gives, or ones the server makes
 *     up); the server checks every row again. The logins are listed with a download, because the made-up passwords are told only now.
 *     The rows it did not make (a username taken, a code another teacher has) stay in the table with its reason; a teacher already in the
 *     school (the same mobile number) moves to "Already in school", so the same file can be uploaded again safely.
 * Leaving with rows in the table, or with logins not downloaded yet, asks first. The lists are refreshed once after an upload.
 */
export default function TeacherImportPage() {
  const dispatch = useAppDispatch();
  const { base, label } = useTeacherBase();
  const { download: downloadTemplate, downloading } = useSampleDownload("teachers");
  const [importRows] = useImportTeachersMutation();
  const { push } = useToast();
  // The school's own fields for its teachers: a column of the file can be one (the ones it asks; a field it does not ask is off).
  const settings = useGetTeacherSettingsQuery().data?.data;
  const [saveFields] = useUpdateTeacherSettingsMutation();
  const customFields = settings?.customFields;
  const active = useMemo(() => (customFields ?? []).filter((f) => f.mode !== "hidden"), [customFields]);
  const subjectItems = useGetSubjectsQuery("all").data?.data.items;
  // The school's subjects by name, to say which subjects of the file are new (null until they are known: nothing is said before).
  const known = useMemo(() => (subjectItems ? new Set(subjectItems.map((s) => tidy(s.name).toLowerCase())) : null), [subjectItems]);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [sheet, setSheet] = useState<ImportSheet | null>(null);
  const [mapping, setMapping] = useState<TeacherMapping | null>(null);
  // Which column of the file holds each of the school's own fields, by the field's key.
  const [ownColumns, setOwnColumns] = useState<Record<string, number>>({});
  // The window to make a new field of the school's own for a column of the file: its number and the file's title.
  const [creating, setCreating] = useState<{ column: number; title: string } | null>(null);
  const [savingFields, setSavingFields] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<number, ServerAnswer>>(() => new Map());
  const [added, setAdded] = useState<(AddedTeacher & { source: PreparedTeacher })[]>([]);
  const [downloaded, setDownloaded] = useState(false);
  // How many teachers the last upload made (the logins listed are those of every upload of this file).
  const [lastRun, setLastRun] = useState(0);
  const [filter, setFilter] = useState<RowFilter>("all");
  // The rows that needed a fix when "Need a fix" was opened: they stay in it while they are fixed (a fixed row shows Ready there).
  const [fixing, setFixing] = useState<ReadonlySet<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [ask, setAsk] = useState<"upload" | null>(null);
  // The box to put the person in once the table shows it (a column just added for a detail to fix).
  const focusAt = useRef<{ row: number; column: number } | null>(null);

  // One try, on the render that shows the change: a box that is not on screen then (another page of rows) is not waited for.
  useEffect(() => {
    const at = focusAt.current;
    if (!at) return;
    focusAt.current = null;
    const box = document.querySelector<HTMLInputElement>(`[data-cell="${at.row}:${at.column}"]`);
    box?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    box?.focus({ preventScroll: true });
  });

  // Each row is read again whenever the table changes: a file holds at most 300 rows.
  const ownList = useMemo<OwnColumn[]>(
    () => Object.entries(ownColumns).flatMap(([key, column]) => {
      const field = active.find((f) => f.key === key);
      return field ? [{ field, column }] : [];
    }),
    [ownColumns, active]
  );
  const prepared = useMemo(() => (sheet && mapping ? sheet.rows.map((r) => prepareTeacherRow(r, mapping, known, ownList)) : []), [sheet, mapping, known, ownList]);
  // The rows already made from this file come first, so a row left that repeats one of them is still "the same mobile number as row 3".
  const crossed = useMemo(() => crossCheckTeachers([...added.map((a) => a.source), ...prepared]), [added, prepared]);

  /** Every problem of a row: the form's rules, the file as a whole, and what the server said at the last upload. */
  const rows = prepared.map((p, i) => {
    const cells = sheet!.rows[i].cells;
    const answer = answers.get(p.row);
    const already = answer?.already;
    const problems = already ? [] : [...p.problems, ...(crossed.get(p.row) ?? []), ...(answer?.problems ?? [])];
    return { p, cells, already, problems, warnings: already ? [] : p.warnings };
  });
  const skipped = rows.filter((r) => r.already);
  const ready = rows.filter((r) => !r.already && r.problems.length === 0);
  const toFix = rows.length - ready.length - skipped.length;

  const byColumn: (string | null)[] = sheet && mapping ? teacherFieldsByColumn(mapping, sheet.headers.length, ownColumns) : [];
  // The columns that are no detail and no field: they can all become fields of the school's own with one press.
  const unused = newFieldCandidates(sheet?.headers ?? [], byColumn, customFields ?? []);
  const room = MAX_CUSTOM_FIELDS - (customFields?.length ?? 0);

  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "already" ? !!r.already : filter === "bad" ? r.problems.length > 0 || fixing.has(r.p.row) : !r.already && r.problems.length === 0
  );
  const pages = Math.max(1, Math.ceil(shown.length / IMPORT_ROWS_PER_PAGE));
  const current = Math.min(page, pages);
  const pageRows: TeacherGridRow[] = shown
    .slice((current - 1) * IMPORT_ROWS_PER_PAGE, current * IMPORT_ROWS_PER_PAGE)
    .map((r) => ({ row: r.p.row, cells: r.cells, problems: r.problems, warnings: r.warnings, already: r.already }));

  // ---- The file -----------------------------------------------------------------------------------------------------------------

  /** A file as the table: its columns recognised, and an empty column added for the name and the mobile number if the file has none. */
  function openFile(data: ImportSheet, source: { name: string; size: number }) {
    let next = autoMapTeachers(data.headers);
    // A column that is the name of one of the school's own fields is read as it (a file made from the sample file or the export).
    const taken = new Set(Object.values(next).filter((c): c is number => c !== null));
    const own = ownColumnsOf(data.headers, active, taken);
    const add = teacherColumnsToAdd(next);
    const width = data.headers.length;
    add.forEach((field, i) => (next = assignTeacherColumn(next, width + i, field)));
    const table: ImportSheet =
      add.length === 0
        ? data
        : { ...data, headers: [...data.headers, ...add.map(teacherHeading)], rows: data.rows.map((r) => ({ ...r, cells: [...Array.from({ length: width }, (_, i) => r.cells[i] ?? ""), ...add.map(() => "")] })) };
    setFile(source);
    setSheet(table);
    setMapping(next);
    setOwnColumns(own);
    setAnswers(new Map());
    setAdded([]);
    setDownloaded(false);
    setFilter("all");
    setFixing(new Set());
    setPage(1);
    setStopped(null);
    setStep(1);
  }

  async function readFile(picked: File) {
    setReading(true);
    setReadError(null);
    const body = new FormData();
    body.append("file", picked);
    try {
      // Not tracked: the file is not kept in the store (a File cannot be), only the answer is used here.
      const res = await dispatch(timetableApi.endpoints.readTeacherFile.initiate(body, { track: false })).unwrap();
      openFile(res.data, { name: picked.name, size: picked.size });
    } catch (err) {
      setReadError(getApiError(err)?.message ?? "Could not read the file. Please try again.");
    } finally {
      setReading(false);
    }
  }

  function startOver() {
    setStep(0);
    setFile(null);
    setSheet(null);
    setMapping(null);
    setOwnColumns({});
    setReadError(null);
    setAnswers(new Map());
    setAdded([]);
    setDownloaded(false);
    setStopped(null);
  }

  // ---- Changing the table -------------------------------------------------------------------------------------------------------

  /** A box was kept: shaped as the school writes it (a mobile number as 10 digits, a day as DD-MM-YYYY...); what the server said about the row is dropped. */
  function setCell(row: number, column: number, value: string) {
    if (!sheet) return;
    const key = byColumn[column];
    const mine = key ? active.find((f) => f.key === key) : undefined;
    const kept = mine ? normaliseOwnCell(mine, value) : key ? normaliseTeacherCell(key as TeacherImportField, value) : value;
    setSheet({ ...sheet, rows: sheet.rows.map((r) => (r.row === row ? { ...r, cells: withCell(r.cells, column, kept) } : r)) });
    setAnswers((a) => {
      if (!a.has(row)) return a;
      const left = new Map(a);
      left.delete(row);
      return left;
    });
  }

  function removeRow(row: number) {
    if (!sheet) return;
    setSheet({ ...sheet, rows: sheet.rows.filter((r) => r.row !== row) });
  }

  /** Column `column` is now `key` (a usual detail, one of the school's own fields by its key, or nothing): a detail is in one column only. */
  function placeColumn(column: number, key: string | null) {
    const own = !!key && isCustomKey(key);
    setMapping((m) => (m ? assignTeacherColumn(m, column, own ? null : (key as TeacherImportField | null)) : m));
    setOwnColumns((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([k, c]) => c !== column && k !== key));
      if (own) next[key] = column;
      return next;
    });
    setAnswers(new Map());
  }

  /** A detail to fix that has no column (the server refused a username and the file has none): its column is added, and the person is put in this row's box. */
  function addMissing(field: string, row: number) {
    if (!sheet) return;
    const column = sheet.headers.length;
    const title = isCustomKey(field) ? (active.find((f) => f.key === field)?.label ?? field) : teacherHeading(field as TeacherImportField);
    setSheet({ ...sheet, headers: [...sheet.headers, title], rows: sheet.rows.map((r) => ({ ...r, cells: withCell(r.cells, column, "") })) });
    // A new empty column changes no row: what the server said about the rows stays (it is what the box under the new column says).
    setMapping((m) => (m ? assignTeacherColumn(m, column, isCustomKey(field) ? null : (field as TeacherImportField)) : m));
    if (isCustomKey(field)) setOwnColumns((current) => ({ ...current, [field]: column }));
    const index = shown.findIndex((r) => r.p.row === row);
    const onPage = index - (current - 1) * IMPORT_ROWS_PER_PAGE;
    focusAt.current = { row: onPage >= 0 && onPage < IMPORT_ROWS_PER_PAGE ? onPage : 0, column };
  }

  // ---- The school's own fields ------------------------------------------------------------------------------------------------------

  /** Saves the school's own fields (the whole list) and puts the new ones in their columns; false (and a message) when they could not be saved. */
  async function addFields(made: { field: CustomFieldDef; column: number }[]): Promise<boolean> {
    if (!customFields || made.length === 0) return false;
    setSavingFields(true);
    setFieldError(null);
    try {
      await saveFields({ customFields: [...customFields, ...made.map((m) => m.field)] }).unwrap();
      setOwnColumns((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([, c]) => !made.some((m) => m.column === c)));
        for (const m of made) next[m.field.key] = m.column;
        return next;
      });
      setMapping((m) => (m ? made.reduce((acc, item) => assignTeacherColumn(acc, item.column, null), m) : m));
      setAnswers(new Map());
      return true;
    } catch (err) {
      const message = getApiError(err)?.message ?? "Could not save the fields. Please try again.";
      setFieldError(message);
      push("error", message);
      return false;
    } finally {
      setSavingFields(false);
    }
  }

  /** One column becomes a field of its own (the dialog gave its name, kind and choices). */
  async function createField(field: CustomFieldDef, column: number) {
    if (await addFields([{ field, column }])) {
      setCreating(null);
      push("success", `${field.label} is now one of your fields: on the teacher's page, in the Excel and here`);
    }
  }

  /** Every column that is no detail becomes a text field named as the file names it (the school can change their kind later, under Manage fields). */
  async function addAllUnused() {
    const take = unused.slice(0, Math.max(0, room));
    const made = take.map((c) => ({ column: c.column, field: { key: newCustomKey(), label: c.title, type: "text" as const, options: [], mode: "optional" as const } }));
    if (await addFields(made)) push("success", `${made.length} field${made.length === 1 ? "" : "s"} added: ${made.map((m) => m.field.label).join(", ")}`);
  }

  // ---- Uploading ----------------------------------------------------------------------------------------------------------------

  /** Makes the ready rows, 10 a request. Rows made leave the table; the ones the server refused stay with its reason. */
  async function upload() {
    if (!sheet) return;
    const sending = ready.map((r) => r.p);
    if (sending.length === 0) return;
    setStopped(null);
    let done = 0;
    setBusy({ done, total: sending.length });
    const made: (AddedTeacher & { source: PreparedTeacher })[] = [];
    const refused = new Map<number, ServerAnswer>();
    let failure: string | null = null;
    try {
      for (const part of inTeacherParts(sending)) {
        const res = await importRows({ rows: part.map((p) => p.input) }).unwrap();
        for (const result of res.data.results) {
          const p = part.find((x) => x.row === result.row);
          if (!p) continue;
          if (result.ok && result.teacher && result.login) {
            made.push({ row: p.row, id: result.teacher.id, name: result.teacher.name, mobile: p.mobile, username: result.login.username, password: result.login.password ?? p.input.password ?? "", source: p });
          } else {
            refused.set(p.row, {
              problems: result.errors.map((e) => serverTeacherProblem(e.path, e.message, active)),
              // The teacher is in the school already (found by the server): the row moves to Already in school.
              already: result.code === MOBILE_EXISTS ? { label: "Already in your school", detail: result.errors[0]?.message ?? "" } : undefined,
            });
          }
        }
        done += part.length;
        setBusy({ done, total: sending.length });
      }
    } catch (err) {
      failure = `The upload stopped after ${done} rows: ${getApiError(err)?.message ?? "please try again."} The teachers added so far are saved; press Upload again for the rest.`;
    } finally {
      setBusy(null);
    }

    const gone = new Set(made.map((m) => m.row));
    // From the table as it is now: a box changed while the rows were being made keeps its change.
    setSheet((s) => (s ? { ...s, rows: s.rows.filter((r) => !gone.has(r.row)) } : s));
    setAnswers((a) => new Map([...[...a].filter(([row]) => !gone.has(row)), ...refused]));
    if (made.length > 0) {
      setAdded((list) => [...list, ...made]);
      setDownloaded(false);
      dispatch(refreshAfterTeacherImport());
    }
    if (failure) {
      setStopped(failure);
      return;
    }
    setLastRun(made.length);
    setFilter("all");
    setPage(1);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadProblems() {
    if (!sheet) return;
    const bad = rows.filter((r) => r.problems.length > 0).map((r) => ({ cells: r.cells, problem: r.problems.map((p) => `${p.label}: ${p.message}`).join("; ") }));
    saveBlob(problemsCsv(sheet.headers, bad), `${(file?.name ?? "teachers").replace(/\.[^.]+$/, "")}-to-fix.csv`);
  }

  function downloadLogins() {
    saveBlob(loginsCsv(added, `${window.location.origin}/login`), `${(file?.name ?? "teachers").replace(/\.[^.]+$/, "")}-logins.csv`);
    setDownloaded(true);
  }

  // ---- Leaving ------------------------------------------------------------------------------------------------------------------

  // Logins made and not downloaded yet (the passwords are not shown again), or rows in the table that were not uploaded.
  const unseen = added.length > 0 && !downloaded;
  const unsent = step === 1 && rows.length > 0 && !busy;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (unseen || unsent) && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!unseen && !unsent && !busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unseen, unsent, busy]);

  // ---- The page -----------------------------------------------------------------------------------------------------------------

  const header = <StudentFormHeader title="Bulk upload teachers" crumbs={[{ label, to: base }]} current="Bulk upload" />;

  return (
    <>
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card sm:px-5">
          <ImportStepper current={step} />
        </div>

        {step === 0 && <TeacherUploadStep onFile={(f) => void readFile(f)} reading={reading} error={readError} onTemplate={downloadTemplate} downloading={downloading} manageFieldsTo={`${base}/fields`} />}

        {step === 1 && sheet && mapping && file && (
          <>
            <FileBar file={file} sheetName={sheet.sheetName} rows={rows.length} ready={ready.length} toFix={toFix} already={skipped.length} onChangeFile={startOver} disabled={!!busy} />
            {ready.length === 0 && toFix === 0 && skipped.length > 0 && (
              <p className="rounded-2xl border border-primary/30 bg-primary-soft/60 px-4 py-3 text-sm text-primary-deep">Every teacher of this file is already in your school. There is nothing new to upload.</p>
            )}
            {added.length > 0 && (
              <p className="rounded-2xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success">
                <span className="font-bold">
                  {added.length} teacher{added.length === 1 ? "" : "s"} of this file already added.
                </span>{" "}
                The rows below still need a fix.
              </p>
            )}
            {busy && <ProgressCard label="Adding the teachers..." done={busy.done} total={busy.total} note="Keep this page open until it finishes." />}
            {stopped && !busy && <StoppedNote message={stopped} />}

            {unused.length > 0 && (
              <div role="status" aria-label="Columns not uploaded" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-foreground">
                <p className="min-w-0 flex-1">
                  <span className="font-bold text-warning">
                    {unused.length} column{unused.length === 1 ? "" : "s"} of your file {unused.length === 1 ? "is" : "are"} not uploaded:
                  </span>{" "}
                  {unused.map((c) => c.title).join(", ")}
                  {room < unused.length && <span className="text-foreground-muted"> (a school can have {MAX_CUSTOM_FIELDS} fields of its own: {room > 0 ? `the first ${room} are added` : "none can be added"})</span>}
                </p>
                <Button size="sm" loading={savingFields} disabled={room <= 0 || !settings} onClick={() => void addAllUnused()}>
                  {unused.length === 1 ? "Add it as your own field" : "Add them as your own fields"}
                </Button>
              </div>
            )}

            <PreviewToolbar
              filter={filter}
              onFilter={(f) => {
                if (f === "bad") setFixing(new Set(rows.filter((r) => r.problems.length > 0).map((r) => r.p.row)));
                setFilter(f);
                setPage(1);
              }}
              counts={{ all: rows.length, bad: toFix, good: ready.length, already: skipped.length }}
              onDownloadProblems={downloadProblems}
            />

            {rows.length === 0 ? (
              <StudentsNotice icon={FolderTree} tone="navy" title="No rows left" actions={<Button onClick={startOver}>Choose another file</Button>}>
                <p>Every row was added or left out.</p>
              </StudentsNotice>
            ) : shown.length === 0 ? (
              <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-muted">No rows here.</p>
            ) : (
              <TeacherPreviewGrid
                headers={sheet.headers}
                rows={pageRows}
                byColumn={byColumn}
                own={active}
                onCell={setCell}
                onRemove={removeRow}
                onColumn={placeColumn}
                onMissing={addMissing}
                onNewField={settings && room > 0 ? (column, title) => setCreating({ column, title }) : undefined}
              />
            )}

            {pages > 1 && (
              <nav aria-label="Pages of rows" className="flex items-center justify-between gap-3 text-sm text-foreground-muted">
                <span>
                  {(current - 1) * IMPORT_ROWS_PER_PAGE + 1} to {Math.min(shown.length, current * IMPORT_ROWS_PER_PAGE)} of {shown.length} rows
                </span>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="px-2" aria-label="Previous rows" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <span className="px-1 font-semibold text-foreground">
                    {current} / {pages}
                  </span>
                  <Button variant="outline" size="sm" className="px-2" aria-label="Next rows" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </nav>
            )}

            <FormActionBar>
              {/* On a phone the file bar above has this button; the bar keeps only Upload, across the screen. */}
              <Button variant="ghost" className="hidden sm:inline-flex" onClick={startOver} disabled={!!busy}>
                Choose another file
              </Button>
              <div className="flex flex-1 items-center justify-end gap-3 [&>button]:w-full sm:flex-none sm:[&>button]:w-auto">
                {toFix > 0 && (
                  <p className="hidden text-xs text-foreground-muted md:block">
                    {toFix} row{toFix === 1 ? " needs" : "s need"} a fix and {toFix === 1 ? "is" : "are"} not uploaded.
                  </p>
                )}
                <Button size="lg" loading={!!busy} disabled={!!busy || ready.length === 0} onClick={() => setAsk("upload")}>
                  {!busy && <UserPlus className="size-4" aria-hidden />}
                  Upload {ready.length} teacher{ready.length === 1 ? "" : "s"}
                </Button>
              </div>
            </FormActionBar>
          </>
        )}

        {step === 2 && (
          <>
            <TeacherDoneCard
              added={lastRun}
              notAdded={rows.length - skipped.length}
              already={skipped.length}
              backTo={base}
              onFix={() => {
                setFilter("all");
                setPage(1);
                setStep(1);
              }}
              onDownloadProblems={downloadProblems}
              onAnother={startOver}
            />
            {added.length > 0 && <TeacherLogins added={added} onDownload={downloadLogins} />}
          </>
        )}
      </div>

      {creating && customFields && (
        <CustomFieldDialog
          field={null}
          name={teacherFieldNamed(creating.title) ? "" : creating.title}
          others={customFields}
          busy={savingFields}
          error={fieldError}
          words={TEACHER_WORDS}
          reserved={teacherFieldNamed}
          onSave={(field) => void createField(field, creating.column)}
          onClose={() => {
            setCreating(null);
            setFieldError(null);
          }}
        />
      )}
      {ask === "upload" && (
        <AskDialog title={`Upload ${ready.length} teacher${ready.length === 1 ? "" : "s"}?`} icon={UserPlus} confirmLabel="Upload and add" onClose={() => setAsk(null)} onConfirm={() => void upload()}>
          <p>Each is added with a login of their own: the username and password of the file, or ones made up. You download the list when it is done.</p>
          {toFix > 0 && (
            <p>
              The {toFix} row{toFix === 1 ? "" : "s"} that need a fix {toFix === 1 ? "is" : "are"} not uploaded; {toFix === 1 ? "it stays" : "they stay"} in the table.
            </p>
          )}
          {skipped.length > 0 && (
            <p>
              The {skipped.length} row{skipped.length === 1 ? " already in your school is" : "s already in your school are"} not uploaded again.
            </p>
          )}
        </AskDialog>
      )}
      {blocker.state === "blocked" && (
        <ConfirmModal
          title={unseen ? "Leave without the login details?" : "Leave without uploading?"}
          confirmLabel={unseen ? "Leave without the details" : "Leave without uploading"}
          onClose={() => blocker.reset()}
          onConfirm={async () => blocker.proceed()}
        >
          <p>
            {unseen
              ? "The passwords of the teachers just added are shown only on this page. Download the login details first, or you will have to set a new password for each teacher."
              : "Nothing from this file has been uploaded yet, and your changes to the table are not kept. You can upload the file again at any time."}
          </p>
        </ConfirmModal>
      )}
    </>
  );
}
