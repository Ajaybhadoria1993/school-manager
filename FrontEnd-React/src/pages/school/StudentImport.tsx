import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { CalendarX2, ChevronLeft, ChevronRight, FolderTree, LogOut, UserPlus } from "lucide-react";
import { isCustomKey, type CustomFieldDef } from "../../constants/studentFields";
import { IMPORT_ROWS_PER_PAGE, MAX_IMPORT_ROWS_PER_REQUEST } from "../../constants/students";
import { cameFromOf } from "../../components/layout/nav-config";
import { useSampleDownload } from "../../hooks/useSampleDownload";
import { useAppDispatch } from "../../redux/hooks";
import { refreshClass, useGetStructureQuery } from "../../redux/api/academicsApi";
import {
  refreshAfterImport,
  studentsApi,
  useGetCapacityQuery,
  useGetStudentSettingsQuery,
  useImportStudentsMutation,
  useUpdateStudentSettingsMutation,
} from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import {
  IMPORT_FIELDS,
  SCHOOL_NEEDS,
  alreadyOf,
  assignColumn,
  autoMap,
  columnChoices,
  columnsToAdd,
  placeInSections,
  emptyMapping,
  crossCheck,
  fieldDef,
  fieldsByColumn,
  lookAlikes,
  mergeSeatsRaised,
  matchInputOf,
  matchNoteOf,
  matchProblemOf,
  ownColumnsOf,
  prepareRow,
  problemOf,
  problemsCsv,
  saveBlob,
  takenNameNote,
  targetLabel,
  tidy,
  typedTableFields,
  usableTarget,
  type ColumnMapping,
  type ImportField,
  type OwnColumn,
  type PreparedRow,
  type RowProblem,
} from "../../utils/studentImport";
import type { ImportMatch, ImportSheet, ImportTarget, SeatsRaised } from "../../types";
import { CustomFieldDialog } from "../../components/students/export/CustomFieldDialog";
import { DoneCard, FileBar, ProgressCard, SeatWarning, StoppedNote } from "../../components/students/import/ImportPanels";
import { ImportRowsTable, type ViewRow } from "../../components/students/import/ImportRowsTable";
import { ImportStepper } from "../../components/students/import/ImportStepper";
import { PreviewGrid, type GridRow } from "../../components/students/import/PreviewGrid";
import { TargetPicker } from "../../components/students/import/TargetPicker";
import { AddColumnPanel, GridHint, PreviewToolbar, SameValueOffer, type RowFilter } from "../../components/students/import/PreviewPanels";
import { UploadStep } from "../../components/students/import/UploadStep";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

type SheetRow = ImportSheet["rows"][number];
/** A student admitted from this file, as the result shows them, and their row (the rows left are still checked against it). */
type Admitted = Omit<ViewRow, "status" | "problems"> & { source: PreparedRow };
/**
 * What the server said about a row it did not admit (cleared when the row is changed). `seats`: the only reason was a full section, so
 * the row is ready again once the person says "admit them all anyway".
 */
type ServerAnswer = { problems: RowProblem[]; warnings: string[]; seats: boolean; already: boolean };
/**
 * What the check of the whole file said about a row (a student the school already has, a number of another child, a maybe), with the
 * row's identity as it was asked: a row whose name, birthday, mobile, number or Aadhaar number changed since is not that row any more.
 */
type Met = { sig: string; match: ImportMatch };
/** Which column of the table each of the school's own fields is in, by its key. */
type OwnColumns = Record<string, number>;
/** After a box that needed a fix was changed: the other rows with the same value in that column, which can take the same change. */
type Offer = { column: number; from: string; to: string; rows: number[] };

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover";

const NO_FIELDS: CustomFieldDef[] = [];

/** Empty rows of the typed table at the start, and each time "Add rows" is pressed. */
const TYPED_ROWS = 10;
const blankRows = (from: number, count: number, columns: number): SheetRow[] =>
  Array.from({ length: count }, (_, i) => ({ row: from + i, cells: Array.from({ length: columns }, () => "") }));
/** A row's cells, as many as the table has columns (a short row of the file gets empty ones). */
const padTo = (cells: string[], columns: number) => Array.from({ length: columns }, (_, i) => cells[i] ?? "");

/** The title of a column the table adds for a detail of the list. */
const headingOf = (field: ImportField) => (field === "fullName" ? "Student name" : fieldDef(field).label);

/** Parts of at most 100 rows: what one request may carry. */
function inParts<T>(items: T[]): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += MAX_IMPORT_ROWS_PER_REQUEST) parts.push(items.slice(i, i + MAX_IMPORT_ROWS_PER_REQUEST));
  return parts;
}

/**
 * Students > Bulk upload (`/school/students/import`): the students a school already has, from any spreadsheet, in three
 * steps.
 *  1. Upload: the sample file (made by the server with the school's own classes) or the school's own sheet (.xlsx / .csv). The server
 *     reads it (nothing is kept) and sends back its column titles and rows.
 *  2. Preview & fix: the file as a table, and nothing else: everything is fixed in the table itself. Each column is recognised by its
 *     title (the school's own export headings and fields too); a column every student needs and the file lacks (the date of birth, the
 *     section of a class with sections) is added empty at the right. A box that needs a fix is red and says under it what is wrong, and
 *     the row's Status takes the person to it; after a fix, the other rows with the same value can take the same change. The "+" of the
 *     table adds a column: a detail of the list, one of the school's own fields, or a new field made there and then (saved at once, so
 *     Add student and the Excel have it too). Only the ready rows are uploaded.
 *  3. Done: the ready rows are admitted, 100 a request, each into the class and section of its row this year; the server checks every
 *     row again. The rows it did not admit (a child already admitted, a taken admission number, a full section) stay in the table with
 *     its reason, to fix and upload again, or to download.
 * The list and the seats are refreshed once after each upload.
 */
export default function StudentImportPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { push } = useToast();
  const structureRes = useGetStructureQuery();
  const capacityRes = useGetCapacityQuery();
  const { download: downloadTemplate, downloading } = useSampleDownload();
  const [importRows] = useImportStudentsMutation();
  const [updateSettings] = useUpdateStudentSettingsMutation();
  // The school's fields (a typed table gets a column for each it asks), its own fields and its export headings (a file it exported is read back).
  const settings = useGetStudentSettingsQuery().data?.data;
  const structure = structureRes.data?.data;
  const capacity = capacityRes.data?.data;
  const rules = settings?.fields;
  const custom = settings?.customFields ?? NO_FIELDS;

  const here = useLocation();
  const [params] = useSearchParams();
  // Opened from a class's page (or the list filtered by a class) the way back leads there, and the file is for that class.
  const from = cameFromOf(here.state);
  const [step, setStep] = useState(0);
  // The class (and section) the page was opened for, from the address (`?class=&section=`); a class that is not the school's is ignored
  // below (`usableTarget`). A plain Bulk upload has none: the whole school.
  const [opened] = useState<ImportTarget | null>(() => {
    const classId = params.get("class");
    return classId ? { classId, sectionId: params.get("section") || null } : null;
  });
  // Who the file is for: null is the whole school (each row names its class); a class, or one section of it, for a register of one class.
  // Not saved: after an upload the next file is for what the page was opened for (the whole school for a plain Bulk upload), so a Class 6
  // file is never put in Class 5 by forgetting to change it.
  const [chosen, setChosen] = useState<ImportTarget | null>(opened);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [sheet, setSheet] = useState<ImportSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [ownColumns, setOwnColumns] = useState<OwnColumns>({});
  const [answers, setAnswers] = useState<Map<number, ServerAnswer>>(() => new Map());
  // The students of the file the school already has: asked once when a file opens (not for a typed table), kept by row.
  const [met, setMet] = useState<Map<number, Met>>(() => new Map());
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkFor, setCheckFor] = useState(0);
  const checked = useRef(0);
  const [admitted, setAdmitted] = useState<Admitted[]>([]);
  const [lastRun, setLastRun] = useState<{ admitted: Admitted[]; raised: SeatsRaised[] } | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  // The rows that needed a fix when "Need a fix" was opened: they stay in it while they are fixed (a fixed row shows Ready there).
  const [fixing, setFixing] = useState<ReadonlySet<number>>(() => new Set());
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  // The window to make a new field of the school's own: for a new column (`column` null) or for a column the file already has, named `name` at first.
  const [creating, setCreating] = useState<{ column: number | null; name: string } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  // The table was typed here, not read from a file: it can grow by rows, and its empty rows are waiting for a student.
  const [typed, setTyped] = useState(false);
  const [ask, setAsk] = useState<"upload" | "leave" | null>(null);
  // The box to put the person in once the table shows it (a column just added, a detail to fix whose column was just added).
  const focusAt = useRef<{ row: number; column: number } | null>(null);

  // While students are being admitted, closing the tab asks first (the rest of the file would not be admitted).
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // One try, on the render that shows the change: a box that is not on screen then (another page of rows) is not waited for, so the
  // focus never jumps there later.
  useEffect(() => {
    const at = focusAt.current;
    if (!at) return;
    focusAt.current = null;
    const box = document.querySelector<HTMLInputElement>(`[data-at="${at.row}:${at.column}"]`);
    box?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    box?.focus({ preventScroll: true });
  });

  // The school's own fields that have a column, as the rows are read with them.
  const ownList = useMemo<OwnColumn[]>(
    () => Object.entries(ownColumns).flatMap(([key, column]) => {
      const field = custom.find((f) => f.key === key);
      return field ? [{ field, column }] : [];
    }),
    [ownColumns, custom]
  );

  // Each row is prepared once and again only when it changes (a changed row is a new object; the others are kept as they are).
  // The cache belongs to one mapping, one class layout and one set of own columns: a new column choice prepares every row again.
  // The target as the school still has it (a class made inactive since is no target any more).
  const target = useMemo(() => usableTarget(chosen, structure?.classes ?? []), [chosen, structure]);
  const rowCache = useMemo(() => ({ mapping, structure, ownList, target, rows: new WeakMap<SheetRow, PreparedRow>() }), [mapping, structure, ownList, target]);
  const prepared = useMemo(() => {
    const { mapping: m, structure: s, ownList: own, target: t, rows: cache } = rowCache;
    if (!sheet || !m || !s) return [];
    return sheet.rows.map((r) => {
      let p = cache.get(r);
      if (!p) {
        p = prepareRow(r, m, s, own, t);
        cache.set(r, p);
      }
      return p;
    });
  }, [sheet, rowCache]);
  // Each row's identity as it is now: an answer of the check is that of the row only while it is the same.
  const sigs = useMemo(() => new Map(matchInputOf(prepared).map((r) => [r.row, JSON.stringify(r)])), [prepared]);
  // A row of a class that is split into sections, with no section of its own (none given, or one the class does not have), is placed
  // in one of them: the sections are filled evenly, in the order of the file. A blank row of the typed table and a student the school
  // already has are not placed and take no seat. A section is never a problem of a row.
  const placed = useMemo(() => {
    const empty = new Set((sheet?.rows ?? []).filter((r) => r.cells.every((c) => !c.trim())).map((r) => r.row));
    const inSchool = (row: number) => met.get(row)?.sig === sigs.get(row) && met.get(row)?.match.kind === "same";
    return placeInSections(prepared, structure?.classes ?? [], capacity?.sections ?? [], (row) => empty.has(row) || inSchool(row));
  }, [prepared, sheet, structure, capacity, met, sigs]);
  // The rows already admitted from this file come first, so a row left that repeats one of them is still "the same student as row 4".
  const crossed = useMemo(() => crossCheck([...admitted.map((a) => a.source), ...placed]), [admitted, placed]);
  // Inside the file: the same name and birthday with another parent's mobile (a maybe), the admitted rows of this file counted too.
  const alike = useMemo(() => lookAlikes([...admitted.map((a) => a.source), ...placed]), [admitted, placed]);
  const wholeName = !!mapping && mapping.firstName === null && mapping.lastName === null && mapping.fullName !== null;

  /**
   * Every problem of a row: the form's rules, the file as a whole, and what the server said at the last upload. A section's seats are
   * never a problem: students past the last seat are admitted and the section's seats are raised to fit them.
   */
  const rows = placed.map((p, i) => {
    const cells = sheet!.rows[i].cells;
    // An empty row of the typed table (nothing in any cell) is waiting for a student: it is not a problem and is not uploaded.
    const blank = cells.every((c) => !c.trim());
    const answer = answers.get(p.row);
    // What the check of the file said about this row (only while the row is still the same student).
    const meeting = blank ? undefined : met.get(p.row);
    const meets = meeting && meeting.sig === sigs.get(p.row) ? meeting.match : undefined;
    const meetsProblem = meets ? matchProblemOf(meets) : null;
    const meetsNote = meets ? matchNoteOf(meets) : null;
    // A student the school already has (the check said so, or the server refused the row for it): not uploaded again, and nothing else
    // about the row needs a fix.
    const already = blank ? undefined : meets?.kind === "same" ? alreadyOf(meets) : answer?.already ? { label: "Already in your school", detail: answer.problems[0]?.message ?? "" } : undefined;
    const own = blank || already ? [] : [...p.problems, ...(crossed.get(p.row) ?? []), ...(meetsProblem ? [meetsProblem] : [])];
    const server = !already && answer ? answer.problems : [];
    // The school's own needs never stop a row (a student is admitted without them): the server's word about them is left out.
    const serverWarnings = (answer?.warnings ?? []).filter((w) => !w.startsWith(SCHOOL_NEEDS));
    const notes = [...p.warnings, ...(meetsNote ? [meetsNote] : []), ...(alike.has(p.row) ? [alike.get(p.row)!] : []), ...serverWarnings];
    return { p, cells, blank, already, own, problems: blank || already ? [] : [...own, ...server], warnings: already ? [] : notes, seatsOnly: !!answer?.seats };
  });
  const filled = rows.filter((r) => !r.blank);
  const skipped = filled.filter((r) => r.already);
  const ready = filled.filter((r) => !r.already && r.problems.length === 0);
  const toFix = filled.length - ready.length - skipped.length;

  // What each column is: a detail of the list, one of the school's own fields, or nothing (not uploaded).
  const byColumn: (string | null)[] = sheet && mapping ? fieldsByColumn(mapping, sheet.headers.length) : [];
  for (const { field, column } of ownList) if (column < byColumn.length) byColumn[column] = field.key;
  // The school's own fields the table offers: the ones it asks (switched on), and any already in a column.
  const ownFields = custom.filter((f) => f.mode !== "hidden" || ownColumns[f.key] !== undefined);

  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : r.blank
        ? false
        : filter === "already"
          ? !!r.already
          : filter === "bad"
            ? r.problems.length > 0 || fixing.has(r.p.row)
            : !r.already && r.problems.length === 0
  );
  const pages = Math.max(1, Math.ceil(shown.length / IMPORT_ROWS_PER_PAGE));
  const current = Math.min(page, pages);
  const pageRows: GridRow[] = shown
    .slice((current - 1) * IMPORT_ROWS_PER_PAGE, current * IMPORT_ROWS_PER_PAGE)
    .map((r) => ({
      row: r.p.row,
      cells: r.cells,
      blank: r.blank,
      problems: r.problems,
      warnings: r.warnings,
      already: r.already,
      // Where a student with no section of their own goes (the file names none): said under Ready.
      placed: r.p.autoSection && !r.p.autoSection.word && r.p.sectionId ? r.p.classLabel : undefined,
    }));

  // The sections the rows to upload would fill past their seats this year: the ready ones, and the ones refused only for the seats.
  const coming = new Map<string, number>();
  for (const r of filled) {
    const goes = !r.already && r.own.length === 0 && (!answers.has(r.p.row) || r.seatsOnly);
    if (goes && r.p.sectionId) coming.set(r.p.sectionId, (coming.get(r.p.sectionId) ?? 0) + 1);
  }
  const over = [...coming].flatMap(([sectionId, count]) => {
    const load = capacity?.sections.find((s) => s.sectionId === sectionId);
    if (!load || load.seatsLeft === null || count <= load.seatsLeft) return [];
    const klass = structure?.classes.find((c) => c.id === load.classId);
    const section = klass?.sections.find((s) => s.id === sectionId);
    return [{ label: `${klass?.name ?? "Class"} - ${section?.name ?? ""}`, className: klass?.name ?? "Class", coming: count, seatsLeft: load.seatsLeft }];
  });

  // Which students of a new file the school already has: ONE request for the whole file, once its rows are prepared. A failed check
  // is no reason to stop: the server checks every row again at the upload.
  useEffect(() => {
    if (checkFor === 0 || checked.current === checkFor || prepared.length === 0) return;
    checked.current = checkFor;
    const token = checkFor;
    const asked = matchInputOf(prepared);
    if (asked.length === 0) return;
    const identity = new Map(asked.map((r) => [r.row, JSON.stringify(r)]));
    setChecking(true);
    setCheckFailed(false);
    dispatch(studentsApi.endpoints.matchImportRows.initiate({ rows: asked }, { track: false }))
      .unwrap()
      .then((res) => {
        if (checked.current !== token) return;
        setMet(new Map(res.data.matches.flatMap((m) => (identity.has(m.row) ? [[m.row, { sig: identity.get(m.row)!, match: m }] as const] : []))));
      })
      .catch(() => {
        if (checked.current === token) setCheckFailed(true);
      })
      .finally(() => {
        if (checked.current === token) setChecking(false);
      });
  }, [checkFor, prepared, dispatch]);

  // ---- The file -----------------------------------------------------------------------------------------------------------------

  /** A new table to work on (a file, a paste or the empty one): everything about the last one is forgotten. */
  function openTable(next: ImportSheet, nextMapping: ColumnMapping, own: OwnColumns, source: { name: string; size: number }, isTyped: boolean) {
    setFile(source);
    setTyped(isTyped);
    setSheet(next);
    setMapping(nextMapping);
    setOwnColumns(own);
    setAnswers(new Map());
    // Whatever the last table was asked is forgotten, and an answer still on its way is not for this table.
    checked.current = 0;
    setMet(new Map());
    setChecking(false);
    setCheckFailed(false);
    setAdmitted([]);
    setLastRun(null);
    setFilter("all");
    setFixing(new Set());
    setPage(1);
    setAddOpen(false);
    setOffer(null);
    setStopped(null);
    setStep(1);
  }

  /**
   * A file as the table: its columns recognised (the school's export headings first, then the usual names; its own fields by their
   * names), and an empty column added for each detail every student needs that the file has none of, so its boxes say what to type.
   */
  function openFile(data: ImportSheet, source: { name: string; size: number }) {
    let next = autoMap(data.headers, settings?.exportColumns);
    const taken = new Set(Object.values(next).filter((c): c is number => c !== null));
    const own = ownColumnsOf(data.headers, custom.filter((f) => f.mode !== "hidden"), settings?.exportColumns ?? [], taken);
    const add = structure ? columnsToAdd(next, data.rows, structure.classes, !!target) : [];
    const width = data.headers.length;
    add.forEach((field, i) => (next = assignColumn(next, width + i, field)));
    const table: ImportSheet =
      add.length === 0
        ? data
        : { ...data, headers: [...data.headers, ...add.map(headingOf)], rows: data.rows.map((r) => ({ ...r, cells: [...padTo(r.cells, width), ...add.map(() => "")] })) };
    openTable(table, next, own, source, false);
    // The file is asked about once, when its rows are prepared (the effect below).
    setCheckFor((n) => n + 1);
  }

  async function readFile(picked: File) {
    setReading(true);
    setReadError(null);
    const body = new FormData();
    body.append("file", picked);
    try {
      // Not tracked: the file is not kept in the store (a File cannot be), only the answer is used here.
      const res = await dispatch(studentsApi.endpoints.readImportFile.initiate(body, { track: false })).unwrap();
      openFile(res.data, { name: picked.name, size: picked.size });
    } catch (err) {
      setReadError(getApiError(err)?.message ?? "Could not read the file. Please try again.");
    } finally {
      setReading(false);
    }
  }

  /** Text copied from a sheet is read like a file (the server reads tab- and comma-separated text), so one reader serves both. */
  const readPasted = (text: string) => readFile(new File([text], "pasted-table.csv", { type: "text/csv" }));

  /**
   * An empty table with a column for every usual detail, every one the school's form needs, and each of the school's own fields, to
   * type the students into (no file needed).
   */
  function startTyping() {
    const fields = typedTableFields(rules, !!target);
    const own = custom.filter((f) => f.mode !== "hidden");
    let next = emptyMapping();
    fields.forEach((f, column) => (next = assignColumn(next, column, f.key)));
    const headers = [...fields.map((f) => (f.kind === "required" ? `${f.label} *` : f.label)), ...own.map((f) => f.label)];
    openTable(
      { fileName: "", sheetName: "", headerRow: 1, headers, rows: blankRows(1, TYPED_ROWS, headers.length) },
      next,
      Object.fromEntries(own.map((f, i) => [f.key, fields.length + i])),
      { name: "Typed in the table", size: 0 },
      true
    );
  }

  /** Who the file is for was changed with the table open: every row is read again for it, and what the server said about them is dropped. */
  function changeTarget(next: ImportTarget | null) {
    setChosen(next);
    setAnswers(new Map());
    setOffer(null);
  }

  function addBlankRows() {
    if (!sheet) return;
    const from = Math.max(0, ...sheet.rows.map((r) => r.row)) + 1;
    setSheet({ ...sheet, rows: [...sheet.rows, ...blankRows(from, TYPED_ROWS, sheet.headers.length)] });
  }

  function startOver() {
    setStep(0);
    setTyped(false);
    setFile(null);
    setSheet(null);
    setMapping(null);
    setOwnColumns({});
    setReadError(null);
    setAnswers(new Map());
    checked.current = 0;
    setMet(new Map());
    setChecking(false);
    setCheckFailed(false);
    setAdmitted([]);
    setLastRun(null);
    setOffer(null);
    setStopped(null);
  }

  // ---- Changing the table -------------------------------------------------------------------------------------------------------

  /** Rows replaced by `change` (a changed row is a new object, so only it is checked again); what the server said about them is dropped. */
  function changeRows(change: (r: SheetRow) => SheetRow) {
    if (!sheet) return;
    const touched: number[] = [];
    const next = sheet.rows.map((r) => {
      const changed = change(r);
      if (changed !== r) touched.push(r.row);
      return changed;
    });
    if (touched.length === 0) return;
    setSheet({ ...sheet, rows: next });
    setAnswers((a) => {
      if (!touched.some((row) => a.has(row))) return a;
      const left = new Map(a);
      for (const row of touched) left.delete(row);
      return left;
    });
  }

  const withCell = (r: SheetRow, column: number, value: string): SheetRow => ({ ...r, cells: Object.assign(padTo(r.cells, Math.max(r.cells.length, column + 1)), { [column]: value }) });

  /**
   * A box changed. When it needed a fix, the other rows with the same value in that column that need the same fix ("Class 8" in 4 more
   * rows) are offered the same change.
   */
  function setCell(row: number, column: number, value: string, hadProblem: boolean) {
    const key = byColumn[column];
    const before = tidy(sheet?.rows.find((r) => r.row === row)?.cells[column] ?? "");
    changeRows((r) => (r.row === row ? withCell(r, column, value) : r));
    const same =
      hadProblem && key
        ? rows
            .filter((r) => r.p.row !== row && !r.blank && tidy(r.cells[column] ?? "").toLowerCase() === before.toLowerCase())
            .filter((r) => r.problems.some((p) => p.fields.includes(key)))
            .map((r) => r.p.row)
        : [];
    setOffer(same.length > 0 && tidy(value) !== before ? { column, from: before, to: tidy(value), rows: same } : null);
  }

  function applyOffer() {
    if (!offer) return;
    const take = new Set(offer.rows);
    changeRows((r) => (take.has(r.row) ? withCell(r, offer.column, offer.to) : r));
    setOffer(null);
  }

  function removeRow(row: number) {
    if (!sheet) return;
    setSheet({ ...sheet, rows: sheet.rows.filter((r) => r.row !== row) });
  }

  /** Column `column` is now `key` (a detail of the list or one of the school's own fields), or not uploaded: a field is in one column only. */
  function placeColumn(column: number, key: string | null) {
    const own = !!key && isCustomKey(key);
    setMapping((m) => (m ? assignColumn(m, column, own ? null : (key as ImportField | null)) : m));
    setOwnColumns((currentOwn) => {
      const next = Object.fromEntries(Object.entries(currentOwn).filter(([k, c]) => c !== column && k !== key));
      if (own) next[key] = column;
      return next;
    });
    setAnswers(new Map());
    setOffer(null);
  }

  /** A new column at the right of the table, for `key`, with `fill` in every row; the person is put in its first box. */
  function addColumn(key: string, fill = "", heading?: string) {
    if (!sheet) return;
    const column = sheet.headers.length;
    const title = heading ?? custom.find((f) => f.key === key)?.label ?? headingOf(key as ImportField);
    setSheet((s) => (s ? { ...s, headers: [...s.headers, title], rows: s.rows.map((r) => ({ ...r, cells: [...padTo(r.cells, column), fill] })) } : s));
    placeColumn(column, key);
    setAddOpen(false);
    const first = pageRows[0]?.row;
    if (first !== undefined) focusAt.current = { row: first, column };
  }

  /** A detail to fix that has no column (it was set to "Not uploaded"): its column comes back, and the person is put in this row's box. */
  function addMissing(field: string, row: number) {
    if (!sheet) return;
    const column = sheet.headers.length;
    addColumn(field);
    focusAt.current = { row, column };
  }

  /**
   * A new field of the school's own, made from the table: saved at once (Add student and the Excel get it too). Then it gets a column
   * of its own at the right, or, made from a column's heading, that column becomes it (the file's answers in it stay).
   */
  async function createField(field: CustomFieldDef, column: number | null) {
    if (!settings) return;
    setCreating(null);
    try {
      await updateSettings({ customFields: [...settings.customFields, field], exportColumns: [...settings.exportColumns, { key: field.key, heading: field.label }] }).unwrap();
      if (column === null) addColumn(field.key, "", field.label);
      else {
        placeColumn(column, field.key);
        const first = pageRows[0]?.row;
        if (first !== undefined) focusAt.current = { row: first, column };
      }
      push("success", `${field.label} is now one of your fields: on Add student, in the Excel and here`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not add the field. Please try again.");
    }
  }

  // ---- Uploading ----------------------------------------------------------------------------------------------------------------

  /** A problem the server named by its path; one of the school's own fields ("custom.c_...") by its name. */
  function serverProblem(path: string, message: string, p: PreparedRow): RowProblem {
    const own = path.startsWith("custom.") ? custom.find((f) => `custom.${f.key}` === path) : undefined;
    return own ? { label: own.label, message, fields: [own.key] } : problemOf(path, message, p.guardianSources, wholeName);
  }

  /** Admits the ready rows, 100 a request. Admitted rows leave the table; the ones the server refused stay with its reason. */
  async function upload() {
    if (!sheet) return;
    const sending = ready.map((r) => r.p);
    if (sending.length === 0) return;
    setStopped(null);
    setOffer(null);
    let done = 0;
    setBusy({ done, total: sending.length });
    const made: Admitted[] = [];
    const refused = new Map<number, ServerAnswer>();
    let raised: SeatsRaised[] = [];
    let failure: string | null = null;
    try {
      for (const part of inParts(sending)) {
        // Nobody is turned away for a full section: the server admits them and raises the seats to fit.
        const res = await importRows({ dryRun: false, allowOverCapacity: true, rows: part.map((p) => p.input) }).unwrap();
        raised = mergeSeatsRaised(raised, res.data.seatsRaised ?? []);
        for (const result of res.data.results) {
          const p = part.find((x) => x.row === result.row);
          if (!p) continue;
          if (result.ok) {
            made.push({
              row: p.row,
              name: result.student?.name ?? p.name,
              admissionNumber: result.student?.admissionNumber ?? null,
              classLabel: p.classLabel,
              parentLabel: p.parentLabel,
              warnings: result.warnings,
              studentId: result.student?.id,
              source: p,
            });
          } else {
            refused.set(p.row, {
              problems: result.errors.map((e) => serverProblem(e.path, e.message, p)),
              warnings: result.warnings,
              seats: result.code === "SECTION_FULL",
              // The same child, found by the server (the check could not be made, or the row changed since): the row moves to Already in school.
              already: result.code === "DUPLICATE_STUDENT",
            });
          }
        }
        done += part.length;
        setBusy({ done, total: sending.length });
      }
    } catch (err) {
      failure = `The upload stopped after ${done} rows: ${getApiError(err)?.message ?? "please try again."} The students admitted so far are saved; press Upload again for the rest.`;
    } finally {
      setBusy(null);
    }

    const gone = new Set(made.map((m) => m.row));
    // From the table as it is now: a box changed while the rows were being admitted keeps its change.
    setSheet((s) => (s ? { ...s, rows: s.rows.filter((r) => !gone.has(r.row)) } : s));
    setAnswers((a) => new Map([...[...a].filter(([row]) => !gone.has(row)), ...refused]));
    setAdmitted((list) => [...list, ...made]);
    if (made.length > 0) dispatch(refreshAfterImport());
    // The seats of a section (and of its class) changed: the class pages and the structure are read again.
    if (raised.length > 0) dispatch(refreshClass());
    if (failure) {
      setStopped(failure);
      return;
    }
    setLastRun({ admitted: made, raised });
    setFilter("all");
    setPage(1);
    setStep(2);
    push(made.length > 0 ? "success" : "error", made.length > 0 ? `${made.length} student${made.length === 1 ? "" : "s"} admitted` : "No student was admitted");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function downloadProblems() {
    if (!sheet) return;
    const bad = rows.filter((r) => r.problems.length > 0).map((r) => ({ cells: r.cells, problem: r.problems.map((p) => `${p.label}: ${p.message}`).join("; ") }));
    saveBlob(problemsCsv(sheet.headers, bad), `${(file?.name ?? "students").replace(/\.[^.]+$/, "")}-to-fix.csv`);
  }

  // ---- The page -----------------------------------------------------------------------------------------------------------------

  const backTo = from?.href ?? "/school/students";
  const leave = () => (sheet && filled.length > 0 && step === 1 && !busy ? setAsk("leave") : navigate(backTo));

  if (!structure || !capacity) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const year = capacity.academicYear?.name ?? "";
  const header = <StudentFormHeader title="Bulk upload students" subtitle={year ? `Academic year ${year}` : undefined} crumbs={[{ label: from?.label ?? "Students", onClick: leave }]} current="Bulk upload" onBack={leave} />;

  if (!capacity.academicYear || structure.classes.length === 0) {
    const noYear = !capacity.academicYear;
    return (
      <div className="space-y-6">
        {header}
        <StudentsNotice
          icon={noYear ? CalendarX2 : FolderTree}
          tone={noYear ? "warning" : "success"}
          title={noYear ? "Your school has no current academic year yet" : "Add your classes first"}
          actions={
            <Link to={noYear ? "/dashboard" : "/school/classes"} className={plainLink}>
              {noYear ? "Go to the dashboard" : "Open Classes & Sections"}
            </Link>
          }
        >
          <p>
            {noYear
              ? "Students are admitted into a class and section of an academic year. Set the year up on the dashboard first."
              : "Every student of the file goes into one of your classes, so the classes (and their sections) come first."}
          </p>
        </StudentsNotice>
      </div>
    );
  }

  // The details the "+" can add: the ones not in the table yet (a whole name, or a first and a last name, not both ways at once).
  const notMapped = mapping
    ? IMPORT_FIELDS.map((f) => f.key).filter((key) => {
        if (mapping[key] !== null) return false;
        if (key === "fullName") return mapping.firstName === null && mapping.lastName === null;
        if (key === "firstName" || key === "lastName") return mapping.fullName === null;
        return true;
      })
    : [];
  const ownNotInTable = custom.filter((f) => f.mode !== "hidden" && ownColumns[f.key] === undefined);
  const linkedNow = lastRun?.admitted.filter((a) => a.warnings.some((w) => w.includes("linked as saved"))).length ?? 0;
  // After an upload every row still in the table was not admitted (refused by the server, or not sent because it needed a fix).
  const doneRows: ViewRow[] = [
    ...(lastRun?.admitted ?? []).map(({ source: _source, ...a }) => ({ ...a, warnings: a.warnings.filter((w) => !w.startsWith(SCHOOL_NEEDS)), status: "admitted" as const, problems: [] })),
    ...filled.map((r) => ({
      row: r.p.row,
      name: r.p.name,
      admissionNumber: r.p.input.admissionNumber ?? null,
      classLabel: r.p.classLabel,
      parentLabel: r.p.parentLabel,
      status: r.already ? ("already" as const) : ("failed" as const),
      problems: r.problems,
      warnings: r.warnings,
      already: r.already,
    })),
  ];

  return (
    <>
      <div className="space-y-5">
        {header}
        <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-card sm:px-5">
          <ImportStepper current={step} />
        </div>

        {step === 0 && (
          <UploadStep
            onFile={(f) => void readFile(f)}
            onPaste={(text) => void readPasted(text)}
            onBlank={startTyping}
            reading={reading}
            error={readError}
            onTemplate={downloadTemplate}
            downloading={downloading}
            year={year}
            classes={structure.classes}
            target={target}
            onTarget={setChosen}
          />
        )}

        {step === 1 && sheet && mapping && file && (
          <>
            <FileBar file={file} sheetName={sheet.sheetName} rows={filled.length} ready={ready.length} toFix={toFix} already={skipped.length} onChangeFile={startOver} disabled={!!busy}>
              <TargetPicker classes={structure.classes} target={target} onChange={changeTarget} disabled={!!busy} />
            </FileBar>
            {checking && (
              <p role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground-muted">
                Checking the file against the students already in your school...
              </p>
            )}
            {checkFailed && (
              <p role="status" className="rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
                The file could not be checked against the students already in your school. Every row is checked again when you upload, and a student who is already
                there is not admitted twice.
              </p>
            )}
            {!checking && ready.length === 0 && toFix === 0 && skipped.length > 0 && (
              <p className="rounded-2xl border border-primary/30 bg-primary-soft/60 px-4 py-3 text-sm text-primary-deep">
                Every student of this file is already in your school. There is nothing new to upload.
              </p>
            )}
            {admitted.length > 0 && (
              <p className="rounded-2xl border border-success-line bg-success-soft px-4 py-3 text-sm text-success">
                <span className="font-bold">{admitted.length} student{admitted.length === 1 ? "" : "s"} of this file already admitted.</span> The rows below still
                need a fix.
              </p>
            )}
            {over.length > 0 && <SeatWarning over={over} />}
            {busy && <ProgressCard label="Admitting the students..." done={busy.done} total={busy.total} note="Keep this page open until it finishes." />}
            {stopped && !busy && <StoppedNote message={stopped} />}

            <PreviewToolbar
              filter={filter}
              onFilter={(f) => {
                if (f === "bad") setFixing(new Set(rows.filter((r) => r.problems.length > 0).map((r) => r.p.row)));
                setFilter(f);
                setPage(1);
              }}
              counts={{ all: rows.length, bad: toFix, good: ready.length, already: skipped.length }}
              onAddRows={typed ? addBlankRows : undefined}
              onDownloadProblems={downloadProblems}
            />
            {addOpen && (
              <AddColumnPanel
                choices={columnChoices(notMapped, ownNotInTable, structure)}
                onAdd={(key, fill) => addColumn(key, fill)}
                onCreate={() => {
                  setAddOpen(false);
                  setCreating({ column: null, name: "" });
                }}
                onClose={() => setAddOpen(false)}
              />
            )}
            {offer && (
              <SameValueOffer
                heading={sheet.headers[offer.column] || `Column ${offer.column + 1}`}
                from={offer.from}
                to={offer.to}
                rows={offer.rows.length}
                onApply={applyOffer}
                onDismiss={() => setOffer(null)}
              />
            )}
            <GridHint />

            {filled.length === 0 && !typed ? (
              <StudentsNotice icon={FolderTree} tone="navy" title="No rows left" actions={<Button onClick={startOver}>Choose another file</Button>}>
                <p>Every row was admitted or left out.</p>
              </StudentsNotice>
            ) : shown.length === 0 ? (
              <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-muted">No rows here.</p>
            ) : (
              <PreviewGrid
                headers={sheet.headers}
                rows={pageRows}
                byColumn={byColumn}
                custom={ownFields}
                structure={structure}
                onCell={setCell}
                onRemove={removeRow}
                onColumn={placeColumn}
                onMissing={addMissing}
                onAddColumn={() => setAddOpen((open) => !open)}
                onNewField={(column, name) => setCreating({ column, name })}
                newFieldProblem={(name) => takenNameNote(name, settings?.customFields ?? NO_FIELDS)}
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
                <Button size="lg" loading={!!busy} disabled={!!busy || checking || ready.length === 0} onClick={() => setAsk("upload")}>
                  {!busy && <UserPlus className="size-4" aria-hidden />}
                  Upload {ready.length} student{ready.length === 1 ? "" : "s"}
                </Button>
              </div>
            </FormActionBar>
          </>
        )}

        {step === 2 && (
          <>
            <DoneCard
              admitted={lastRun?.admitted.length ?? 0}
              notAdmitted={filled.length - skipped.length}
              already={skipped.length}
              linked={linkedNow}
              raised={lastRun?.raised}
              year={year}
              studentsTo={backTo}
              studentsLabel={from?.label}
              onFix={() => {
                setFilter("all");
                setPage(1);
                setStep(1);
              }}
              onDownloadProblems={downloadProblems}
              onAnother={() => {
                // The next file is for what the page was opened for again (the whole school until a class is chosen for it).
                setChosen(opened);
                startOver();
              }}
            />
            <ImportRowsTable rows={doneRows} goodLabel="Admitted" badLabel="Not admitted" />
          </>
        )}
      </div>

      {creating && settings && (
        <CustomFieldDialog field={null} name={creating.name} others={settings.customFields} onSave={(f) => void createField(f, creating.column)} onClose={() => setCreating(null)} />
      )}
      {ask === "upload" && (
        <AskDialog title={`Upload ${ready.length} student${ready.length === 1 ? "" : "s"}?`} icon={UserPlus} confirmLabel="Upload and admit" onClose={() => setAsk(null)} onConfirm={() => void upload()}>
          <p>
            {target
              ? `Everyone is admitted into ${targetLabel(target, structure.classes)}${target.sectionId ? "" : " (the sections share them evenly)"}`
              : "Each is admitted into the class and section of their row"}
            , in {year}, with the parents of their row (a parent already in your school is linked).
          </p>
          {toFix > 0 && <p>The {toFix} row{toFix === 1 ? "" : "s"} that need a fix are not uploaded; they stay in the table.</p>}
          {skipped.length > 0 && (
            <p>
              The {skipped.length} row{skipped.length === 1 ? " already in your school is" : "s already in your school are"} not uploaded again.
            </p>
          )}
        </AskDialog>
      )}
      {ask === "leave" && (
        <AskDialog title="Leave the bulk upload?" icon={LogOut} confirmLabel="Leave" onClose={() => setAsk(null)} onConfirm={() => navigate(backTo)}>
          <p>
            {admitted.length > 0
              ? "The students admitted so far stay admitted. The rows still in the table, and your changes to them, are not kept."
              : "Nothing from this file has been admitted yet, and your changes to the table are not kept. You can upload the file again at any time."}
          </p>
        </AskDialog>
      )}
    </>
  );
}
