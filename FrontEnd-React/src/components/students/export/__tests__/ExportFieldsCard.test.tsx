import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { draftOf } from "../../../../utils/exportLayout";
import { SETTINGS } from "../../../../test/fixtures";
import { ExportFieldsCard } from "../ExportFieldsCard";

const draft = () => draftOf(SETTINGS);
const card = (props: Partial<Parameters<typeof ExportFieldsCard>[0]> = {}) =>
  render(<ExportFieldsCard draft={draft()} problems={{}} onChange={vi.fn()} open onOpenChange={vi.fn()} {...props} />);
/** The row of a field, by the heading it shows (the fields are in two lists side by side: the ones before the middle, and the rest). */
const rowByName = (name: string) => {
  const rows = [...screen.getByRole("list", { name: "Fields" }).querySelectorAll("li"), ...screen.getByRole("list", { name: "More fields" }).querySelectorAll("li")];
  // The heading is the text of the row's "Rename ..." button (also in a row that is off, where the button is dimmed).
  return rows.find((li) => li.querySelector('button[aria-label^="Rename "]')?.textContent?.trim() === name) as HTMLElement;
};

describe("the list of the school's fields", () => {
  it("is an accordion on the Export page: the arrow opens and closes it", async () => {
    const onOpenChange = vi.fn();
    card({ open: false, onOpenChange });
    await userEvent.setup().click(screen.getByRole("button", { name: "Show the fields" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("has no arrow when it is not collapsible (on the Manage fields page): the list is always there", () => {
    card({ collapsible: false, open: false });
    expect(screen.queryByRole("button", { name: /the fields$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Fields" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Add your own field/ })).toBeInTheDocument();
  });

  it("shows two names for every field: its heading in the Excel (the one the school can type over) and what Add student calls it", () => {
    card();
    const line = (name: string) => within(rowByName(name)).getByTestId("form-name").textContent;
    // The student's name is one column in the Excel and two boxes on the form.
    expect(line("Student Name")).toBe("Add student: First name + Last name");
    expect(line("First Name")).toBe("Add student: First name");
    expect(line("Last Name")).toBe("Add student: Last name");
    expect(line("Date of Birth")).toBe("Add student: Date of birth");
    expect(line("Age")).toBe("Add student: shown from the date of birth");
    expect(line("Admission No.")).toBe("Add student: made when you press Admit");
    // The parents: a card each on the form.
    expect(line("Father's Name")).toBe("Add student: Father · Full name");
    expect(line("Father's Mobile")).toBe("Add student: Father · Mobile number");
    expect(line("Mother's Name")).toBe("Add student: Mother · Full name");
    expect(line("Mother's Mobile")).toBe("Add student: Mother · Mobile number");
    expect(line("Father's Occupation")).toBe("Add student: Father · Occupation");
    // The address and the previous school.
    expect(line("Address")).toBe("Add student: House and street");
    expect(line("City or Village")).toBe("Add student: City or village");
    expect(line("PIN Code")).toBe("Add student: PIN code");
    expect(line("Previous School")).toBe("Add student: Previous school · School name");
    expect(line("TC No.")).toBe("Add student: Previous school · TC number");
    expect(line("Aadhaar No.")).toBe("Add student: Aadhaar number");
  });

  it("says 'not asked' for a field that is off and that the school decides about; a field the form always asks keeps its name even when off", () => {
    card();
    const line = (name: string) => within(rowByName(name)).getByTestId("form-name").textContent;
    expect(line("Religion")).toBe("Add student: not asked");
    expect(line("Samagra ID")).toBe("Add student: not asked");
    expect(line("Admission Date")).toBe("Add student: not asked");
    // Roll number and the guardian's boxes are always on the form, whatever the Excel has.
    expect(line("Roll No.")).toBe("Add student: Roll number");
    expect(line("Guardian's Name")).toBe("Add student: Guardian · Full name");
    // The heading the school typed over stays the Excel's name, and the form's name is the same as before.
    expect(line("Gender")).toBe("Add student: Gender");
  });

  it("a field of the school's own says its name on Add student and its kind: a list says how many choices", () => {
    const own = [
      { key: "c_house1", label: "House", type: "choice" as const, options: ["Red", "Blue"], mode: "required" as const },
      { key: "c_bus001", label: "Bus pass no.", type: "text" as const, options: [], mode: "optional" as const },
    ];
    const base = draftOf({ ...SETTINGS, customFields: own, exportColumns: [...SETTINGS.exportColumns, { key: "c_house1", heading: "School House" }] });
    card({ draft: base });
    const line = (name: string) => within(rowByName(name)).getByTestId("form-name").textContent;
    // On: its name on the form; off: not asked.
    expect(line("School House")).toBe("Add student: House · List of choices (2)");
    expect(line("Bus pass no.")).toBe("Add student: not asked · Text");
  });

  it("the details every school keeps are on and cannot be switched off (the Excel always has them)", () => {
    card();
    for (const name of ["Student Name", "Gender", "Date of Birth", "Age", "Category", "Class", "Section", "Father's Name", "Father's Mobile", "Mother's Name", "Mother's Mobile", "Address", "City or Village", "State", "PIN Code", "Previous School"]) {
      const toggle = within(rowByName(name)).getByRole("switch", { name: `${name} on` });
      expect(toggle, name).toBeChecked();
      expect(toggle, name).toBeDisabled();
      expect(toggle, name).toHaveAttribute("title", "Always in the Excel");
    }
    // The others can be switched.
    expect(within(rowByName("Religion")).getByRole("switch", { name: "Religion on" })).toBeEnabled();
    expect(within(rowByName("Blood Group")).getByRole("switch", { name: "Blood Group on" })).toBeEnabled();
  });

  it("says in the Mandatory column what Add student does: always (the address), Class 1 to 12 (the previous school), a switch where the school decides", () => {
    card();
    const cell = (name: string) => within(rowByName(name));
    for (const name of ["Date of Birth", "First Name", "Gender", "Address", "City or Village", "State", "PIN Code", "Class"]) expect(cell(name).getByText("Always"), name).toBeInTheDocument();
    // The previous school is needed from Class 1 and not before it.
    expect(cell("Previous School").getByText("Class 1–12")).toBeInTheDocument();
    expect(cell("Previous School").getByText("Class 1–12")).toHaveAttribute("title", expect.stringContaining("Nursery, LKG, UKG"));
    // The school decides about these.
    expect(cell("Category").getByRole("switch", { name: "Category mandatory" })).toBeChecked();
    expect(cell("Mother's Name").getByRole("switch", { name: "Mother's Name mandatory" })).toBeChecked();
    expect(cell("Aadhaar No.").getByRole("switch", { name: "Aadhaar No. mandatory" })).toBeChecked();
    // What the form asks but may be left empty.
    expect(cell("Mother's Mobile").getByText("Optional")).toBeInTheDocument();
    expect(cell("Roll No.").getByText("Optional")).toBeInTheDocument();
    // Off, and asked by nobody: a dash.
    expect(cell("Religion").getByText("—")).toBeInTheDocument();
    expect(cell("Samagra ID").getByText("—")).toBeInTheDocument();
  });

  it("the On switch of a field the form asks anyway (Roll No.) is about the Excel column only, and says so", () => {
    card();
    expect(within(rowByName("Roll No.")).getByRole("switch", { name: "Roll No. on" })).toHaveAttribute("title", expect.stringMatching(/Excel/));
  });
});
