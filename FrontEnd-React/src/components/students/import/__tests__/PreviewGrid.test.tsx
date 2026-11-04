import { useState } from "react";
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
    { id: "c1", name: "Class 1", order: 1, departmentId: null, capacity: null, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, capacity: null, sections: [{ id: "c6-A", classId: "c6", name: "A", capacity: 30, room: null }] },
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
  const handlers = { onCell: vi.fn(), onRemove: vi.fn(), onColumn: vi.fn(), onMissing: vi.fn(), onAddColumn: vi.fn(), onNewField: vi.fn() };
  render(<PreviewGrid headers={HEADERS} rows={rows} byColumn={byColumn} custom={[HOUSE]} structure={STRUCTURE} {...handlers} {...over} />);
  return { ...handlers, user: userEvent.setup(), rows, byColumn };
}
const box = (title: string, row: number) => screen.getByLabelText(`${title}, row ${row}`, { selector: "input" });
const statusOf = (row: number) => screen.getByRole("list", { name: `Row ${row} needs a fix` });

/** The table with a page's own memory: a kept box changes the row, which is checked again with the real rules (as the import page does). */
function Live({ structure = STRUCTURE }: { structure?: AcademicStructure }) {
  const mapping = autoMap(HEADERS);
  const byColumn: (string | null)[] = fieldsByColumn(mapping, HEADERS.length);
  byColumn[8] = HOUSE.key;
  const [file, setFile] = useState(FILE);
  const rows: GridRow[] = file.map((r) => {
    const p = prepareRow(r, mapping, structure, [{ field: HOUSE, column: 8 }]);
    return { row: r.row, cells: r.cells, problems: p.problems, warnings: p.warnings };
  });
  const onCell = (row: number, column: number, value: string) =>
    setFile((f) => f.map((r) => (r.row === row ? { ...r, cells: r.cells.map((c, i) => (i === column ? value : c)) } : r)));
  return <PreviewGrid headers={HEADERS} rows={rows} byColumn={byColumn} custom={[HOUSE]} structure={structure} onCell={onCell} onRemove={vi.fn()} onColumn={vi.fn()} onMissing={vi.fn()} onAddColumn={vi.fn()} />;
}

/** The table's headings with a page's own memory: a pick changes the column, as the import page does (the new name is shown in the box). */
function Headings({ onColumn }: { onColumn: (column: number, key: string | null) => void }) {
  const [by, setBy] = useState<(string | null)[]>(() => {
    const columns: (string | null)[] = fieldsByColumn(autoMap(HEADERS), HEADERS.length);
    columns[8] = HOUSE.key;
    return columns;
  });
  return (
    <PreviewGrid
      headers={HEADERS}
      rows={[]}
      byColumn={by}
      custom={[HOUSE]}
      structure={STRUCTURE}
      onCell={vi.fn()}
      onRemove={vi.fn()}
      onColumn={(column, key) => {
        onColumn(column, key);
        setBy((now) => now.map((k, i) => (i === column ? key : k)));
      }}
      onMissing={vi.fn()}
      onAddColumn={vi.fn()}
    />
  );
}

describe("a list box is kept the moment it holds one of the choices", () => {
  it("typing a class of the school fixes the row at once, without leaving the box, and the cursor stays in it", async () => {
    const user = userEvent.setup();
    render(<Live />);
    expect(statusOf(6)).toBeInTheDocument();
    await user.clear(box("Class", 6));
    await user.type(box("Class", 6), "class 1");
    // No Tab, no Enter: the red label is gone and the row is Ready.
    expect(screen.queryByRole("list", { name: "Row 6 needs a fix" })).not.toBeInTheDocument();
    expect(box("Class", 6)).toHaveValue("Class 1");
    expect(box("Class", 6)).toHaveFocus();
    expect(box("Class", 6)).not.toHaveAttribute("aria-invalid");
  });

  it("waits while what is typed could still be another class (Class 1 of Class 10), and keeps it when the choice is clear", async () => {
    const user = userEvent.setup();
    const ten = { ...STRUCTURE, classes: [...STRUCTURE.classes, { id: "c10", name: "Class 10", order: 10, departmentId: null, capacity: null, sections: [] }] };
    render(<Live structure={ten} />);
    await user.clear(box("Class", 6));
    await user.type(box("Class", 6), "Class 1");
    // Class 1 is a class, but the person may be going on to Class 10: still red.
    expect(screen.getByRole("list", { name: "Row 6 needs a fix" })).toBeInTheDocument();
    await user.type(box("Class", 6), "0");
    expect(screen.queryByRole("list", { name: "Row 6 needs a fix" })).not.toBeInTheDocument();
    expect(box("Class", 6)).toHaveValue("Class 10");
  });

  it("a word that is none of the choices is kept when the person leaves the box, as before", async () => {
    const user = userEvent.setup();
    render(<Live />);
    await user.clear(box("Class", 6));
    await user.type(box("Class", 6), "Class 7");
    expect(screen.getByRole("list", { name: "Row 6 needs a fix" })).toBeInTheDocument();
    expect(box("Class", 6)).toHaveValue("Class 7");
  });
});

describe("the table of the file", () => {
  it("shows the file's titles, what each column was read as, every cell, and the ready rows", () => {
    setup();
    expect(screen.getByRole("table", { name: "Your file" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /What the column "Class" is$/ })).toHaveValue("Class");
    expect(screen.getByRole("combobox", { name: /What the column "Student Name" is$/ })).toHaveValue("Student name (whole)");
    expect(screen.getByRole("combobox", { name: /What the column "S.No" is$/ })).toHaveValue("Not uploaded");
    expect(screen.getByRole("combobox", { name: /What the column "House" is$/ })).toHaveValue("House (your own)");
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
    // Not one of the school's classes, so it is kept only when the person leaves the box: Escape takes it back.
    await user.type(box("Class", 6), "Class 7{Escape}");
    expect(box("Class", 6)).toHaveValue("Class 9");
    expect(onCell).not.toHaveBeenCalled();
    await user.clear(box("Class", 4));
    await user.type(box("Class", 4), "1{Enter}");
    expect(onCell).toHaveBeenCalledWith(4, 2, "1", false);
    expect(box("Class", 5)).toHaveFocus();
  });

  it("a day column puts its dashes in while typing: 15031998 becomes 15-03-1998, and that is what is kept", async () => {
    const { user, onCell } = setup();
    await user.clear(box("DOB", 4));
    await user.type(box("DOB", 4), "15031998");
    expect(box("DOB", 4)).toHaveValue("15-03-1998");
    await user.tab();
    expect(onCell).toHaveBeenLastCalledWith(4, 5, "15-03-1998", false);
    // Backspace over the dashes works, and another column is not masked.
    await user.type(box("DOB", 5), "{Backspace}");
    expect(box("DOB", 5)).toHaveValue("03-03-201");
    await user.clear(box("Student Name", 4));
    await user.type(box("Student Name", 4), "12-3 Asha");
    expect(box("Student Name", 4)).toHaveValue("12-3 Asha");
  });

  it("scrolling the table stays in the table, and moving to a box never scrolls the page", async () => {
    const { user } = setup();
    const scroller = screen.getByRole("table", { name: "Your file" }).parentElement;
    expect(scroller).toHaveClass("overscroll-contain");
    // `relative`: the screen-reader-only texts inside the rows are clipped with the table. Without it they escape it, and the page gets as
    // tall as the whole table (a long blank page under the buttons).
    expect(scroller).toHaveClass("relative");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await user.click(box("Class", 4));
    await user.keyboard("{Enter}");
    expect(box("Class", 5)).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    focus.mockRestore();
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

  it("a column's heading changes what it is, from the app's dropdown, and shows its new name", async () => {
    const user = userEvent.setup();
    const onColumn = vi.fn();
    render(<Headings onColumn={onColumn} />);
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Roll no." }));
    expect(onColumn).toHaveBeenCalledWith(0, "rollNumber");
    expect(screen.getByRole("combobox", { name: /What the column "S.No" is$/ })).toHaveValue("Roll no.");
    // The list is closed after a pick.
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: /What the column "Class" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Not uploaded" }));
    expect(onColumn).toHaveBeenLastCalledWith(2, null);
    expect(screen.getByRole("combobox", { name: /What the column "Class" is$/ })).toHaveValue("Not uploaded");
  });

  it("a heading's list opens again when the box is clicked after a pick (the box keeps the focus, so only a click can open it)", async () => {
    const user = userEvent.setup();
    render(<Headings onColumn={vi.fn()} />);
    const heading = screen.getByRole("combobox", { name: /What the column "Class" is$/ });
    await user.click(heading);
    await user.click(await screen.findByRole("option", { name: "Not uploaded" }));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(heading).toHaveValue("Not uploaded");
    // The same box, still focused: a click opens the list with every choice again.
    await user.click(heading);
    expect(await screen.findByRole("option", { name: "Class" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Class" }));
    expect(heading).toHaveValue("Class");
  });

  it("opening a heading's list shows every choice (not only the one it has), the chosen one marked", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "Class" is$/ }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(["Not uploaded", "Roll no.", "Class", "Gender", "House (your own)"]));
    expect(names.at(-1)).toBe("Add a new field…");
    expect(screen.getByRole("option", { name: "Class" })).toHaveAttribute("aria-selected", "true");
  });

  it("typing in a heading searches its list: only the choices with those letters stay, and one is picked as before", async () => {
    const { user, onColumn } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("roll");
    expect(await screen.findByRole("option", { name: "Roll no." })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Gender" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Not uploaded" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Roll no." }));
    expect(onColumn).toHaveBeenCalledOnce();
    expect(onColumn).toHaveBeenCalledWith(0, "rollNumber");
  });

  it("a word that is none of the choices offers to add it as a new field, with that word as its name", async () => {
    const { user, onNewField, onColumn } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("Bus route");
    // Nothing matches: only the offer is left.
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Add “Bus route” as a new field"]);
    await user.click(screen.getByRole("option", { name: "Add “Bus route” as a new field" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(0, "Bus route");
    expect(onColumn).not.toHaveBeenCalled();
  });

  it("the offer stays at the end of a search that has matches", async () => {
    const { user, onNewField } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("Fa");
    // Father details match "Fa"; the offer is still the last row.
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names.length).toBeGreaterThan(1);
    expect(names.at(-1)).toBe("Add “Fa” as a new field");
    await user.click(screen.getByRole("option", { name: "Add “Fa” as a new field" }));
    expect(onNewField).toHaveBeenCalledWith(0, "Fa");
  });

  it("with nothing typed, the last row opens the new field with the file's own title for the column as its name", async () => {
    const { user, onNewField } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(0, "S.No");
  });

  it("a word that is already a choice offers no new field of that name (the dialog would refuse it)", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("gender");
    expect(await screen.findByRole("option", { name: "Gender" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /as a new field/ })).not.toBeInTheDocument();
  });

  it("a word the page says is taken gets a note that cannot be picked, not the offer (it would be refused); another name brings the offer back", async () => {
    const taken = (word: string) => (word.trim().toLowerCase() === "age" ? "Age is worked out from the Date of birth, so it is not uploaded." : null);
    const { user, onNewField } = setup({ newFieldProblem: taken });
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("Age");
    const note = await screen.findByRole("option", { name: "Age is worked out from the Date of birth, so it is not uploaded." });
    expect(note).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("option", { name: /as a new field/ })).not.toBeInTheDocument();
    await user.click(note);
    expect(onNewField).not.toHaveBeenCalled();

    await user.keyboard(" in file");
    expect(await screen.findByRole("option", { name: "Add “Age in file” as a new field" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /worked out/ })).not.toBeInTheDocument();
  });

  it("with nothing typed, a heading whose own title is a taken name opens the new field with no name (the person types one)", async () => {
    const { user, onNewField } = setup({ newFieldProblem: (word) => (word === "S.No" ? "S.No is taken." : null) });
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(0, "");
  });

  it("leaving the list without picking changes nothing and puts the heading's own words back", async () => {
    const { user, onColumn, onNewField } = setup();
    const heading = screen.getByRole("combobox", { name: /What the column "S.No" is$/ });
    await user.click(heading);
    await user.keyboard("zzz");
    await user.tab();
    expect(heading).toHaveValue("Not uploaded");
    expect(onColumn).not.toHaveBeenCalled();
    expect(onNewField).not.toHaveBeenCalled();
  });

  it("a table that cannot make fields offers no such row", async () => {
    const { user } = setup({ onNewField: undefined });
    await user.click(screen.getByRole("combobox", { name: /What the column "S.No" is$/ }));
    await user.keyboard("Bus route");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("a problem of the whole row (the same student twice) says itself in Status and points at no box", () => {
    const rows: GridRow[] = [{ row: 7, cells: FILE[0].cells, problems: [{ label: "Row", message: "The same student as row 4", fields: [] }], warnings: [] }];
    setup({ rows });
    const label = within(statusOf(7)).getByRole("button", { name: "Row: The same student as row 4" });
    expect(label).toBeDisabled();
  });

  it("a row whose student is already in the school says so and who they are: it is not Ready and points at no box, and can still be left out", async () => {
    const already = { label: "Already in your school", detail: "Asha Verma · ADM-2026-0001 · Class 1" };
    const { onRemove, user } = setup({ rows: [{ row: 7, cells: FILE[0].cells, problems: [], warnings: [], already }] });
    expect(screen.getByText("Already in your school")).toBeInTheDocument();
    expect(screen.getByText("Asha Verma · ADM-2026-0001 · Class 1")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Row 7 needs a fix" })).not.toBeInTheDocument();
    expect(box("Student Name", 7)).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Leave row 7 out of the upload" }));
    expect(onRemove).toHaveBeenCalledWith(7);
  });

  it("a note on a Ready row (maybe the same student) is shown under Ready, and the row is still ready", () => {
    setup({ rows: [{ row: 7, cells: FILE[0].cells, problems: [], warnings: ["Maybe the same student as Asha Verma (ADM-2026-0001, Class 1)."] }] });
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Maybe the same student as Asha Verma (ADM-2026-0001, Class 1).")).toBeInTheDocument();
  });

  it("an empty row of a typed table waits for a student and is no problem", () => {
    setup({ rows: [{ row: 1, cells: HEADERS.map(() => ""), blank: true, problems: [], warnings: [] }] });
    expect(screen.getByText("Empty: type a student in this row")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });
});
