import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { Subject } from "../../subjects/models/Subject";
import type { SheetFile } from "../../students/services/spreadsheet.service";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Tenant } from "../../tenants/models/Tenant";
import { TEACHER_EXPORT_COLUMNS, TEACHER_SAMPLE_ROW, TEACHER_SHEET_COLUMNS } from "../constants";
import { Teacher } from "../models/Teacher";
import type { ListTeachersQuery } from "../schemas/staff.schemas";
import { TeacherService, type TeacherDto } from "./teacher.service";
import { TeacherSettingsService } from "./teacherSettings.service";

const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const EMPLOYMENT: Record<string, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract" };
/** The columns that only say more about the teacher: an upload does not read them (they are grey, the others blue-grey). */
const EXTRA_KEYS = new Set(TEACHER_EXPORT_COLUMNS.filter((c) => c.extra).map((c) => c.key));
const EXTRA_WIDTHS: Record<string, number> = { status: 11, classTeacherOf: 24, given: 30 };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
/** "1988-07-14" -> "14-07-1988": the day as the school writes it (and as the sample file asks for it). */
const ddmmyyyy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One teacher as a row: every column's value by its key (the school's layout picks and orders them). */
export type TeacherExportRow = Record<string, string | number>;
export interface TeacherExportRows {
  total: number;
  rows: TeacherExportRow[];
  /** The school has no teacher at all: the one row is a sample, only for trying the file. */
  sample?: true;
}

const widthOf = (key: string, heading: string) =>
  EXTRA_WIDTHS[key] ?? TEACHER_SHEET_COLUMNS.find((c) => c.key === key)?.width ?? Math.max(16, Math.min(30, heading.length + 6));

export class TeacherExportService {
  /**
   * The teachers the list shows (its tab, search and filters, as the school admin sees them) as export rows: every column's value, so the
   * school's layout can pick and order them. `limit` keeps the first ones (the preview); `total` is how many there are in all. A school with
   * no teacher at all (not a search or a filter that finds nobody) gets one sample row, so the file can be seen and tried before the first
   * teacher is added.
   */
  static async rows(tenantId: string, query: ListTeachersQuery, limit?: number): Promise<TeacherExportRows> {
    const [{ items }, settings] = await Promise.all([TeacherService.list(tenantId, query), TeacherSettingsService.get(tenantId)]);
    const teachers = items as TeacherDto[];
    if (teachers.length === 0) {
      const filtered = Object.entries(query).some(([key, value]) => key !== "status" && value !== undefined && value !== "");
      if (!filtered && (await Teacher.countDocuments({ tenantId: new Types.ObjectId(tenantId) })) === 0) return { total: 0, rows: [{ ...TEACHER_SAMPLE_ROW }], sample: true };
      return { total: 0, rows: [] };
    }
    const subjectIds = [...new Set(teachers.flatMap((t) => t.subjectIds))].map((id) => new Types.ObjectId(id));
    const subjects = subjectIds.length > 0 ? await Subject.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: subjectIds } }).select("name").lean() : [];
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));

    const rows = (limit === undefined ? teachers : teachers.slice(0, limit)).map((t): TeacherExportRow => {
      const given = t.load.sections > 0 ? `${plural(t.load.sections, "class", "classes")} · ${plural(t.load.periodsAllotted, "period", "periods")} a week` : "";
      const values: TeacherExportRow = {
        name: t.name,
        mobile: t.mobile ?? "",
        gender: t.gender ?? "",
        dateOfBirth: ddmmyyyy(t.dateOfBirth),
        email: t.email ?? "",
        address: t.address.line1 ?? "",
        city: t.address.city ?? "",
        state: t.address.state ?? "",
        pincode: t.address.pincode ?? "",
        employeeCode: t.employeeCode ?? "",
        designation: t.designation ?? "",
        qualification: t.qualification ?? "",
        experienceYears: t.experienceYears ?? "",
        joiningDate: ddmmyyyy(t.joiningDate),
        employmentType: t.employmentType ? EMPLOYMENT[t.employmentType] : "",
        subjects: t.subjectIds.map((id) => subjectName.get(id) ?? "").filter(Boolean).sort((a, b) => a.localeCompare(b)).join(", "),
        username: t.login?.username ?? "",
        status: t.isActive ? "Teaching" : "Left",
        classTeacherOf: t.classTeacherOf.join(", "),
        given,
      };
      for (const f of settings.customFields) {
        const answer = t.custom[f.key];
        if (answer === undefined || answer === null || answer === "") values[f.key] = "";
        else if (f.type === "date") values[f.key] = ddmmyyyy(String(answer));
        else if (f.type === "yesNo") values[f.key] = answer === true ? "Yes" : "No";
        else values[f.key] = typeof answer === "number" ? answer : String(answer);
      }
      return values;
    });
    return { total: teachers.length, rows };
  }

  /**
   * The teachers the list shows as one Excel file, in the school's own layout (Teacher > Export): its columns, in its order, under its
   * headings. Every box is text: a mobile number, a PIN code or a code keeps its digits. A school with no teacher yet gets the headings and
   * one sample row.
   */
  static async export(tenantId: string, query: ListTeachersQuery): Promise<SheetFile> {
    const [tenant, settings, { rows }] = await Promise.all([Tenant.findById(tenantId).select("name").lean(), TeacherSettingsService.get(tenantId), TeacherExportService.rows(tenantId, query)]);
    const layout = settings.exportColumns;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Teachers");
    sheet.columns = layout.map((c) => ({ key: c.key, width: widthOf(c.key, c.heading) }));
    const header = sheet.getRow(1);
    layout.forEach((column, i) => {
      const cell = header.getCell(i + 1);
      cell.value = column.heading;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXTRA_KEYS.has(column.key) ? "FFEDEDED" : "FFD9E1F2" } };
      cell.border = BORDER;
      cell.alignment = { vertical: "middle" };
    });
    header.height = 20;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: layout.length } };

    for (const values of rows) {
      const row = sheet.addRow(layout.map((c) => values[c.key] ?? ""));
      // Text, never a number or a day: a mobile number, a PIN code or a code (007) keeps every digit.
      row.eachCell((cell) => {
        if (typeof cell.value === "string") cell.numFmt = "@";
      });
    }
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `teachers-${slug(tenant?.name ?? "school")}-${todayInIndia()}.xlsx` };
  }
}
