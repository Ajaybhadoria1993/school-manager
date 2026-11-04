import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ImportRowsTable, type ViewRow } from "../ImportRowsTable";

const row = (n: number, status: ViewRow["status"], over: Partial<ViewRow> = {}): ViewRow => ({
  row: n,
  name: `Student ${n}`,
  admissionNumber: null,
  classLabel: "Class 1",
  parentLabel: "Ravi · 9876543210",
  status,
  problems: [],
  warnings: [],
  ...over,
});
const show = (rows: ViewRow[]) =>
  render(
    <MemoryRouter>
      <ImportRowsTable rows={rows} goodLabel="Admitted" badLabel="Not admitted" />
    </MemoryRouter>
  );

describe("the rows after an upload", () => {
  it("a row already in the school is no failure: its own tab, who they are, and the Not admitted count leaves it out", async () => {
    show([
      row(2, "admitted"),
      row(3, "failed", { problems: [{ label: "Class", message: "Pick a class", fields: ["className"] }] }),
      row(4, "already", { already: { label: "Already in your school", detail: "Asha Verma · ADM-2026-0001 · Class 1" } }),
    ]);
    expect(screen.getByRole("tab", { name: /^Not admitted\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Already in school\s*1$/ })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /^Already in school\s*1$/ }));
    // The status is in the table twice (under the name on a phone, in its own column from a tablet up).
    expect(screen.getAllByText("Already in your school").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Asha Verma · ADM-2026-0001 · Class 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Student 3")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^All rows\s*3$/ }));
    expect(screen.getByText("Student 4")).toBeInTheDocument();
  });

  it("has no such tab when no row was already there", () => {
    show([row(2, "admitted"), row(3, "failed", { problems: [{ label: "Class", message: "Pick a class", fields: [] }] })]);
    expect(screen.queryByRole("tab", { name: /Already in school/ })).not.toBeInTheDocument();
  });
});
