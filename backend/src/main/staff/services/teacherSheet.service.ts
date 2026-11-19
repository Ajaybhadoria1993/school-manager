import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { Subject } from "../../subjects/models/Subject";
import type { SheetFile } from "../../students/services/spreadsheet.service";
import type { FieldMode } from "../../students/constants";
import { INDIAN_STATES } from "../../tenants/constants";
import { Tenant } from "../../tenants/models/Tenant";
import { TeacherSettingsService } from "./teacherSettings.service";
import { MAX_TEACHER_IMPORT_ROWS, TEACHER_DESIGNATIONS, TEACHER_GENDERS, TEACHER_SHEET_COLUMNS, type TeacherSheetColumn } from "../constants";

const FILLS: Record<TeacherSheetColumn["kind"], string> = { required: "FF92D050", optional: "FFFFD966" };
const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";

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

/** Columns whose numbers must keep their digits (a mobile number, a PIN code, a code) or whose day is typed as 14-05-1988: text, never a number. */
const TEXT_COLUMNS = ["mobile", "pincode", "employeeCode", "dateOfBirth", "joiningDate"];

/** The days of the Employment Type column as the sample file words them (the screen turns them into the server's words). */
const EMPLOYMENT_WORDS = ["Full time", "Part time", "Contract"];

export class TeacherSheetService {
  /**
   * The sample file a school fills in to bring its teachers in at once, like the students' one. The Teachers sheet has an instruction
   * line, the coloured column titles with a note on each (green: the name and the mobile number, which every teacher needs; yellow:
   * optional), dropdowns (gender, state, designation, employment type) and text cells for numbers that must keep their digits. The
   * Subjects sheet lists this school's subjects (a name that is not there is added when the file is uploaded).
   */
  static async template(tenantId: string): Promise<SheetFile> {
    const [tenant, subjects, settings] = await Promise.all([
      Tenant.findById(tenantId).select("name").lean(),
      Subject.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).select("name").lean(),
      TeacherSettingsService.get(tenantId),
    ]);
    // What the school needs follows into the file: a detail it needs is a green column (with its star), one it does not ask has no column.
    const rules = settings.fields as Record<string, FieldMode>;
    const usual = TEACHER_SHEET_COLUMNS.filter((c) => rules[c.key] !== "hidden").map((c): TeacherSheetColumn => (rules[c.key] === "required" ? { ...c, kind: "required" } : c));
    // The school's own fields (the ones it asks) come after the usual columns, as optional ones, with their kind in the note.
    const own = settings.customFields.filter((f) => f.mode !== "hidden");
    const columns: TeacherSheetColumn[] = [
      ...usual,
      ...own.map((f): TeacherSheetColumn => ({ key: f.key, header: f.label, kind: "optional", width: Math.max(16, Math.min(30, f.label.length + 6)), note: `Your own field: ${f.label}.${f.mode === "required" ? " Your school asks for it." : ""}${f.type === "date" ? " DD-MM-YYYY." : f.type === "number" ? " A number." : f.type === "yesNo" ? " Yes or No." : f.type === "choice" ? " Pick from the list." : ""}` })),
    ];
    const letterOf = (key: string) => lettersOf(columns.findIndex((c) => c.key === key) + 1);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EduShiksha";
    workbook.created = new Date();

    // ---- Teachers: the sheet that is filled in ----------------------------------------------------------------------
    const sheet = workbook.addWorksheet("Teachers");
    sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));
    const last = lettersOf(columns.length);
    sheet.mergeCells(`A1:${last}1`);
    const instruction = sheet.getCell("A1");
    instruction.value =
      "Green = required | Yellow = optional | Dates as DD-MM-YYYY | Subjects separated by commas | One teacher per row, from row 3 | Do not change row 2 | Leave Username and Password empty to have them made";
    instruction.font = { bold: true, color: { argb: "FFFF0000" } };
    instruction.alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(1).height = 32;
    const header = sheet.getRow(2);
    columns.forEach((column, i) => {
      const cell = header.getCell(i + 1);
      cell.value = column.kind === "required" ? `${column.header} *` : column.header;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILLS[column.kind] } };
      cell.border = BORDER;
      cell.alignment = { vertical: "middle" };
      cell.note = column.note;
    });
    header.height = 20;
    sheet.views = [{ state: "frozen", ySplit: 2 }];
    const has = (key: string) => columns.some((c) => c.key === key);
    for (const key of [...TEXT_COLUMNS, ...own.filter((f) => f.type === "text" || f.type === "date").map((f) => f.key)]) if (has(key)) sheet.getColumn(letterOf(key)).numFmt = "@";

    const lists: { key: string; formula: string; title: string; message: string; strict: boolean }[] = [
      { key: "gender", formula: `"${TEACHER_GENDERS.join(",")}"`, title: "Gender", message: "Pick Male, Female or Other.", strict: true },
      { key: "state", formula: `'Lists'!$A$2:$A$${INDIAN_STATES.length + 1}`, title: "State", message: "Pick a state or union territory from the list.", strict: true },
      // The posts of a school are many: the list suggests, anything else may be typed.
      { key: "designation", formula: `'Lists'!$B$2:$B$${TEACHER_DESIGNATIONS.length + 1}`, title: "Designation", message: "Pick a post from the list, or type your own.", strict: false },
      { key: "employmentType", formula: `"${EMPLOYMENT_WORDS.join(",")}"`, title: "Employment type", message: "Pick Full time, Part time or Contract.", strict: true },
      // A list of the school's own, or a yes / no (a list longer than Excel allows inline has no dropdown: the note says to pick from it).
      ...own.flatMap((f) => {
        const formula = f.type === "yesNo" ? "\"Yes,No\"" : f.type === "choice" ? `"${f.options.join(",")}"` : null;
        return formula && formula.length <= 250 ? [{ key: f.key, formula, title: f.label, message: f.type === "yesNo" ? "Yes or No." : `Pick ${f.label} from the list.`, strict: true }] : [];
      }),
    ];
    const shownLists = lists.filter((list) => has(list.key));
    for (let row = 3; row < 3 + MAX_TEACHER_IMPORT_ROWS; row += 1) {
      for (const list of shownLists) {
        sheet.getCell(`${letterOf(list.key)}${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [list.formula],
          showErrorMessage: list.strict,
          errorStyle: "stop",
          errorTitle: list.title,
          error: list.message,
        };
      }
    }

    // ---- Subjects: what the Subjects column may name ----------------------------------------------------------------------
    const names = subjects.map((s) => s.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const subjectSheet = workbook.addWorksheet("Subjects");
    subjectSheet.columns = [{ header: "Subjects of your school", key: "name", width: 34 }];
    for (const name of names) subjectSheet.addRow({ name });
    subjectSheet.getRow(1).font = { bold: true };
    subjectSheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILLS.required } };
      cell.border = BORDER;
    });
    subjectSheet.views = [{ state: "frozen", ySplit: 1 }];

    // ---- Lists: the values the dropdowns offer ------------------------------------------------------------------------------
    const listSheet = workbook.addWorksheet("Lists", { state: "hidden" });
    listSheet.getColumn(1).values = ["State", ...INDIAN_STATES];
    listSheet.getColumn(2).values = ["Designation", ...TEACHER_DESIGNATIONS];
    listSheet.getColumn(1).width = 40;
    listSheet.getColumn(2).width = 34;

    // ---- How to fill ----------------------------------------------------------------------------------------------------------
    const needed = columns.filter((c) => c.kind === "required").map((c) => c.header);
    const help = workbook.addWorksheet("How to fill");
    help.getColumn(1).width = 120;
    [
      "How to fill the Teachers sheet",
      "",
      "1. One teacher per row, starting from row 3. Do not change or move row 2 (the column titles).",
      `2. Green columns are the only ones every teacher needs: ${needed.join(", ")}. Everything else is optional: fill what your register has.`,
      "3. Every teacher gets a login to sign in with (the web page now, the mobile app later), so the 10-digit mobile number is needed. Teachers already in your school (the same mobile number) are skipped, so the same file can be uploaded again safely.",
      "4. Username and Password: leave them empty and a username is made from the name (meena.singh_41) with a password of 10 characters. After the upload you can download the list of usernames and passwords: the passwords are shown that one time only. Fill them to choose your own (a username is one on the whole platform; a password has 8 to 72 characters with an uppercase letter, a lowercase letter, a number and a symbol).",
      "5. Dates as DD-MM-YYYY, for example 14-05-1988. A teacher must be 18 to 75 years old.",
      "6. Subjects: the names the teacher can teach, separated by commas (Mathematics, Science). A subject that is not in the Subjects sheet is added to your school when the file is uploaded.",
      "7. Designation, Qualification and Employment Type (Full time, Part time, Contract) are for your records and the teacher's page.",
      ...(own.length > 0 ? [`8. The last ${own.length === 1 ? "column is" : `${own.length} columns are`} your school's own field${own.length === 1 ? "" : "s"} (${own.map((f) => f.label).join(", ")}): they are read by their titles, so do not rename them.`] : []),
    ].forEach((line) => help.addRow([line]));
    help.getRow(1).font = { bold: true, size: 13 };

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: `teachers-template-${slug(tenant?.name ?? "school")}.xlsx` };
  }
}
