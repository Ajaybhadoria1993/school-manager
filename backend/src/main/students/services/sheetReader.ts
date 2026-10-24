import ExcelJS from "exceljs";
import { ApiError } from "../../../utils/ApiError";
import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "../constants";

/** A spreadsheet as the import screen needs it: the column titles and every filled row, as text, with its row number in the file. */
export interface ReadSheet {
  fileName: string;
  sheetName: string;
  /** The row (1-based, as Excel numbers it) that holds the column titles. */
  headerRow: number;
  /** The column titles; an empty title becomes "Column C" so it can still be picked. */
  headers: string[];
  rows: { row: number; cells: string[] }[];
}

const invalid = (message: string, code: string) => ApiError.badRequest(message, code, [{ path: "file", message }]);

/** "C" for the 3rd column. */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * A cell as text. A date becomes "2016-05-14" (Excel keeps a date as a day, read here as UTC so it never shifts by a time zone); a
 * number keeps all its digits (a mobile number typed as a number); a formula gives its result; rich text and links give their text.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if ("formula" in value || "sharedFormula" in value) return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("text" in value) return String((value as { text: unknown }).text ?? "").trim();
  }
  return "";
}

/**
 * A CSV file as rows of text: quotes, doubled quotes, line breaks inside quotes, a byte-order mark, and a comma, semicolon or tab
 * as the separator (whichever the first line uses most). Nothing is turned into a number or a date: "05-04-2016" stays as written.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const separator = [",", ";", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === separator) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

/** The rows of the first worksheet of an .xlsx file, as text, with their row numbers. Cells of a merged block count once. */
async function xlsxRows(buffer: Buffer): Promise<{ sheetName: string; rows: { row: number; cells: string[] }[] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw invalid("This file could not be read as an Excel file. Save it again as .xlsx (or .csv) and upload it.", "IMPORT_FILE_UNREADABLE");
  }
  // The students are on the first sheet (the template's other sheets are only lists to pick from).
  const sheet = workbook.worksheets.find((ws) => ws.state !== "hidden" && ws.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) throw invalid("The file has no sheet with students in it.", "IMPORT_EMPTY");
  const rows: { row: number; cells: string[] }[] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
    const cells: string[] = [];
    excelRow.eachCell({ includeEmpty: true }, (cell, column) => {
      if (column > MAX_IMPORT_COLUMNS) return;
      // A cell inside a merged block repeats its first cell's value: it is read once, from the first cell.
      cells[column - 1] = cell.type === ExcelJS.ValueType.Merge ? "" : cellText(cell.value);
    });
    rows.push({ row: rowNumber, cells: Array.from(cells, (c) => c ?? "") });
  });
  return { sheetName: sheet.name, rows };
}

/**
 * Reads an uploaded students file (.xlsx or .csv) into column titles and rows of text. The title row is the first of the first ten
 * rows that has at least three filled cells, so a title line above it ("Sunrise School, students 2026") or the template's instruction
 * line is passed over. Empty rows are left out. The file is only read, never kept.
 */
export async function readStudentSheet(fileName: string, buffer: Buffer): Promise<ReadSheet> {
  const lower = fileName.toLowerCase();
  let sheetName = "Sheet 1";
  let all: { row: number; cells: string[] }[];
  if (lower.endsWith(".csv")) {
    all = parseCsv(buffer.toString("utf8")).map((cells, index) => ({ row: index + 1, cells: cells.slice(0, MAX_IMPORT_COLUMNS) }));
  } else if (lower.endsWith(".xlsx")) {
    ({ sheetName, rows: all } = await xlsxRows(buffer));
  } else {
    throw invalid("Upload an Excel file (.xlsx) or a .csv file. An old .xls file: open it in Excel and save it as .xlsx.", "IMPORT_FILE_TYPE");
  }

  const filled = all.filter((r) => r.cells.some((c) => c !== ""));
  const header = filled.slice(0, 10).find((r) => r.cells.filter((c) => c !== "").length >= 3);
  if (!header) {
    throw invalid("No row of column titles was found (a row near the top with at least three titles, such as Name, Class, Date of Birth).", "IMPORT_NO_HEADER");
  }
  const width = Math.min(MAX_IMPORT_COLUMNS, Math.max(...filled.map((r) => r.cells.length)));
  const headers = Array.from({ length: width }, (_, i) => (header.cells[i] ?? "").trim() || `Column ${columnLetter(i)}`);
  const rows = filled
    .filter((r) => r.row > header.row)
    .map((r) => ({ row: r.row, cells: Array.from({ length: width }, (_, i) => r.cells[i] ?? "") }));

  if (rows.length === 0) throw invalid("The file has column titles but no students under them.", "IMPORT_EMPTY");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw invalid(`The file has ${rows.length} students. Upload up to ${MAX_IMPORT_ROWS} at a time: split it into smaller files.`, "IMPORT_TOO_MANY_ROWS");
  }
  return { fileName, sheetName, headerRow: header.row, headers, rows };
}
