import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { Subject } from "../../subjects/models/Subject";
import type { SheetFile } from "../../students/services/spreadsheet.service";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { Tenant } from "../../tenants/models/Tenant";
import { TEACHER_SHEET_COLUMNS } from "../constants";
import type { ListTeachersQuery } from "../schemas/staff.schemas";
import { TeacherService, type TeacherDto } from "./teacher.service";
import { TeacherSettingsService } from "./teacherSettings.service";

const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
/** Titles the sample file has and a file of the teachers the school keeps has not: a password is never kept (only its hash is). */
const NOT_EXPORTED = new Set(["password"]);
/** Columns that only say more about the teacher (an upload does not read them). */
const EXTRAS = [
  { key: "status", header: "Status", width: 11 },
  { key: "classTeacherOf", header: "Class teacher of", width: 24 },
  { key: "given", header: "Classes given", width: 30 },
] as const;
const EMPLOYMENT: Record<string, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract" };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
/** "1988-07-14" -> "14-07-1988": the day as the school writes it (and as the sample file asks for it). */
const ddmmyyyy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class TeacherExportService {
  /**
   * The teachers the list shows (its tab, search and filters, as the school admin sees them) as one Excel file. The first columns are those
   * of the sample file for a bulk upload, with the same titles, so the file can be uploaded back; the last three say more (who has left,
   * the classes they look after and were given). Every box is text: a mobile number, a PIN code or a code keeps its digits.
   */
  static async export(tenantId: string, query: ListTeachersQuery): Promise<SheetFile> {
    const [tenant, { items }, settings] = await Promise.all([Tenant.findById(tenantId).select("name").lean(), TeacherService.list(tenantId, query), TeacherSettingsService.get(tenantId)]);
    // The school's own fields (the ones it asks), after the usual columns an upload reads: they are read back by their titles.
    const own = settings.customFields.filter((f) => f.mode !== "hidden");
    const teachers = items as TeacherDto[];
    const subjectIds = [...new Set(teachers.flatMap((t) => t.subjectIds))].map((id) => new Types.ObjectId(id));
    const subjects = subjectIds.length > 0 ? await Subject.find({ tenantId: new Types.ObjectId(tenantId), _id: { $in: subjectIds } }).select("name").lean() : [];
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Teachers");
    const columns = [
      ...TEACHER_SHEET_COLUMNS.filter((c) => !NOT_EXPORTED.has(c.key)).map((c) => ({ key: c.key, header: c.header, width: c.width, extra: false })),
      ...own.map((f) => ({ key: f.key, header: f.label, width: Math.max(16, Math.min(30, f.label.length + 6)), extra: false })),
      ...EXTRAS.map((c) => ({ ...c, extra: true }))];
    sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
    const header = sheet.getRow(1);
    columns.forEach((column, i) => {
      const cell = header.getCell(i + 1);
      cell.value = column.header;
      cell.font = { bold: true };
      // The columns an upload reads are blue-grey; the ones that only say more are grey.
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.extra ? "FFEDEDED" : "FFD9E1F2" } };
      cell.border = BORDER;
      cell.alignment = { vertical: "middle" };
    });
    header.height = 20;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

    for (const t of teachers) {
      const given = t.load.sections > 0 ? `${plural(t.load.sections, "class", "classes")} · ${plural(t.load.periodsAllotted, "period", "periods")} a week` : "";
      const values: Record<string, string | number> = {
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
      for (const f of own) {
        const answer = t.custom[f.key];
        if (answer === undefined || answer === null || answer === "") values[f.key] = "";
        else if (f.type === "date") values[f.key] = ddmmyyyy(String(answer));
        else if (f.type === "yesNo") values[f.key] = answer === true ? "Yes" : "No";
        else values[f.key] = typeof answer === "number" ? answer : String(answer);
      }
      const row = sheet.addRow(columns.map((c) => values[c.key]));
      // Text, never a number or a day: a mobile number, a PIN code or a code (007) keeps every digit.
      row.eachCell((cell) => {
        if (typeof cell.value === "string") cell.numFmt = "@";
      });
    }
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), fileName: `teachers-${slug(tenant?.name ?? "school")}-${todayInIndia()}.xlsx` };
  }
}
