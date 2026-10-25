import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { INDIAN_STATES } from "../../tenants/constants";
import { Tenant } from "../../tenants/models/Tenant";
import { StructureService } from "../../academics/services/structure.service";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Section } from "../../academics/models/Section";
import {
  BLOOD_GROUPS,
  CATEGORIES,
  DISABILITIES,
  GENDERS,
  MAX_IMPORT_ROWS,
  RELIGIONS,
  STUDENT_SHEET_COLUMNS,
  type ExportColumnKey,
  type SheetColumnKey,
  type SheetColumnKind,
} from "../constants";
import { Enrolment } from "../models/Enrolment";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import type { ExportStudentsQuery } from "../schemas/students.schemas";
import { ageOn, todayInIndia } from "../schemas/students.schemas";
import { CapacityService } from "./capacity.service";
import { escapeRegex, NO_ACTIVE_YEAR } from "./shared";
import { StudentSettingsService } from "./settings.service";
import { AcademicYear } from "../../academics/models/AcademicYear";

/** A file to send: its bytes and the name the browser saves it under. */
export interface SheetFile {
  buffer: Buffer;
  fileName: string;
}

/** One student as an export row: every column's value, by its key (the layout picks and orders them). */
export type ExportRow = Record<ExportColumnKey, string | number> & Record<string, string | number>;

const FILLS: Record<SheetColumnKind, string> = { required: "FF92D050", parent: "FF9BC2E6", optional: "FFFFD966" };
const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
/** "2026-05-14" -> "14-05-2016" style: the day as the school writes it. */
const ddmmyyyy = (date: Date) => {
  const iso = date.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
};
/** A column's letters from its number (1 = A, 27 = AA). */
const lettersOf = (column: number): string => {
  let n = column;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};
/** The column letter of a column of the students sheet. */
const letterOf = (key: SheetColumnKey) => lettersOf(STUDENT_SHEET_COLUMNS.findIndex((c) => c.key === key) + 1);

/** Columns whose numbers must keep their digits (a mobile number, a PIN code, an ID): stored as text, never as a number. */
const TEXT_EXPORT_COLUMNS = new Set<ExportColumnKey>([
  "admissionNumber",
  "fatherMobile",
  "motherMobile",
  "guardianMobile",
  "pincode",
  "aadhaarNumber",
  "samagraId",
  "apaarId",
  "pen",
  "srNumber",
  "emergencyMobile",
]);

async function writeBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * The header row of the sample file: bold, coloured by kind (green needed, blue parents, yellow optional), each with its note. Only the
 * five basics are green: a school brings in the students it already has, and an old register seldom holds the rest (the address, the
 * previous school, the IDs...), so what the school made mandatory on Add student does not make a column green here.
 */
function writeHeader(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  STUDENT_SHEET_COLUMNS.forEach((column, i) => {
    const kind = column.kind;
    const cell = row.getCell(i + 1);
    cell.value = kind === "required" ? `${column.header} *` : column.header;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILLS[kind] } };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
    cell.note = column.note;
  });
  row.height = 20;
}

export class SpreadsheetService {
  /**
   * The sample file a school fills in to bring its students in at once. The Students sheet has an instruction line, the coloured
   * column titles with a note on each (green: the five basics every student needs), dropdowns (gender, class, state, blood
   * group, category, religion, disability, yes / no) and text cells for numbers that must keep their digits (mobile numbers, PIN codes,
   * IDs, dates as DD-MM-YYYY). The Classes sheet lists this school's classes with this year's sections and the seats left.
   */
  static async template(tenantId: string): Promise<SheetFile> {
    const [tenant, structure, capacity] = await Promise.all([
      Tenant.findById(tenantId).select("name").lean(),
      StructureService.get(tenantId),
      CapacityService.summary(tenantId),
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    workbook.created = new Date();

    // ---- Students: the sheet that is filled in ----------------------------------------------------------------------
    const sheet = workbook.addWorksheet("Students");
    sheet.columns = STUDENT_SHEET_COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    const last = letterOf(STUDENT_SHEET_COLUMNS[STUDENT_SHEET_COLUMNS.length - 1].key);
    sheet.mergeCells(`A1:${last}1`);
    const instruction = sheet.getCell("A1");
    instruction.value =
      "Green = required | Blue = at least one parent with name and mobile | Yellow = optional | Dates as DD-MM-YYYY | Class as in the Classes sheet | Section when the class has sections | One student per row, from row 3 | Do not change row 2";
    instruction.font = { bold: true, color: { argb: "FFFF0000" } };
    instruction.alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(1).height = 32;
    writeHeader(sheet, 2);
    sheet.views = [{ state: "frozen", ySplit: 2 }];

    // Numbers that are really text (a mobile number, a PIN code, an ID, a day typed as 14-05-2016) are kept as typed.
    const textColumns: SheetColumnKey[] = [
      "admissionNumber",
      "dateOfBirth",
      "admissionDate",
      "fatherMobile",
      "motherMobile",
      "guardianMobile",
      "pincode",
      "tcDate",
      "aadhaarNumber",
      "samagraId",
      "apaarId",
      "pen",
      "srNumber",
      "emergencyMobile",
    ];
    for (const key of textColumns) sheet.getColumn(key).numFmt = "@";

    const classCount = structure.classes.length;
    const lists: { key: SheetColumnKey; formula: string; title: string; message: string }[] = [
      { key: "gender", formula: `"${GENDERS.join(",")}"`, title: "Gender", message: "Pick Male, Female or Other." },
      { key: "bloodGroup", formula: `"${BLOOD_GROUPS.join(",")}"`, title: "Blood group", message: "Pick a blood group from the list, or leave it empty." },
      { key: "category", formula: `"${CATEGORIES.join(",")}"`, title: "Category", message: "Pick a category from the list, or leave it empty." },
      { key: "guardianRelation", formula: `"Guardian,Other"`, title: "Relation", message: "Guardian or Other." },
      { key: "state", formula: `'Lists'!$A$2:$A$${INDIAN_STATES.length + 1}`, title: "State", message: "Pick a state or union territory from the list." },
      { key: "religion", formula: `'Lists'!$B$2:$B$${RELIGIONS.length + 1}`, title: "Religion", message: "Pick a religion from the list, or leave it empty." },
      { key: "disability", formula: `'Lists'!$C$2:$C$${DISABILITIES.length + 1}`, title: "Disability", message: "Pick None or a kind of disability from the list." },
      { key: "rteSeat", formula: `"Yes,No"`, title: "RTE seat", message: "Yes or No." },
      { key: "bpl", formula: `"Yes,No"`, title: "BPL", message: "Yes or No." },
      ...(classCount > 0
        ? [{ key: "className" as const, formula: `'Classes'!$A$2:$A$${classCount + 1}`, title: "Class", message: "Pick a class of your school (see the Classes sheet)." }]
        : []),
    ];
    for (let row = 3; row < 3 + MAX_IMPORT_ROWS; row += 1) {
      for (const list of lists) {
        sheet.getCell(`${letterOf(list.key)}${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [list.formula],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: list.title,
          error: list.message,
        };
      }
    }

    // ---- Classes: what the Class and Section columns may say ---------------------------------------------------------
    const classes = workbook.addWorksheet("Classes");
    classes.columns = [
      { header: "Class", key: "name", width: 18 },
      { header: "Sections this year", key: "sections", width: 28 },
      { header: "Seats left", key: "seats", width: 14 },
    ];
    const loads = new Map(capacity.sections.map((s) => [s.sectionId, s]));
    for (const klass of structure.classes) {
      const left = klass.sections.map((s) => loads.get(s.id)?.seatsLeft).filter((n): n is number => typeof n === "number");
      classes.addRow({
        name: klass.name,
        sections: klass.sections.length ? klass.sections.map((s) => s.name).join(", ") : "No sections: leave Section empty",
        seats: klass.sections.length && left.length ? left.reduce((a, b) => a + b, 0) : "",
      });
    }
    classes.getRow(1).font = { bold: true };
    classes.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILLS.required } };
      cell.border = BORDER;
    });
    classes.views = [{ state: "frozen", ySplit: 1 }];

    // ---- Lists: the values the dropdowns offer ------------------------------------------------------------------------
    const listSheet = workbook.addWorksheet("Lists", { state: "hidden" });
    listSheet.getColumn(1).values = ["State", ...INDIAN_STATES];
    listSheet.getColumn(2).values = ["Religion", ...RELIGIONS];
    listSheet.getColumn(3).values = ["Disability", ...DISABILITIES];
    listSheet.getColumn(1).width = 40;

    // ---- How to fill ----------------------------------------------------------------------------------------------------
    const needed = STUDENT_SHEET_COLUMNS.filter((c) => c.kind === "required").map((c) => c.header);
    const help = workbook.addWorksheet("How to fill");
    help.getColumn(1).width = 120;
    [
      "How to fill the Students sheet",
      "",
      "1. One student per row, starting from row 3. Do not change or move row 2 (the column titles).",
      `2. Green columns are the only ones every student needs: ${needed.join(", ")}.`,
      "3. Blue columns: at least one parent (Father, Mother or Guardian) with a name and a 10-digit mobile number. The first of them with a mobile number becomes the primary contact.",
      "4. A parent who already has a child in your school is found by the mobile number and linked to the new child: brothers and sisters share one parent record.",
      "5. Dates as DD-MM-YYYY, for example 14-05-2016. The student must be 2 to 25 years old on the admission date (empty Admission Date = today).",
      "6. Class exactly as in the Classes sheet. Section is needed when the class has sections this year; leave it empty when the class has none.",
      "7. Everything else is optional here: the address, the previous school, the IDs... Fill what your old register has and leave the rest empty. Add student on the Students page asks for more, for a new admission.",
      "8. Admission No. is optional: fill it to keep the number your school already gave the student, or leave it empty for the next number (ADM-2026-0001).",
      `9. Up to ${MAX_IMPORT_ROWS} students per file. Upload it with Bulk upload on the Students page: you see every row checked before anything is saved.`,
      "10. You can also upload your school's own Excel or CSV file: its columns are recognised by their titles, and you can change any of them on the next screen.",
    ].forEach((line, i) => {
      const cell = help.getCell(`A${i + 1}`);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 14 };
      cell.alignment = { wrapText: true, vertical: "top" };
    });

    return { buffer: await writeBuffer(workbook), fileName: `students-template-${slug(tenant?.name ?? "school")}.xlsx` };
  }

  /**
   * Every student of this academic year (or those the list's filters show: search, class, section) as export rows, in class / section /
   * name order: every column's value, so the layout can pick and order them. The parents go in the Father / Mother / Guardian columns
   * by their relation. `limit` keeps only the first ones (the preview); `total` is how many there are in all.
   */
  static async rows(tenantId: string, query: ExportStudentsQuery, limit?: number): Promise<{ total: number; rows: ExportRow[] }> {
    const school = new Types.ObjectId(tenantId);
    const year = await AcademicYear.findOne({ tenantId: school, status: "active" }).select("_id name").lean();
    if (!year) throw NO_ACTIVE_YEAR();

    const match: Record<string, unknown> = { tenantId: school, academicYearId: year._id, status: "active" };
    if (query.classId) match.classId = new Types.ObjectId(query.classId);
    if (query.sectionId) match.sectionId = query.sectionId === "none" ? null : new Types.ObjectId(query.sectionId);
    const enrolments = await Enrolment.find(match).lean();

    const studentFilter: Record<string, unknown> = { tenantId: school, _id: { $in: enrolments.map((e) => e.studentId) } };
    if (query.q) {
      studentFilter.$or = [
        { nameKey: { $regex: escapeRegex(query.q.toLowerCase().replace(/\s+/g, " ")) } },
        { admissionNumber: { $regex: escapeRegex(query.q.toUpperCase().replace(/\s+/g, "")) } },
      ];
    }
    const students = await Student.find(studentFilter).lean();
    const [guardians, classes, sections, needs] = await Promise.all([
      Guardian.find({ tenantId: school, _id: { $in: students.flatMap((s) => s.guardians.map((g) => g.guardianId)) } }).lean(),
      SchoolClass.find({ tenantId: school, _id: { $in: enrolments.map((e) => e.classId) } }).select("name order").lean(),
      Section.find({ tenantId: school, _id: { $in: enrolments.flatMap((e) => (e.sectionId ? [e.sectionId] : [])) } }).select("name").lean(),
      // The school's own fields: their answers are columns too (a day as DD-MM-YYYY, a tick as Yes / No).
      StudentSettingsService.needs(tenantId),
    ]);
    const guardianById = new Map(guardians.map((g) => [g._id.toString(), g]));
    const classById = new Map(classes.map((c) => [c._id.toString(), c]));
    const sectionById = new Map(sections.map((s) => [s._id.toString(), s.name]));
    const enrolmentOf = new Map(enrolments.map((e) => [e.studentId.toString(), e]));
    const today = new Date(`${todayInIndia()}T00:00:00.000Z`);
    const yes = (v: boolean | undefined) => (v ? "Yes" : "No");

    const all = students.map((s) => {
      const e = enrolmentOf.get(s._id.toString())!;
      const klass = classById.get(e.classId.toString());
      const section = e.sectionId ? (sectionById.get(e.sectionId.toString()) ?? "") : "";
      const linkOf = (relations: string[]) => s.guardians.find((g) => relations.includes(g.relation));
      const father = linkOf(["Father"]);
      const mother = linkOf(["Mother"]);
      const other = linkOf(["Guardian", "Other"]);
      const g = (link: typeof father) => (link ? guardianById.get(link.guardianId.toString()) : undefined);
      const primary = s.guardians.find((link) => link.isPrimary);
      const values: ExportRow = {
        admissionNumber: s.admissionNumber,
        studentName: `${s.firstName} ${s.lastName}`,
        firstName: s.firstName,
        lastName: s.lastName,
        gender: s.gender,
        dateOfBirth: ddmmyyyy(s.dateOfBirth),
        age: ageOn(s.dateOfBirth, today),
        category: s.category ?? "",
        className: klass?.name ?? "",
        sectionName: section,
        rollNumber: e.rollNumber ?? "",
        admissionDate: ddmmyyyy(s.admissionDate),
        fatherName: g(father)?.name ?? "",
        fatherMobile: g(father)?.mobile ?? "",
        fatherOccupation: g(father)?.occupation ?? "",
        motherName: g(mother)?.name ?? "",
        motherMobile: g(mother)?.mobile ?? "",
        motherOccupation: g(mother)?.occupation ?? "",
        guardianName: g(other)?.name ?? "",
        guardianMobile: g(other)?.mobile ?? "",
        guardianRelation: other?.relation ?? "",
        parentEmail: (primary && guardianById.get(primary.guardianId.toString())?.email) ?? "",
        address: s.address?.line1 ?? "",
        area: s.address?.line2 ?? "",
        city: s.address?.city ?? "",
        state: s.address?.state ?? "",
        pincode: s.address?.pincode ?? "",
        bloodGroup: s.bloodGroup ?? "",
        aadhaarNumber: s.aadhaarNumber ?? "",
        samagraId: s.samagraId ?? "",
        apaarId: s.apaarId ?? "",
        pen: s.pen ?? "",
        srNumber: s.srNumber ?? "",
        religion: s.religion ?? "",
        nationality: s.nationality ?? "",
        emergencyMobile: s.emergencyMobile ?? "",
        disability: s.disability ?? "",
        medicalNotes: s.medicalNotes ?? "",
        rteSeat: yes(s.rteSeat),
        bpl: yes(s.bpl),
        feeConcession: s.feeConcession ?? "",
        transportRoute: s.transportRoute ?? "",
        transportStop: s.transportStop ?? "",
        previousSchool: s.previousSchool?.name ?? "",
        lastClass: s.previousSchool?.lastClass ?? "",
        tcNumber: s.previousSchool?.tcNumber ?? "",
        tcDate: s.previousSchool?.tcDate ? ddmmyyyy(s.previousSchool.tcDate) : "",
      };
      const answers = (s.custom ?? {}) as Record<string, string | number | boolean>;
      for (const field of needs.custom) {
        const answer = answers[field.key];
        values[field.key] =
          answer === undefined || answer === null
            ? field.type === "yesNo"
              ? "No"
              : ""
            : field.type === "yesNo"
              ? yes(answer === true)
              : field.type === "date" && typeof answer === "string"
                ? answer.split("-").reverse().join("-")
                : answer === true || answer === false
                  ? yes(answer)
                  : answer;
      }
      return { order: klass?.order ?? 0, section, nameKey: s.nameKey, values };
    });
    all.sort(
      (a, b) =>
        a.order - b.order ||
        a.section.localeCompare(b.section, undefined, { numeric: true }) ||
        a.nameKey.localeCompare(b.nameKey)
    );
    const picked = limit === undefined ? all : all.slice(0, limit);
    return { total: all.length, rows: picked.map((r) => r.values) };
  }

  /**
   * The students the list shows as an Excel file, in the school's own layout (Manage school > Students > Export): its columns, in its
   * order, under its headings. A number that must keep its digits is written as text.
   */
  static async export(tenantId: string, query: ExportStudentsQuery): Promise<SheetFile> {
    const [tenant, settings, { rows }] = await Promise.all([
      Tenant.findById(tenantId).select("name").lean(),
      StudentSettingsService.get(tenantId),
      SpreadsheetService.rows(tenantId, query),
    ]);
    const layout = settings.exportColumns;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    const sheet = workbook.addWorksheet("Students");
    sheet.columns = layout.map((c) => ({ key: c.key, width: Math.min(40, Math.max(10, c.heading.length + 4)) }));
    const header = sheet.getRow(1);
    layout.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.heading;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
      cell.border = BORDER;
      cell.alignment = { vertical: "middle" };
    });
    header.height = 20;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    layout.forEach((c) => {
      if (TEXT_EXPORT_COLUMNS.has(c.key as ExportColumnKey)) sheet.getColumn(c.key).numFmt = "@";
    });
    for (const row of rows) sheet.addRow(Object.fromEntries(layout.map((c) => [c.key, row[c.key]])));

    const today = new Date().toISOString().slice(0, 10);
    return { buffer: await writeBuffer(workbook), fileName: `students-${slug(tenant?.name ?? "school")}-${today}.xlsx` };
  }
}
