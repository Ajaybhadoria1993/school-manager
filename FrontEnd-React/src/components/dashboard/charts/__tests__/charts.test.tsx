import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { BarList } from "../BarList";
import { Columns } from "../Columns";
import { SegmentBar } from "../SegmentBar";

/**
 * The three small charts of the dashboard, drawn with plain HTML: a tall bar split into segments, a list of horizontal bars and a row of
 * columns. Each draws its marks in proportion, says every number in words (a tooltip and a table for screen readers), and never draws an
 * empty chart.
 */

afterEach(cleanup);

const widthOf = (el: Element | null) => (el as HTMLElement).style.width;
const heightOf = (el: Element | null) => (el as HTMLElement).style.height;

describe("the segmented bar", () => {
  const parts = [
    { key: "present", label: "Present", value: 3, color: "#0ca30c" },
    { key: "absent", label: "Absent", value: 1, color: "#d03b3b" },
    { key: "leave", label: "Leave", value: 0, color: "#2a78d6" },
  ];

  it("gives each segment its share of the bar", () => {
    const { container } = render(<SegmentBar label="Children" segments={parts} />);
    expect(widthOf(container.querySelector('[data-segment="present"]'))).toBe("75%");
    expect(widthOf(container.querySelector('[data-segment="absent"]'))).toBe("25%");
  });

  it("draws no segment for 0, but the legend still says it", () => {
    const { container } = render(<SegmentBar label="Children" segments={parts} />);
    expect(container.querySelector('[data-segment="leave"]')).toBeNull();
    const group = screen.getByRole("group", { name: "Children" });
    expect(within(group).getByText("Leave 0")).toBeInTheDocument();
    expect(within(group).getByText("Present 3")).toBeInTheDocument();
  });

  it("says each segment in a tooltip, with its share", () => {
    render(<SegmentBar label="Children" segments={parts} />);
    expect(screen.getByText("Present: 3 of 4 (75%)")).toBeInTheDocument();
  });

  it("with nothing to split it draws an empty track, not segments", () => {
    const { container } = render(<SegmentBar label="Children" segments={parts.map((p) => ({ ...p, value: 0 }))} />);
    expect(container.querySelectorAll("[data-segment]")).toHaveLength(0);
    expect(container.querySelector("[data-empty]")).not.toBeNull();
  });
});

describe("the bar list", () => {
  const rows = [
    { key: "c1", label: "Class 1", value: 50 },
    { key: "c2", label: "Class 2", value: 100 },
  ];

  it("draws each bar in proportion to the longest", () => {
    const { container } = render(<BarList title="Students by class" rows={rows} unit={["student", "students"]} />);
    expect(widthOf(container.querySelector('[data-bar="c2"]'))).toBe("100%");
    expect(widthOf(container.querySelector('[data-bar="c1"]'))).toBe("50%");
  });

  it("says each row in a tooltip with its share of all, singular or plural", () => {
    render(<BarList title="Students by class" rows={[...rows, { key: "c3", label: "Class 3", value: 1 }]} unit={["student", "students"]} />);
    expect(screen.getByText("Class 2: 100 students (66%)")).toBeInTheDocument();
    expect(screen.getByText("Class 3: 1 student (1%)")).toBeInTheDocument();
  });

  it("has a table of the same numbers for a screen reader", () => {
    render(<BarList title="Students by class" rows={rows} unit={["student", "students"]} />);
    const table = screen.getByRole("table", { name: "Students by class" });
    expect(within(table).getByRole("row", { name: /Class 2.*100/ })).toBeInTheDocument();
  });
});

describe("the columns", () => {
  const rows = [
    { key: "2026-09", label: "Sep", value: 9, tip: "September 2026: 9 admissions" },
    { key: "2026-10", label: "Oct", value: 3, tip: "October 2026: 3 admissions" },
    { key: "2026-11", label: "Nov", value: 0, tip: "November 2026: 0 admissions" },
  ];

  it("draws each column as tall as its share of the highest", () => {
    const { container } = render(<Columns title="Admissions by month" rows={rows} />);
    expect(heightOf(container.querySelector('[data-column="2026-09"]'))).toBe("100%");
    expect(heightOf(container.querySelector('[data-column="2026-10"]'))).toBe("33.3333%");
  });

  it("draws no column for 0, but names the month on the axis and in the tooltip", () => {
    const { container } = render(<Columns title="Admissions by month" rows={rows} />);
    expect(container.querySelector('[data-column="2026-11"]')).toBeNull();
    // On the axis, and again as the row of the table for a screen reader.
    expect(screen.getAllByText("Nov")).toHaveLength(2);
    expect(screen.getByText("November 2026: 0 admissions")).toBeInTheDocument();
  });

  it("writes the number over the highest column only (not over every one)", () => {
    const { container } = render(<Columns title="Admissions by month" rows={rows} />);
    expect(container.querySelectorAll("[data-value-label]")).toHaveLength(1);
    expect(container.querySelector("[data-value-label]")).toHaveTextContent("9");
  });
});
