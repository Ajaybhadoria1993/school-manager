import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomFieldDef } from "../../../../constants/studentFields";
import type { AcademicStructure } from "../../../../types";
import { autoMap, fieldsByColumn, prepareRow } from "../../../../utils/studentImport";
import { PreviewGrid, type GridRow } from "../PreviewGrid";

const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, sections: [{ id: "c6-A", classId: "c6", name: "A", capacity: 30, room: null }] },
  ],
  totals: { departments: 0, classes: 2, sections: 1, seats: 30 },
};
const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };

const HEADERS = ["S.No", "Student Name", "Class", "Sec", "Gender", "DOB", "Father Name", "Mobile No", "House", "Address", "City", "State", "PIN", "Previous School"];
/** Every row has the address and the school it comes from (the details every school needs), so only what a test is about is wrong. */
const HOME = ["12 MG Road", "Bhopal", "MP", "462001", "Little Flower School"];
const FILE = [
  { row: 4, cells: ["1", "Asha Verma", "Class 1", "", "F", "14-05-2016", "Ravi Verma", "9876543210", "Red", ...HOME] },
  // Class 6 has sections and none is given; the class itself is right.
  { row: 5, cells: ["2", "Sara Khan", "6", "", "F", "03-03-2015", "Imran Khan", "9866677788", "", ...HOME] },
  // No such class.
  { row: 6, cells: ["3", "Meera Joshi", "Class 9", "", "F", "01-01-2012", "Kiran Joshi", "9844455566", "", ...HOME] },
];

/** The table as the page gives it: each row prepared with the real rules, its column details from the real mapping. */
function setup(over: Partial<Parameters<typeof PreviewGrid>[0]> = {}) {
  const mapping = autoMap(HEADERS);
  const byColumn: (string | null)[] = fieldsByColumn(mapping, HEADERS.length);
  byColumn[8] = HOUSE.key;
  const rows: GridRow[] = FILE.map((r) => {
    const p = prepareRow(r, mapping, STRUCTURE, [{ field: HOUSE, column: 8 }]);
    return { row: r.row, cells: r.cells, problems: p.problems, warnings: p.warnings };
  });
  const handlers = { onCell: vi.fn(), onRemove: vi.fn(), onColumn: vi.fn(), onMissing: vi.fn(), onAddColumn: vi.fn() };
  render(<PreviewGrid headers={HEADERS} rows={rows} byColumn={byColumn} custom={[HOUSE]} structure={STRUCTURE} {...handlers} {...over} />);
  return { ...handlers, user: userEvent.setup(), rows, byColumn };
}
const box = (title: string, row: number) => screen.getByLabelText(`${title}, row ${row}`, { selector: "input" });
const statusOf = (row: number) => screen.getByRole("list", { name: `Row ${row} needs a fix` });

describe("the table of the file", () => {
  it("shows the file's titles, what each column was read as, every cell, and the ready rows", () => {
    setup();
    expect(screen.getByRole("table", { name: "Your file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /What the column "Class" is$/ })).toHaveTextContent("Class");
    expect(screen.getByRole("button", { name: /What the column "Student Name" is$/ })).toHaveTextContent("Student name (whole)");
    expect(screen.getByRole("button", { name: /What the column "S.No" is$/ })).toHaveTextContent("Not uploaded");
    expect(screen.getByRole("button", { name: /What the column "House" is$/ })).toHaveTextContent("House (your own)");
    expect(box("Student Name", 4)).toHaveValue("Asha Verma");
    expect(box("DOB", 4)).toHaveAttribute("placeholder", "DD-MM-YYYY");
    expect(screen.getAllByText("Ready")).toHaveLength(1);
    // No native dropdown: the headings use the app's one Select (React Aria keeps a hidden one for forms, out of sight and of reach).
    expect([...document.querySelectorAll("select")].filter((s) => !s.closest("[aria-hidden=true]"))).toHaveLength(0);
  });

  it("a box that needs a fix is red and says under it what is wrong; the class box stays fine when only the section is missing", () => {
    setup();
    const section = box("Sec", 5);
    expect(section).toHaveAttribute("aria-invalid", "true");
    expect(section.parentElement).toHaveTextContent("Class 6 has sections A: type one");
    expect(box("Class", 5)).not.toHaveAttribute("aria-invalid");
    expect(box("Class", 6)).toHaveAttribute("aria-invalid", "true");
    expect(box("Class", 6).parentElement).toHaveTextContent('Your school has no "Class 9": type one of your classes');
  });

  it("a label in Status takes the person to its box", async () => {
    const { user } = setup();
    await user.click(within(statusOf(5)).getByRole("button", { name: /^Section/ }));
    expect(box("Sec", 5)).toHaveFocus();
    await user.click(within(statusOf(6)).getByRole("button", { name: /^Class/ }));
    expect(box("Class", 6)).toHaveFocus();
  });

  it("a label whose detail has no column asks the page to add it", async () => {
    const mapping = autoMap(HEADERS);
    const byColumn: (string | null)[] = fieldsByColumn(mapping, HEADERS.length);
    // The Sec column was set to Not uploaded.
    byColumn[3] = null;
    const { user, onMissing } = setup({ byColumn });
    await user.click(within(statusOf(5)).getByRole("button", { name: /^Section/ }));
    expect(onMissing).toHaveBeenCalledWith("sectionName", 5);
  });

  it("a box is changed in place: the change is kept when the person leaves it, with whether it needed a fix", async () => {
    const { user, onCell } = setup();
    await user.click(box("Sec", 5));
    await user.keyboard("A");
    await user.tab();
    expect(onCell).toHaveBeenCalledWith(5, 3, "A", true);
    await user.clear(box("Student Name", 4));
    await user.type(box("Student Name", 4), "Asha Rani Verma");
    await user.tab();
    expect(onCell).toHaveBeenLastCalledWith(4, 1, "Asha Rani Verma", false);
  });

  it("Enter keeps the change and goes down to the same column; Escape puts the box back and keeps nothing", async () => {
    const { user, onCell } = setup();
    await user.clear(box("Class", 6));
    await user.type(box("Class", 6), "Class 1{Escape}");
    expect(box("Class", 6)).toHaveValue("Class 9");
    expect(onCell).not.toHaveBeenCalled();
    await user.clear(box("Class", 4));
    await user.type(box("Class", 4), "1{Enter}");
    expect(onCell).toHaveBeenCalledWith(4, 2, "1", false);
    expect(box("Class", 5)).toHaveFocus();
  });

  it("the list columns suggest their values: the school's classes, its own field's choices", () => {
    setup();
    const classes = document.getElementById(box("Class", 4).getAttribute("list")!);
    expect([...classes!.querySelectorAll("option")].map((o) => o.value)).toEqual(["Class 1", "Class 6"]);
    const houses = document.getElementById(box("House", 4).getAttribute("list")!);
    expect([...houses!.querySelectorAll("option")].map((o) => o.value)).toEqual(["Red", "Blue"]);
  });

  it("the bin leaves a row out, and the + at the end adds a column", async () => {
    const { user, onRemove, onAddColumn } = setup();
    await user.click(screen.getByRole("button", { name: "Leave row 6 out of the upload" }));
    expect(onRemove).toHaveBeenCalledWith(6);
    await user.click(screen.getByRole("button", { name: "Add a column" }));
    expect(onAddColumn).toHaveBeenCalledOnce();
  });

  it("a column's heading changes what it is, from the app's dropdown", async () => {
    const { user, onColumn } = setup();
    await user.click(screen.getByRole("button", { name: /What the column "S.No" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Roll no." }));
    expect(onColumn).toHaveBeenCalledWith(0, "rollNumber");
    await user.click(screen.getByRole("button", { name: /What the column "Class" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Not uploaded" }));
    expect(onColumn).toHaveBeenLastCalledWith(2, null);
  });

  it("a problem of the whole row (the same student twice) says itself in Status and points at no box", () => {
    const rows: GridRow[] = [{ row: 7, cells: FILE[0].cells, problems: [{ label: "Row", message: "The same student as row 4", fields: [] }], warnings: [] }];
    setup({ rows });
    const label = within(statusOf(7)).getByRole("button", { name: "Row: The same student as row 4" });
    expect(label).toBeDisabled();
  });

  it("an empty row of a typed table waits for a student and is no problem", () => {
    setup({ rows: [{ row: 1, cells: HEADERS.map(() => ""), blank: true, problems: [], warnings: [] }] });
    expect(screen.getByText("Empty: type a student in this row")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });
});
