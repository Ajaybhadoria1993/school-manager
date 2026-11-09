import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { GRID } from "../../../test/timetableFixtures";
import type { ExamDay, GridView } from "../../../types";
import { ClassWeekView } from "../ClassWeekView";

/** The class timetable gives way on exam days (2026-11-06): a day of a full exam shows the exam in place of its lessons, a test goes on top. */

const VIEW: GridView = {
  ...GRID,
  cells: [
    { day: 2, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] },
    { day: 3, period: 1, lessons: [{ subjectId: "english", teacherId: null, room: null }] },
    { day: 4, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] },
  ],
};

const day = (over: Partial<ExamDay> = {}): ExamDay => ({
  date: "2026-09-16",
  day: 3,
  replacesLessons: true,
  schoolHours: { start: "08:00", end: "12:30" },
  exams: [{ id: "e1", name: "Half-Yearly Exam", typeLabel: "Half-yearly exam", full: true }],
  papers: [{ id: "p1", subject: { id: "maths", name: "Mathematics" }, date: "2026-09-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, topic: "Fractions", maxMarks: 50 }],
  ...over,
});

const show = (examDays?: ExamDay[]) => {
  render(<ClassWeekView view={VIEW} label="Class 5 - A" examDays={examDays} />);
  return screen.getByRole("table", { name: "Weekly timetable of Class 5 - A" });
};

afterEach(() => cleanup());

describe("a week with no exam", () => {
  it("shows every lesson as it is placed", () => {
    const table = show();
    expect(within(table).getAllByText("Mathematics")).toHaveLength(2);
    expect(within(table).getByText("English")).toBeInTheDocument();
    expect(screen.queryByText("Exam")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Exam days outside the timetable" })).not.toBeInTheDocument();
  });

  it("an empty list of exam days is the same", () => {
    const table = show([]);
    expect(within(table).getAllByText("Mathematics")).toHaveLength(2);
  });
});

describe("a day of a full exam", () => {
  it("takes the place of that day's lessons: the exam, its paper and time, the school's hours; the other days keep their lessons", () => {
    const table = show([day()]);
    expect(within(table).queryByText("English")).not.toBeInTheDocument(); // Wednesday's lesson is off
    expect(within(table).getAllByText("Mathematics").length).toBeGreaterThanOrEqual(2); // Tuesday's and Thursday's lessons, and the paper
    const card = within(table).getByRole("cell", { name: /Half-Yearly Exam/ });
    expect(card).toHaveTextContent("Mathematics");
    expect(card).toHaveTextContent("9:00 AM to 10:00 AM");
    expect(card).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(card).toHaveTextContent("No regular lessons");
    expect(card).toHaveAttribute("rowspan");
  });

  it("marks the day's heading, and the breaks of the other days shrink to the days that have lessons", () => {
    const table = show([day()]);
    expect(within(within(table).getByRole("columnheader", { name: /Wednesday/ })).getByText("Exam")).toBeInTheDocument();
    const lunch = within(table).getByText("Lunch").closest("tr")!;
    expect(within(lunch).getAllByRole("cell").map((c) => c.getAttribute("colspan"))).toEqual(["2", "2"]);
  });

  it("two papers on the day are both listed in time order", () => {
    const table = show([
      day({
        papers: [
          { id: "p2", subject: { id: "english", name: "English" }, date: "2026-09-16", startTime: "11:00", endTime: "12:00", durationMinutes: 60, topic: null, maxMarks: null },
          { id: "p1", subject: { id: "maths", name: "Mathematics" }, date: "2026-09-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, topic: null, maxMarks: null },
        ],
      }),
    ]);
    const card = within(table).getByRole("cell", { name: /Half-Yearly Exam/ });
    const items = within(card).getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Mathematics");
    expect(items[1]).toContain("English");
  });

  it("a school day with no school hours given says nothing about hours", () => {
    const table = show([day({ schoolHours: null })]);
    expect(within(table).getByRole("cell", { name: /Half-Yearly Exam/ })).not.toHaveTextContent("School ");
  });
});

describe("a test on a day that runs as usual", () => {
  const test = day({
    date: "2026-09-17",
    day: 4,
    replacesLessons: false,
    schoolHours: null,
    exams: [{ id: "e2", name: "Class test 1", typeLabel: "Class test", full: false }],
    papers: [{ id: "p9", subject: { id: "english", name: "English" }, date: "2026-09-17", startTime: "13:00", endTime: "13:40", durationMinutes: 40, topic: null, maxMarks: 20 }],
  });

  it("keeps the day's lessons and puts the test in the day's heading", () => {
    const table = show([test]);
    expect(within(table).getAllByText("Mathematics")).toHaveLength(2);
    const heading = within(table).getByRole("columnheader", { name: /Thursday/ });
    expect(heading).toHaveTextContent("Test");
    expect(heading).toHaveTextContent("English 1:00 PM");
  });
});

describe("an exam day with no column in the timetable", () => {
  it("is listed under the week: a Saturday paper of a school that has Monday to Friday", () => {
    const saturday = day({ date: "2026-09-19", day: 6 });
    show([saturday]);
    const list = screen.getByRole("list", { name: "Exam days outside the timetable" });
    expect(within(list).getByRole("listitem")).toHaveTextContent("Sat, 19 Sep");
    expect(list).toHaveTextContent("Half-Yearly Exam");
    expect(list).toHaveTextContent("Mathematics 9:00 AM to 10:00 AM");
  });
});
