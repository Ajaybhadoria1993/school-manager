import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { CLASSES, STRUCTURE, classOverviewFor } from "../../../test/schoolClass";
import { ALLOTMENT, DEV, ENGLISH, GRID, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { ClassOverview, GridView } from "../../../types";
import SchoolClassTimetablePage from "../SchoolClassTimetable";

/**
 * A class's Timetable & teachers page (`/school-class/:classId/timetable`): only this class (or one of its sections): its class teacher,
 * its subjects and teachers, its week as it is placed, and its school timing. The week is shown, not changed here (Edit timetable opens
 * the timetable on this class).
 */

const WITH_HEAD: ClassOverview[] = CLASSES.map((c) =>
  c.id === "c5" ? { ...c, sections: c.sections.map((s) => (s.id === "c5-A" ? { ...s, classTeacher: { id: "meena", name: "Meena Singh" } } : s)) } : c
);

/** Class 5 - A's week, published: Maths (Meena) on Monday period 1, English (no teacher yet) on Tuesday period 2 in Room 5A. */
const PLACED: GridView = {
  ...GRID,
  exists: true,
  status: "published",
  cells: [
    { day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: null }] },
    { day: 2, period: 2, lessons: [{ subjectId: "english", teacherId: null, room: "Room 5A" }] },
  ],
};

function openPage(path: string, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query, WITH_HEAD),
    "GET /timetable/grid": () => PLACED,
    "GET /subjects/allotments": () => ALLOTMENT,
    "GET /staff/teachers": () => ({ items: [MEENA, DEV] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school-class/:classId", element: <p>The class</p> },
      { path: "/school-class/:classId/timetable", element: <SchoolClassTimetablePage /> },
    ],
    { initialEntries: [path] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const gridCalls = (calls: Call[]) => calls.filter((c) => c.path === "/timetable/grid");

describe("a class's Timetable & teachers page", () => {
  it("has the plain header (title, breadcrumb back to the class) and asks for this section's week once", async () => {
    const { calls } = openPage("/school-class/c5/timetable?section=c5-A");
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("href", "/school-class");
    expect(screen.getByRole("link", { name: "Class 5" })).toHaveAttribute("href", "/school-class/c5?section=c5-A");
    await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(gridCalls(calls)).toHaveLength(1);
    expect(gridCalls(calls)[0].query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("Edit timetable (2026-11-07) is on the right of the Week heading, not in the page header", async () => {
    openPage("/school-class/c5/timetable?section=c5-A");
    const week = await screen.findByRole("region", { name: "Week" });
    const link = within(week).getByRole("link", { name: "Edit timetable" });
    expect(link).toHaveAttribute("href", "/school/timetable?tab=classes&class=c5&section=c5-A");
    // The same line as the heading and its Published badge, the link last (right edge).
    const line = within(week).getByRole("heading", { name: "Week" }).parentElement!.parentElement!;
    expect(line).toContainElement(link);
    expect(line.lastElementChild).toBe(link);
    expect(screen.getAllByRole("link", { name: "Edit timetable" })).toHaveLength(1);
  });

  it("shows four numbers: the class teacher (N/A when none), the subjects, the periods a week and the school day", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    openPage("/school-class/c5/timetable?section=c5-A");
    const tiles = await screen.findByRole("region", { name: "About Class 5 - A" });
    await waitFor(() => expect(tiles).toHaveTextContent(/Class teacher\s*Meena Singh.*Subjects\s*2.*Periods a week\s*11.*School day\s*08:30 to 14:20/));
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class/c5/timetable?section=c5-B");
    expect(await screen.findByRole("region", { name: "About Class 5 - B" })).toHaveTextContent(/Class teacher\s*N\/A/);
  });

  it("shows the week as it is placed, each period with its subject and teacher; nothing in it can be pressed", async () => {
    openPage("/school-class/c5/timetable?section=c5-A");
    const week = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(within(week).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Period", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(within(week).getByRole("cell", { name: /Mathematics.*Meena Singh/ })).toBeInTheDocument();
    expect(within(week).getByRole("cell", { name: /English.*No teacher.*Room 5A/ })).toBeInTheDocument();
    expect(within(week).getByText("Lunch")).toBeInTheDocument();
    expect(within(week).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("says the school timing of each kind of day", async () => {
    openPage("/school-class/c5/timetable?section=c5-A");
    const timing = await screen.findByRole("region", { name: "Timing" });
    expect(timing).toHaveTextContent("Monday to Friday");
    expect(timing).toHaveTextContent("08:30 to 14:20");
    expect(timing).toHaveTextContent("8 periods");
    expect(timing).toHaveTextContent("Lunch 10:30 to 11:00");
  });

  it("a class with sections can switch section; each is its own week", async () => {
    const { calls, user, router } = openPage("/school-class/c5/timetable?section=c5-A");
    await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    await user.click(screen.getByRole("link", { name: "Section B" }));
    await waitFor(() => expect(router.state.location.search).toBe("?section=c5-B"));
    await waitFor(() => expect(gridCalls(calls).at(-1)?.query).toBe("?classId=c5&sectionId=c5-B"));
    expect(screen.getByRole("link", { name: "Section B" })).toHaveAttribute("aria-current", "page");
  });

  it("a week with no timing yet says so, with the way to set it", async () => {
    openPage("/school-class/c1/timetable", { "GET /timetable/grid": () => ({ ...GRID, days: [], cells: [] }) });
    expect(await screen.findByText("No school timing yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set the school timing" })).toHaveAttribute("href", "/school/timetable?tab=timings");
  });

  it("a class that is not in the school says so", async () => {
    openPage("/school-class/nope/timetable");
    expect(await screen.findByRole("heading", { name: "This class is not in your school" })).toBeInTheDocument();
  });
});

describe("the week gives way on an exam day (2026-11-06)", () => {
  const EXAM_WEEK = {
    label: "Class 5 - A",
    items: [],
    week: {
      from: "2026-09-14",
      to: "2026-09-20",
      days: [
        {
          date: "2026-09-15",
          day: 2,
          replacesLessons: true,
          schoolHours: { start: "08:00", end: "12:30" },
          exams: [{ id: "e1", name: "Half-Yearly Exam", typeLabel: "Half-yearly exam", full: true }],
          papers: [{ id: "p1", subject: { id: "maths", name: "Mathematics" }, date: "2026-09-15", startTime: "09:00", endTime: "10:00", durationMinutes: 60, topic: null, maxMarks: 50 }],
        },
      ],
    },
  };

  it("shows the exam in place of that day's lessons, and reads this section's exams once", async () => {
    const { calls } = openPage("/school-class/c5/timetable?section=c5-A", { "GET /exams/class": () => EXAM_WEEK });
    const table = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    const cell = await within(table).findByRole("cell", { name: "Half-Yearly Exam" });
    expect(cell).toHaveTextContent("No regular lessons");
    expect(within(table).queryByText("English")).not.toBeInTheDocument(); // Tuesday's lesson is off, Monday's Maths stays
    expect(within(table).getByText("Mathematics", { selector: "span.text-xs" })).toBeInTheDocument();
    const reads = calls.filter((c) => c.path === "/exams/class");
    expect(reads).toHaveLength(1);
    expect(reads[0].query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("if the exams cannot be read the week shows as it is placed", async () => {
    openPage("/school-class/c5/timetable?section=c5-A");
    const table = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(within(table).getByText("English")).toBeInTheDocument();
  });
});
