import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DoneCard, FileBar } from "../ImportPanels";

const FILE = { name: "students.xlsx", size: 84202 };

describe("the bar above the table", () => {
  it("says how many rows are ready, how many need a fix and how many are students the school already has", () => {
    render(<FileBar file={FILE} sheetName="Students" rows={500} ready={308} toFix={42} already={150} onChangeFile={vi.fn()} />);
    expect(screen.getByText(/500 rows/)).toHaveTextContent("Students · 500 rows · 308 ready · 42 need a fix · 150 already in your school");
  });

  it("leaves out what there is none of", () => {
    render(<FileBar file={FILE} sheetName="" rows={1} ready={1} toFix={0} onChangeFile={vi.fn()} />);
    expect(screen.getByText(/1 row/)).toHaveTextContent("1 row · 1 ready");
    expect(screen.queryByText(/already/)).not.toBeInTheDocument();
  });
});

describe("the end of the upload", () => {
  const done = (props: Partial<Parameters<typeof DoneCard>[0]> = {}) =>
    render(
      <MemoryRouter>
        <DoneCard admitted={3} notAdmitted={0} linked={0} year="2026-2027" onFix={vi.fn()} onDownloadProblems={vi.fn()} onAnother={vi.fn()} {...props} />
      </MemoryRouter>
    );

  it("says that the rows of students already in the school were not admitted again, and that they need no fix", () => {
    done({ already: 150 });
    expect(screen.getByText("3 students admitted to 2026-2027")).toBeInTheDocument();
    expect(screen.getByText("150 rows were already in your school: they were not admitted again.")).toBeInTheDocument();
    expect(screen.getByText("Every other row of the file was admitted.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fix the/ })).not.toBeInTheDocument();
  });

  it("one row already in the school, and rows still to fix beside them", () => {
    done({ already: 1, notAdmitted: 2 });
    expect(screen.getByText("1 row was already in your school: it was not admitted again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix the 2 rows" })).toBeInTheDocument();
  });

  it("is as before when no row was already there", () => {
    done();
    expect(screen.getByText("Every row of the file was admitted.")).toBeInTheDocument();
    expect(screen.queryByText(/already in your school/)).not.toBeInTheDocument();
  });
});
