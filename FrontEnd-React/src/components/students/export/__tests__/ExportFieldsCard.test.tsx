import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defaultLayout, draftOf } from "../../../../utils/exportLayout";
import { SETTINGS } from "../../../../test/fixtures";
import { ExportFieldsCard } from "../ExportFieldsCard";

const draft = () => draftOf(SETTINGS);
const card = (props: Partial<Parameters<typeof ExportFieldsCard>[0]> = {}) =>
  render(<ExportFieldsCard draft={draft()} problems={{}} onChange={vi.fn()} open onOpenChange={vi.fn()} {...props} />);
/** The row of a column, by the heading it shows (the columns are in two lists side by side: the ones before the middle, and the rest). */
const rowByName = (name: string) => {
  const rows = [...screen.getByRole("list", { name: "Columns" }).querySelectorAll("li"), ...screen.getByRole("list", { name: "More columns" }).querySelectorAll("li")];
  // The heading is the text of the row's "Rename ..." button (also in a row that is out of the file, where the button is dimmed).
  return rows.find((li) => li.querySelector('button[aria-label^="Rename "]')?.textContent?.trim() === name) as HTMLElement;
};

describe("the Excel's columns", () => {
  it("is an accordion on the Export page: the arrow opens and closes it", async () => {
    const onOpenChange = vi.fn();
    card({ open: false, onOpenChange });
    await userEvent.setup().click(screen.getByRole("button", { name: "Show the columns" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("has no arrow when it is not collapsible: the list is always there; it is about the Excel only, so it has no button for a field of its own", () => {
    card({ collapsible: false, open: false });
    expect(screen.queryByRole("button", { name: /the columns$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Columns" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Add your own field/ })).not.toBeInTheDocument();
  });

  it("says how many columns are in the file, and names the card for the Excel", () => {
    card();
    expect(screen.getByRole("region", { name: "Excel columns" })).toBeInTheDocument();
    expect(screen.getByText(/\d+ in the Excel · \d+ out/)).toBeInTheDocument();
    expect(screen.getByText(/The file you download and upload/)).toBeInTheDocument();
  });

  it("says under each heading where the detail belongs (not what Add student calls it: the form is another list)", () => {
    card();
    const group = (name: string) => within(rowByName(name)).getByTestId("column-group").textContent;
    expect(group("Student Name")).toBe("Student");
    expect(group("Father's Name")).toBe("Parents");
    expect(group("City or Village")).toBe("Address");
    expect(group("Aadhaar No.")).toBe("IDs");
    expect(group("Previous School")).toBe("Previous school");
    expect(within(rowByName("Gender")).queryByText(/Add student:/)).not.toBeInTheDocument();
  });

  it("a field of the school's own says so, and its kind: a list says how many choices", () => {
    const own = [
      { key: "c_house1", label: "House", type: "choice" as const, options: ["Red", "Blue"], mode: "required" as const },
      { key: "c_bus001", label: "Bus pass no.", type: "text" as const, options: [], mode: "optional" as const },
    ];
    const base = draftOf({ ...SETTINGS, customFields: own, exportColumns: [...defaultLayout(), { key: "c_house1", heading: "School House" }] });
    card({ draft: base });
    const group = (name: string) => within(rowByName(name)).getByTestId("column-group").textContent;
    expect(group("School House")).toBe("Your own field · List of choices (2)");
    // Out of the file, but still one of the school's own.
    expect(group("Bus pass no.")).toBe("Your own field · Text");
  });

  it("the details every school keeps are in the file and cannot be taken out (the Excel always has them)", () => {
    card();
    for (const name of ["Student Name", "Gender", "Date of Birth", "Age", "Category", "Class", "Section", "Father's Name", "Father's Mobile", "Mother's Name", "Mother's Mobile", "Address", "City or Village", "State", "PIN Code", "Previous School"]) {
      const toggle = within(rowByName(name)).getByRole("switch", { name: `${name} in the Excel` });
      expect(toggle, name).toBeChecked();
      expect(toggle, name).toBeDisabled();
      expect(toggle, name).toHaveAttribute("title", "Always in the Excel");
    }
    // The others can be switched.
    expect(within(rowByName("Religion")).getByRole("switch", { name: "Religion in the Excel" })).toBeEnabled();
    expect(within(rowByName("Blood Group")).getByRole("switch", { name: "Blood Group in the Excel" })).toBeEnabled();
  });

  it("the column of a mandatory detail cannot be taken out either: the switch says to make it optional first", () => {
    card();
    for (const name of ["Father's Occupation", "Area or Landmark", "Last Class"]) {
      const toggle = within(rowByName(name)).getByRole("switch", { name: `${name} in the Excel` });
      expect(toggle, name).toBeChecked();
      expect(toggle, name).toBeDisabled();
      expect(toggle, name).toHaveAttribute("title", expect.stringContaining("Make it optional first"));
    }
    // Optional ones can go (the Aadhaar number is optional for a new school).
    expect(within(rowByName("Aadhaar No.")).getByRole("switch", { name: "Aadhaar No. in the Excel" })).toBeEnabled();
    expect(within(rowByName("Blood Group")).getByRole("switch", { name: "Blood Group in the Excel" })).toHaveAttribute("title", expect.stringContaining("Add student is not changed"));
  });

  it("says in the Mandatory column what Add student does: always (the address), Class 1 to 12 (the previous school), a switch where the school decides and the form asks", () => {
    card();
    const cell = (name: string) => within(rowByName(name));
    for (const name of ["Date of Birth", "First Name", "Gender", "Address", "City or Village", "State", "PIN Code", "Class"]) expect(cell(name).getByText("Always"), name).toBeInTheDocument();
    // The previous school is needed from Class 1 and not before it.
    expect(cell("Previous School").getByText("Class 1–12")).toBeInTheDocument();
    expect(cell("Previous School").getByText("Class 1–12")).toHaveAttribute("title", expect.stringContaining("Nursery, LKG, UKG"));
    // The school decides about these (the form asks them).
    expect(cell("Category").getByRole("switch", { name: "Category mandatory" })).toBeChecked();
    expect(cell("Mother's Name").getByRole("switch", { name: "Mother's Name mandatory" })).toBeChecked();
    expect(cell("Aadhaar No.").getByRole("switch", { name: "Aadhaar No. mandatory" })).not.toBeChecked();
    expect(cell("Blood Group").getByRole("switch", { name: "Blood Group mandatory" })).not.toBeChecked();
    // What the form asks but may be left empty.
    expect(cell("Mother's Mobile").getByText("Optional")).toBeInTheDocument();
    expect(cell("Roll No.").getByText("Optional")).toBeInTheDocument();
    // A detail the form does not ask has nothing to make mandatory: a dash, whether or not the column is in the file.
    expect(cell("Religion").getByText("—")).toBeInTheDocument();
    expect(cell("Samagra ID").getByText("—")).toBeInTheDocument();
    expect(cell("Religion").getByText("—")).toHaveAttribute("title", "Add student does not ask this detail");
  });

  it("Mandatory pressed here is the form's too: the change names the detail, and its columns come into the file", async () => {
    const onChange = vi.fn();
    card({ onChange });
    await userEvent.setup().click(within(rowByName("Blood Group")).getByRole("switch", { name: "Blood Group mandatory" }));
    const next = onChange.mock.calls[0][0] as ReturnType<typeof draft>;
    expect(next.rules.bloodGroup).toBe("required");
    expect(next.rows.find((r) => r.key === "bloodGroup")?.on).toBe(true);
  });

  it("the In Excel switch is about the file only: a column taken out leaves what the form asks as it was", async () => {
    const onChange = vi.fn();
    card({ onChange });
    await userEvent.setup().click(within(rowByName("Blood Group")).getByRole("switch", { name: "Blood Group in the Excel" }));
    const next = onChange.mock.calls[0][0] as ReturnType<typeof draft>;
    expect(next.rows.find((r) => r.key === "bloodGroup")?.on).toBe(false);
    expect(next.rules).toEqual(draft().rules);
  });
});
