import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ClassOverview } from "../../../types";
import { ClassOverviewCard } from "../ClassOverviewCard";
import { DepartmentPanel } from "../DepartmentPanel";

/**
 * A class card and a department panel of the Classes page, after the user's reference (2026-11-04): a picture for the early classes and
 * the usual departments, the number for a numbered class, and the class's seat limit (its sections' seats added up, or its own).
 */

const klass = (name: string, over: Partial<ClassOverview> = {}): ClassOverview => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  departmentId: "d1",
  departmentName: "Pre-Primary",
  students: 0,
  seats: 0,
  seatsLeft: 0,
  percent: 0,
  sections: [],
  classTeacher: null,
  ...over,
});

const section = (id: string, capacity: number, enrolled: number) => ({ id, name: id, room: null, capacity, enrolled, seatsLeft: capacity - enrolled, state: "open" as const, percent: Math.round((enrolled / capacity) * 100), classTeacher: null });

function cards(list: ClassOverview[]) {
  render(
    <MemoryRouter>
      <ul>
        {list.map((c, i) => (
          <ClassOverviewCard key={c.id} overview={c} index={i} />
        ))}
      </ul>
    </MemoryRouter>
  );
}
const cardOf = (name: string) => screen.getByRole("heading", { name: new RegExp(`^${name}:`) }).closest("li")!;
const iconOf = (name: string) => cardOf(name).querySelector("[data-icon]")?.getAttribute("data-icon") ?? null;

afterEach(cleanup);

describe("a class card's mark", () => {
  it("is a picture for the early classes, like the reference: a rocking horse, a bear, ABC blocks, a star", () => {
    cards([klass("Pre-Nursery"), klass("Nursery"), klass("LKG"), klass("UKG")]);
    expect(iconOf("Pre-Nursery")).toBe("rocking-horse");
    expect(iconOf("Nursery")).toBe("bear");
    expect(iconOf("LKG")).toBe("abc-blocks");
    expect(iconOf("UKG")).toBe("star");
  });

  it("is the number for a numbered class", () => {
    cards([klass("Class 3")]);
    expect(iconOf("Class 3")).toBeNull();
    expect(cardOf("Class 3").querySelector("span[aria-hidden]")).toHaveTextContent("3");
  });
});

describe("a class card's seats", () => {
  it("a class without sections: its own limit (40), and the bar fills by its students (10 of 40 = 25%)", () => {
    cards([klass("Class 1", { students: 10, seats: 40, seatsLeft: 30, percent: 25 })]);
    const card = cardOf("Class 1");
    expect(card).toHaveTextContent("10 Students");
    expect(card).toHaveTextContent("40 Seats");
    expect(within(card).getByRole("progressbar", { name: "Seats of Class 1 filled" })).toHaveAttribute("aria-valuenow", "25");
    expect(card).toHaveTextContent("25%");
  });

  it("a class with 3 sections of 40: the limit is 120, whatever the number of sections", () => {
    cards([klass("Class 6", { students: 60, seats: 120, seatsLeft: 60, percent: 50, sections: [section("A", 40, 20), section("B", 40, 20), section("C", 40, 20)] })]);
    const card = cardOf("Class 6");
    expect(card).toHaveTextContent("3 Sections");
    expect(card).toHaveTextContent("120 Seats");
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("no limit set: no seats and no bar", () => {
    cards([klass("Class 9", { students: 4 })]);
    expect(cardOf("Class 9")).not.toHaveTextContent("Seat");
    expect(within(cardOf("Class 9")).queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

describe("a department panel's picture", () => {
  it("is ABC blocks for Pre-Primary and an open book for Primary, like the reference", () => {
    render(
      <MemoryRouter>
        <DepartmentPanel name="Pre-Primary" departmentId="d1" tone="primary" classes={[klass("LKG")]} />
        <DepartmentPanel name="Primary" departmentId="d2" tone="success" classes={[klass("Class 1")]} />
      </MemoryRouter>
    );
    // The panel's top comes before its cards, so its picture is the first one in it.
    const tileOf = (name: string) => screen.getByRole("region", { name }).querySelector("[data-icon]");
    expect(tileOf("Pre-Primary")?.getAttribute("data-icon")).toBe("abc-blocks");
    expect(tileOf("Primary")?.getAttribute("data-icon")).toBe("open-book");
  });
});
