import ExcelJS from "exceljs";
import { ApiError } from "../../../utils/ApiError";
import { todayInIndia } from "../../students/schemas/students.schemas";
import type { SheetFile } from "../../students/services/spreadsheet.service";
import { Tenant } from "../../tenants/models/Tenant";
import type { ProgressQuery } from "../schemas/classroom.schemas";
import type { Caller } from "./leave.service";
import { ProgressService } from "./progress.service";

/** The most diary entries one file takes: a year of a large school is asked for in parts (a class, or fewer days). */
export const MAX_EXPORT_UPDATES = 20_000;

const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
/** "2026-11-23" -> "23-11-2026": the day as the school writes it. */
const written = (day: string | null | undefined) => (day ? `${day.slice(8, 10)}-${day.slice(5, 7)}-${day.slice(0, 4)}` : "");

type Cell = string | number;

/** A sheet with bold headings that stay on top, each column filtered. Text stays text: what a teacher typed is never a sum. */
function addSheet(workbook: ExcelJS.Workbook, name: string, columns: [string, number][], rows: Cell[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(([, width]) => ({ width }));
  const header = sheet.addRow(columns.map(([heading]) => heading));
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    cell.border = BORDER;
  });
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const values of rows) {
    sheet.addRow(values).eachCell((cell) => {
      if (typeof cell.value === "string") cell.numFmt = "@";
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
}

/**
 * Teaching progress as one Excel file (docs/teaching-progress.md), of the days and filters the page shows and only what the caller may see:
 * every update of those days, each class subject, every chapter, and the teachers added up.
 */
export class ProgressExportService {
  static async file(tenantId: string, caller: Caller, query: ProgressQuery): Promise<SheetFile> {
    const log = await ProgressService.entries(tenantId, caller, query, { skip: 0, limit: MAX_EXPORT_UPDATES });
    if (log.total > MAX_EXPORT_UPDATES) {
      throw ApiError.badRequest(`Choose fewer days or one class: a file takes up to ${MAX_EXPORT_UPDATES.toLocaleString("en-IN")} updates.`, "TOO_MANY_ROWS");
    }
    const [{ rows }, tenant] = await Promise.all([ProgressService.overview(tenantId, caller, query), Tenant.findById(tenantId).select("name").lean()]);
    const finished = (r: (typeof rows)[number]) => r.chapters.filter((c) => c.done).length;
    const chapterName = (c: { number: number; name: string } | null) => (c ? `${c.number}. ${c.name}` : "");
    const status = (r: (typeof rows)[number], c: (typeof rows)[number]["chapters"][number]) =>
      c.done ? "Finished" : c.late ? "Late" : r.current?.number === c.number ? "Running" : c.days > 0 ? "Started" : "Not started";

    // Added up by the subject's assigned teacher, as the page's Teachers tab does.
    const teachers = new Map<string, { name: string; sums: number[] }>();
    for (const r of rows) {
      if (!r.teacherId || !r.teacherName) continue;
      const found = teachers.get(r.teacherId) ?? { name: r.teacherName, sums: [0, 0, 0, 0, 0, 0, 0] };
      [1, r.updates, r.homework, finished(r), r.chapters.length, r.late, r.updates === 0 ? 1 : 0].forEach((n, i) => (found.sums[i] += n));
      teachers.set(r.teacherId, found);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    workbook.created = new Date();
    addSheet(
      workbook,
      "Daily updates",
      [["Day", 12], ["Class", 14], ["Subject", 18], ["Teacher", 20], ["Written by", 20], ["Chapter", 28], ["Taught", 45], ["Homework", 45]],
      log.items.map((e) => [written(e.date), e.classLabel, e.subjectName, e.teacherName ?? "", e.writtenBy, chapterName(e.chapter), e.taught, e.homework])
    );
    addSheet(
      workbook,
      "Subjects",
      [["Class", 14], ["Subject", 18], ["Teacher", 20], ["Chapters done", 15], ["Total chapters", 15], ["Chapters late", 15], ["Running chapter", 28], ["Updates", 10], ["Homework", 11], ["Last update", 13]],
      rows.map((r) => [r.classLabel, r.subjectName, r.teacherName ?? "", finished(r), r.chapters.length, r.late, chapterName(r.current), r.updates, r.homework, written(r.last?.date)])
    );
    addSheet(
      workbook,
      "Chapters",
      [["Class", 14], ["Subject", 18], ["Teacher", 20], ["No.", 6], ["Chapter", 32], ["Finish by", 12], ["Finished on", 13], ["Days taught", 12], ["Status", 13]],
      rows.flatMap((r) => r.chapters.map((c) => [r.classLabel, r.subjectName, r.teacherName ?? "", c.number, c.name, written(c.plannedOn), written(c.completedOn), c.days, status(r, c)]))
    );
    addSheet(
      workbook,
      "Teachers",
      [["Teacher", 24], ["Class subjects", 15], ["Updates", 10], ["Homework", 11], ["Chapters done", 15], ["Total chapters", 15], ["Chapters late", 15], ["Without an update", 18]],
      [...teachers.values()].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.name, ...t.sums])
    );
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `teaching-progress-${slug(tenant?.name ?? "school")}-${todayInIndia()}.xlsx` };
  }
}
