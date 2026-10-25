import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicStructure } from "../../../../types";
import { columnChoices } from "../../../../utils/studentImport";
import { AddColumnPanel, PreviewToolbar, SameValueOffer } from "../PreviewPanels";

const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [{ id: "c1", name: "Class 1", order: 1, departmentId: null, sections: [] }],
  totals: { departments: 0, classes: 1, sections: 0, seats: 0 },
};
const HOUSE = { key: "c_house1", label: "House", type: "choice" as const, options: ["Red", "Blue"], mode: "optional" as const };

describe('the "+" panel of the table', () => {
  const panel = (choices = columnChoices(["state", "dateOfBirth", "address"], [HOUSE], STRUCTURE)) => {
    const handlers = { onAdd: vi.fn(), onCreate: vi.fn(), onClose: vi.fn() };
    render(<AddColumnPanel choices={choices} {...handlers} />);
    return { ...handlers, user: userEvent.setup() };
  };

  it("adds the first detail empty when nothing else is chosen (its boxes are typed in the table)", async () => {
    const { user, onAdd } = panel();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(onAdd).toHaveBeenCalledWith("state", "");
  });

  it("adds a detail with one value for every row, chosen from its list", async () => {
    const { user, onAdd } = panel();
    await user.click(screen.getByRole("button", { name: /State for every row$/ }));
    await user.click(await screen.findByRole("option", { name: "Madhya Pradesh" }));
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(onAdd).toHaveBeenCalledWith("state", "Madhya Pradesh");
  });

  it("a detail of free text takes what is typed; another detail starts its value again", async () => {
    const { user, onAdd } = panel();
    await user.click(screen.getByRole("button", { name: /The detail of the new column$/ }));
    await user.click(await screen.findByRole("option", { name: "Address" }));
    await user.type(screen.getByLabelText("Address for every row"), "Main Road");
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(onAdd).toHaveBeenCalledWith("address", "Main Road");
  });

  it("offers the school's own fields, and a new field when the one wanted is not there", async () => {
    const { user, onAdd, onCreate, onClose } = panel();
    await user.click(screen.getByRole("button", { name: /The detail of the new column$/ }));
    await user.click(await screen.findByRole("option", { name: "House (your own)" }));
    await user.click(screen.getByRole("button", { name: /House \(your own\) for every row$/ }));
    await user.click(await screen.findByRole("option", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(onAdd).toHaveBeenCalledWith("c_house1", "Blue");
    await user.click(screen.getByRole("button", { name: "Not in the list? Create a new field of your own" }));
    expect(onCreate).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says so when every detail already has a column, and still offers a new field", () => {
    panel([]);
    expect(screen.getByText("Every detail already has a column.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add column" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not in the list? Create a new field of your own" })).toBeInTheDocument();
  });
});

describe("the same change for the other rows", () => {
  it("names the value, the column and how many rows, and changes them all or none", async () => {
    const onApply = vi.fn();
    const onDismiss = vi.fn();
    render(<SameValueOffer heading="Class" from="Class 9" to="Class 8" rows={2} onApply={onApply} onDismiss={onDismiss} />);
    expect(screen.getByText(/2 more rows have/)).toHaveTextContent('2 more rows have "Class 9" in Class. Change them to "Class 8" too?');
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Change all 2" }));
    expect(onApply).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("speaks of one row and of an empty box plainly", () => {
    render(<SameValueOffer heading="Sec" from="" to="A" rows={1} onApply={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/1 more row has/)).toHaveTextContent('1 more row has an empty box in Sec. Change it to "A" too?');
    expect(screen.getByRole("button", { name: "Change it" })).toBeInTheDocument();
  });
});

describe("the tabs above the table", () => {
  it("count the rows, switch the view, and offer the rows to fix only when there are some", async () => {
    const onFilter = vi.fn();
    const onDownloadProblems = vi.fn();
    const { rerender } = render(<PreviewToolbar filter="all" onFilter={onFilter} counts={{ all: 14, bad: 7, good: 7 }} onDownloadProblems={onDownloadProblems} />);
    expect(screen.getByRole("tab", { name: "All rows 14" })).toHaveAttribute("aria-selected", "true");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Need a fix 7" }));
    expect(onFilter).toHaveBeenCalledWith("bad");
    await user.click(screen.getByRole("button", { name: "Rows to fix (CSV)" }));
    expect(onDownloadProblems).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Add 10 rows" })).not.toBeInTheDocument();

    const onAddRows = vi.fn();
    rerender(<PreviewToolbar filter="good" onFilter={onFilter} counts={{ all: 10, bad: 0, good: 10 }} onDownloadProblems={onDownloadProblems} onAddRows={onAddRows} />);
    expect(screen.queryByRole("button", { name: "Rows to fix (CSV)" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add 10 rows" }));
    expect(onAddRows).toHaveBeenCalledOnce();
  });
});
