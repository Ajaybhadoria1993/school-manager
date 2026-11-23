import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomFieldDef } from "../../../../constants/studentFields";
import { autoMapTeachers, prepareTeacherRow, takenTeacherFieldNote, teacherFieldsByColumn } from "../../../../utils/teacherImport";
import { TeacherPreviewGrid, type TeacherGridRow } from "../TeacherPreviewGrid";

// The file an export of the school's teachers comes back as: Status, Class teacher of and Classes given are not details a file can give.
const HEADERS = ["Name *", "Mobile *", "Status", "Class teacher of", "Classes given", "Bus pass"];
const FILE = [{ row: 2, cells: ["Aarav Sharma", "9876543210", "Teaching", "", "", ""] }];
const HOBBY: CustomFieldDef = { key: "c_hobby001", label: "Hobby", type: "text", options: [], mode: "optional" };

function setup(over: Partial<Parameters<typeof TeacherPreviewGrid>[0]> = {}) {
  const mapping = autoMapTeachers(HEADERS);
  const byColumn = teacherFieldsByColumn(mapping, HEADERS.length);
  const rows: TeacherGridRow[] = FILE.map((r) => {
    const p = prepareTeacherRow(r, mapping, null);
    return { row: r.row, cells: r.cells, problems: p.problems, warnings: p.warnings };
  });
  const handlers = { onCell: vi.fn(), onRemove: vi.fn(), onColumn: vi.fn(), onMissing: vi.fn(), onNewField: vi.fn() };
  render(<TeacherPreviewGrid headers={HEADERS} rows={rows} byColumn={byColumn} own={[HOBBY]} {...handlers} {...over} />);
  return { ...handlers, user: userEvent.setup() };
}
const heading = (title: string) => screen.getByRole("combobox", { name: new RegExp(`What the column "${title}" is$`) });

describe("a heading of the teachers' table is a list that can be searched by typing", () => {
  it("is a box that shows what the column was read as, and says Not uploaded for a column that is no detail", () => {
    setup();
    expect(heading("Name \\*")).toHaveValue("Name");
    expect(heading("Class teacher of")).toHaveValue("Not uploaded");
  });

  it("typing in it narrows the list to the details with those letters, and picking one reads the column as it", async () => {
    const { user, onColumn } = setup();
    await user.click(heading("Class teacher of"));
    await user.keyboard("desig");
    expect(await screen.findByRole("option", { name: "Designation" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Qualification" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Designation" }));
    expect(onColumn).toHaveBeenCalledExactlyOnceWith(3, "designation");
  });

  it("a word that is none of the details offers to add it as a new field, named as typed, and the column is not changed", async () => {
    const { user, onNewField, onColumn } = setup();
    await user.click(heading("Class teacher of"));
    await user.keyboard("Class teacher");
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Add “Class teacher” as a new field"]);
    await user.click(screen.getByRole("option", { name: "Add “Class teacher” as a new field" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(3, "Class teacher");
    expect(onColumn).not.toHaveBeenCalled();
  });

  it("opening it with nothing typed shows every detail and ends in a row that makes a field of the file's own title", async () => {
    const { user, onNewField } = setup({ newFieldProblem: (word) => takenTeacherFieldNote(word, [HOBBY]) });
    await user.click(heading("Bus pass"));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names.at(-1)).toBe("Add a new field…");
    expect(names).toEqual(expect.arrayContaining(["Not uploaded", "Name", "Mobile", "Hobby (your own)"]));
    await user.click(screen.getByRole("option", { name: "Add a new field…" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(5, "Bus pass");
  });

  it("with nothing typed, a column whose own title is a name that is taken (an export's Class teacher of) opens the new field with no name", async () => {
    const { user, onNewField } = setup({ newFieldProblem: (word) => takenTeacherFieldNote(word, [HOBBY]) });
    await user.click(heading("Class teacher of"));
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    expect(onNewField).toHaveBeenCalledExactlyOnceWith(3, "");
  });

  it("a name that cannot be a field says why in the list instead of offering it", async () => {
    const { user, onNewField } = setup({ newFieldProblem: (word) => takenTeacherFieldNote(word, [HOBBY]) });
    await user.click(heading("Class teacher of"));
    await user.keyboard("Class teacher of");
    const note = await screen.findByRole("option", { name: /Class teacher of.*another name/ });
    expect(note).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("option", { name: /as a new field/ })).not.toBeInTheDocument();
    await user.click(note);
    expect(onNewField).not.toHaveBeenCalled();
  });

  it("a page that cannot make fields offers no such row", async () => {
    const { user } = setup({ onNewField: undefined });
    await user.click(heading("Class teacher of"));
    await user.keyboard("Class teacher");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("leaving the list without picking changes nothing and puts the heading's own words back", async () => {
    const { user, onColumn, onNewField } = setup();
    const box = heading("Class teacher of");
    await user.click(box);
    await user.keyboard("zzz");
    await user.tab();
    expect(box).toHaveValue("Not uploaded");
    expect(onColumn).not.toHaveBeenCalled();
    expect(onNewField).not.toHaveBeenCalled();
  });

  it("the box shows the new name once the page reads the column as a field of the school's own", async () => {
    function Live() {
      const [by, setBy] = useState<(string | null)[]>(() => teacherFieldsByColumn(autoMapTeachers(HEADERS), HEADERS.length));
      const [fields, setFields] = useState<CustomFieldDef[]>([]);
      return (
        <TeacherPreviewGrid
          headers={HEADERS}
          rows={[]}
          byColumn={by}
          own={fields}
          onCell={vi.fn()}
          onRemove={vi.fn()}
          onColumn={vi.fn()}
          onMissing={vi.fn()}
          onNewField={(column, title) => {
            const field: CustomFieldDef = { key: "c_class0001", label: title, type: "text", options: [], mode: "optional" };
            setFields([field]);
            setBy((now) => now.map((k, i) => (i === column ? field.key : k)));
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Live />);
    await user.click(heading("Class teacher of"));
    await user.keyboard("Class teacher");
    await user.click(await screen.findByRole("option", { name: "Add “Class teacher” as a new field" }));
    expect(heading("Class teacher of")).toHaveValue("Class teacher (your own)");
  });
});
