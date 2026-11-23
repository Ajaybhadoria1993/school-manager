import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { signInAs, signOut } from "../../../test/session";
import { todayInIndia } from "../../../utils/students";
import type { AttendanceStatus, StudentsDay, StudentsDayGroup, UserRole } from "../../../types";
import StudentAttendancePage from "../StudentAttendance";

/**
 * Attendance > Student, the school's page: ONE day of EVERY class (2026-11-22, asked for: "saari class ke saare students dikhe, class upar, niche
 * bacche; search karun to har class ke bacche aa jayen; filter se ek class"). The classes in teaching order, each a card with its children and
 * the four marks (fixed: the school only looks); at the side the summary of the day. One line of controls: the day with a left and a right arrow,
 * the Class (All classes to start with), the Section, the search and the Register link. The search is the server's, asked once the typing stops.
 */

const today = todayInIndia();
const line = (id: string, name: string, roll: number | null, status: AttendanceStatus, reason: string | null = null, position = roll ?? 1) => ({
  id,
  name,
  admissionNumber: `ADM-${id.toUpperCase()}`,
  rollNumber: roll,
  position,
  status,
  reason,
});
const counted = (statuses: AttendanceStatus[]) => ({
  present: statuses.filter((s) => s === "present").length,
  absent: statuses.filter((s) => s === "absent").length,
  late: statuses.filter((s) => s === "late").length,
  leave: statuses.filter((s) => s === "leave").length,
});
const group = (over: Partial<StudentsDayGroup> & Pick<StudentsDayGroup, "classId" | "label" | "students">): StudentsDayGroup => ({
  sectionId: null,
  classTeacher: null,
  saved: false,
  total: over.students.length,
  counts: counted(over.students.map((s) => s.status)),
  ...over,
});
/** Class 1 took the day (Meena Singh is its class teacher); Class 5A, 5B and 6 did not. */
const GROUPS: StudentsDayGroup[] = [
  group({
    classId: "c1",
    label: "Class 1",
    classTeacher: { id: "t1", name: "Meena Singh" },
    saved: true,
    students: [line("s1", "Asha Verma", 1, "present"), line("s2", "Kabir Rao", 2, "absent", "Fever"), line("s3", "Mira Shah", 3, "leave"), line("s4", "Nikhil Das", 4, "absent")],
  }),
  group({ classId: "c5", sectionId: "c5-A", label: "Class 5A", students: [line("s5", "Dev Patel", 1, "present")] }),
  group({ classId: "c5", sectionId: "c5-B", label: "Class 5B", students: [line("s6", "Sara Khan", 1, "present")] }),
  group({ classId: "c6", sectionId: "c6-A", label: "Class 6", students: [line("s7", "Amit Kumar", null, "present", null, 1), line("s8", "Riya Sen", null, "present", null, 2)] }),
];

/** What the server answers: the classes asked for, a search's children under their class (a class with nobody found left out); the numbers stay whole. */
function dayOf(q: URLSearchParams, groups = GROUPS, extra: Partial<StudentsDay> = {}): StudentsDay {
  const scope = groups.filter((g) => (!q.get("classId") || g.classId === q.get("classId")) && (!q.get("sectionId") || g.sectionId === q.get("sectionId")));
  const word = (q.get("search") ?? "").toLowerCase();
  const found = scope.map((g) => ({ ...g, students: g.students.filter((s) => s.name.toLowerCase().includes(word)) })).filter((g) => !word || g.students.length > 0);
  const taken = scope.filter((g) => g.saved);
  return {
    date: q.get("date") ?? today,
    holiday: null,
    groups: found,
    summary: { students: scope.reduce((n, g) => n + g.total, 0), classes: scope.length, taken: taken.length, counts: counted(taken.flatMap((g) => g.students.map((s) => s.status))) },
    ...extra,
  };
}

function open(path = "/attendance/students", extra: Record<string, Handler> = {}, role: UserRole = "school_admin", permissions: string[] = []) {
  signInAs(role, permissions);
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /attendance/students/day": (_body, q) => dayOf(q),
    "GET /attendance/students/today": () => ({ date: today, working: true, holiday: null, pending: [] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/attendance/students", element: <StudentAttendancePage /> },
      { path: "/attendance/students/register", element: <p>the register</p> },
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
  vi.unstubAllGlobals();
  signOut();
  store.dispatch(yearViewChanged(null));
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const DAY = "/attendance/students/day";
const reads = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path);
const lastQuery = (calls: Call[]) => new URLSearchParams(reads(calls, DAY).at(-1)?.query ?? "");
const classCard = (label: string) => within(screen.getByRole("region", { name: label }));
const shownClasses = () => screen.queryAllByRole("region", { name: /^Class / }).map((r) => r.getAttribute("aria-label"));
const row = (label: string, name: string) => within(classCard(label).getByRole("list", { name: `Attendance of ${label}` })).getByRole("listitem", { name });
const summary = () => within(screen.getByRole("region", { name: "Summary of the day" }));
const loaded = () => screen.findByRole("region", { name: "Class 1" });

describe("every class of the day, class by class", () => {
  it("opens on today for ALL classes, with one request for the whole school (no class asked, no sheet of one class)", async () => {
    const { calls } = open();
    expect(await screen.findByRole("heading", { name: "Student attendance", level: 1 })).toBeInTheDocument();
    await loaded();
    expect(Object.fromEntries(lastQuery(calls))).toEqual({ date: today });
    expect(reads(calls, DAY)).toHaveLength(1);
    expect(reads(calls, "/classroom/attendance")).toHaveLength(0);
    expect(reads(calls, "/attendance/students")).toHaveLength(0);
  });

  it("each class is a card in teaching order (its name and number of children on top, its children under it)", async () => {
    open();
    await loaded();
    expect(shownClasses()).toEqual(["Class 1", "Class 5A", "Class 5B", "Class 6"]);
    expect(classCard("Class 1").getByRole("heading", { name: "Class 1 · 4 students" })).toBeInTheDocument();
    expect(classCard("Class 6").getByRole("heading", { name: "Class 6 · 2 students" })).toBeInTheDocument();
    expect(row("Class 6", "Amit Kumar")).toBeInTheDocument();
    expect(classCard("Class 1").queryByText("Amit Kumar")).not.toBeInTheDocument();
  });

  it("starts with the round arrow and the trail, no big title of its own; the heading is for a screen reader only", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Student attendance", level: 1 })).toHaveClass("sr-only");
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(within(trail).getByText("Student attendance")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("a class names its class teacher; a class with none says nothing of one", async () => {
    open();
    await loaded();
    expect(classCard("Class 1").getByText("Class teacher: Meena Singh")).toBeInTheDocument();
    expect(classCard("Class 6").queryByText(/Class teacher:/)).not.toBeInTheDocument();
  });

  it("each child is a line: roll number, name, admission number and the four marks with the saved one lit; every mark is fixed", async () => {
    open();
    await loaded();
    const kabir = row("Class 1", "Kabir Rao");
    expect(within(kabir).getByText("02")).toBeInTheDocument();
    expect(within(kabir).getByText("ADM-S2")).toBeInTheDocument();
    expect(within(kabir).getAllByRole("radio").map((m) => m.closest("label")?.textContent)).toEqual(["PPresent", "AAbsent", "LLate", "LvLeave"]);
    expect(within(kabir).getByRole("radio", { name: "Absent" })).toBeChecked();
    expect(within(row("Class 1", "Asha Verma")).getByRole("radio", { name: "Present" })).toBeChecked();
    for (const mark of screen.getAllByRole("radio")) expect(mark).toBeDisabled();
  });

  it("a child with no roll number is shown under the place in the class", async () => {
    open();
    await loaded();
    expect(within(row("Class 6", "Riya Sen")).getByText("02")).toBeInTheDocument();
  });

  it("the note: On leave beside Lv, the reason of an absence, or Not informed when none was given", async () => {
    open();
    await loaded();
    expect(within(row("Class 1", "Mira Shah")).getByRole("radio", { name: "Leave" })).toBeChecked();
    expect(within(row("Class 1", "Mira Shah")).getByText("On leave")).toBeInTheDocument();
    expect(within(row("Class 1", "Kabir Rao")).getByText("Fever")).toBeInTheDocument();
    expect(within(row("Class 1", "Nikhil Das")).getByText("Not informed")).toBeInTheDocument();
    expect(within(row("Class 1", "Asha Verma")).queryByText("Not informed")).not.toBeInTheDocument();
  });

  it("a class nobody took says Not taken, and none of its children has a mark lit (the server's Present is only where a day starts)", async () => {
    open();
    await loaded();
    expect(classCard("Class 6").getByText("Not taken")).toBeInTheDocument();
    expect(classCard("Class 1").queryByText("Not taken")).not.toBeInTheDocument();
    for (const mark of within(classCard("Class 6").getByRole("list", { name: "Attendance of Class 6" })).getAllByRole("radio")) expect(mark).not.toBeChecked();
  });

  it("the summary is of the whole school, counting the classes that were taken, and says how many were", async () => {
    open();
    await loaded();
    expect(summary().getByRole("heading", { name: "Today's summary" })).toBeInTheDocument();
    expect(summary().getByRole("img", { name: "25% came to school" })).toBeInTheDocument();
    expect(summary().getByText("Present").parentElement).toHaveTextContent("Present1");
    expect(summary().getByText("Absent").parentElement).toHaveTextContent("Absent2");
    expect(summary().getByText("Late").parentElement).toHaveTextContent("Late0");
    expect(summary().getByText("On leave").parentElement).toHaveTextContent("On leave1");
    expect(summary().getByText("8 students · taken in 1 of 4 classes")).toBeInTheDocument();
  });

  it("a day no class took: the ring says Not taken and the counts are dashes", async () => {
    open("/attendance/students?date=2026-11-10", { [`GET ${DAY}`]: (_b, q) => dayOf(q, GROUPS.map((g) => ({ ...g, saved: false }))) });
    await loaded();
    expect(summary().getByRole("img", { name: "Attendance not taken" })).toBeInTheDocument();
    expect(summary().getByText("Present").parentElement).toHaveTextContent("Present–");
  });

  it("a Sunday nobody took says there is no school on top, and the classes and their children are still there to look through and search (no Not taken on a day without school)", async () => {
    open("/attendance/students?date=2026-11-15", { [`GET ${DAY}`]: (_b, q) => dayOf(q, GROUPS.map((g) => ({ ...g, saved: false }))) });
    expect(await screen.findByText("Sunday: no school")).toBeInTheDocument();
    expect(shownClasses()).toEqual(["Class 1", "Class 5A", "Class 5B", "Class 6"]);
    // (The ring of the summary says the day was not taken; the classes do not each say it.)
    for (const label of shownClasses()) expect(classCard(label!).queryByText("Not taken")).not.toBeInTheDocument();
    for (const mark of screen.getAllByRole("radio")) expect(mark).not.toBeChecked();
  });

  it("a holiday says so on top, with the classes under it", async () => {
    open("/attendance/students?date=2026-11-10", { [`GET ${DAY}`]: (_b, q) => dayOf(q, GROUPS.map((g) => ({ ...g, saved: false })), { holiday: { title: "Diwali" } }) });
    expect(await screen.findByText("Holiday: Diwali")).toBeInTheDocument();
    expect(shownClasses()).toHaveLength(4);
    for (const label of shownClasses()) expect(classCard(label!).queryByText("Not taken")).not.toBeInTheDocument();
  });

  it("the school saves nothing here: no Save, no Mark all present, no Reset", async () => {
    for (const [role, permissions] of [["school_admin", []], ["principal", []], ["receptionist", ["attendance.view", "attendance.mark"]]] as const) {
      open("/attendance/students", {}, role, [...permissions]);
      await loaded();
      expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark all present" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
      cleanup();
      for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    }
  });
});

describe("the Class and Section filter", () => {
  // A Tuesday, whatever day the tests run on: a Sunday nobody took says there is no school instead of the classes (Class 5 and 6 did not take it).
  const TUESDAY = "2026-11-10";

  it("starts on All classes; a class picked is asked of the server and is the only one shown; All classes brings every class back", async () => {
    const { calls, router, user } = open(`/attendance/students?date=${TUESDAY}`);
    await loaded();
    expect(screen.getByLabelText("Class")).toHaveTextContent("All classes");
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "Class 6" }));
    await waitFor(() => expect(shownClasses()).toEqual(["Class 6"]));
    expect(Object.fromEntries(lastQuery(calls))).toEqual({ date: TUESDAY, classId: "c6" });
    expect(router.state.location.search).toBe(`?date=${TUESDAY}&class=c6`);
    // Class 6 has one section: no Section box.
    expect(screen.queryByLabelText("Section")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "All classes" }));
    await waitFor(() => expect(shownClasses()).toEqual(["Class 1", "Class 5A", "Class 5B", "Class 6"]));
    expect(Object.fromEntries(lastQuery(calls))).toEqual({ date: TUESDAY });
  });

  it("a class of two sections shows both (All sections) and gets a Section box to see one", async () => {
    const { calls, router, user } = open(`/attendance/students?date=${TUESDAY}`);
    await loaded();
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "Class 5" }));
    await waitFor(() => expect(shownClasses()).toEqual(["Class 5A", "Class 5B"]));
    expect(screen.getByLabelText("Section")).toHaveTextContent("All sections");
    await user.click(screen.getByLabelText("Section"));
    await user.click(await screen.findByRole("option", { name: "B" }));
    await waitFor(() => expect(shownClasses()).toEqual(["Class 5B"]));
    expect(Object.fromEntries(lastQuery(calls))).toEqual({ date: TUESDAY, classId: "c5", sectionId: "c5-B" });
    expect(router.state.location.search).toContain("section=c5-B");
  });

  it("a link with a class and a section (the old addresses, a notification) opens that class", async () => {
    const { calls } = open(`/attendance/students?class=c5&section=c5-B&date=${TUESDAY}`);
    await screen.findByRole("region", { name: "Class 5B" });
    expect(Object.fromEntries(lastQuery(calls))).toMatchObject({ classId: "c5", sectionId: "c5-B", date: TUESDAY });
  });

  it("on a Sunday, a class picked that nobody took says there is no school, above its children", async () => {
    open("/attendance/students?class=c6&date=2026-11-15");
    expect(await screen.findByText("Sunday: no school")).toBeInTheDocument();
    expect(shownClasses()).toEqual(["Class 6"]);
  });

  it("a school with no class yet says so and asks for no day", async () => {
    const { calls } = open("/attendance/students", { "GET /academics/structure": () => ({ ...STRUCTURE, classes: [] }) });
    expect(await screen.findByText("No class yet")).toBeInTheDocument();
    expect(reads(calls, DAY)).toHaveLength(0);
  });

  it("a class with no child yet says so", async () => {
    open(`/attendance/students?class=c9&date=${TUESDAY}`);
    expect(await screen.findByText("No child is in this class yet")).toBeInTheDocument();
  });
});

/** The search (asked for: "search sab backend se, debouncing"; "amit search karun to har class ke Amit aa jayen"). */
describe("the search: the server finds children of every class, each under their class", () => {
  const box = () => screen.getByRole("textbox", { name: "Search the children" });
  const searchesAsked = (calls: Call[]) => reads(calls, DAY).map((c) => new URLSearchParams(c.query).get("search"));

  it("is in the same line as the day and the class; three keys are ONE request, once the typing stops; the class of the child found is on top of them", async () => {
    const { calls, user } = open();
    await loaded();
    expect(within(screen.getByRole("search", { name: "Choose the day and the class" })).getByRole("textbox", { name: "Search the children" })).toBeInTheDocument();
    await user.type(box(), "amit");
    await waitFor(() => expect(shownClasses()).toEqual(["Class 6"]));
    expect(row("Class 6", "Amit Kumar")).toBeInTheDocument();
    expect(classCard("Class 6").queryByText("Riya Sen")).not.toBeInTheDocument();
    expect(searchesAsked(calls)).toEqual([null, "amit"]);
    expect(classCard("Class 6").getByText("1 found")).toBeInTheDocument();
  });

  it("finds children of several classes at once, each under their own class", async () => {
    const { user } = open();
    await loaded();
    // "ra": Kabir RAo and MiRA Shah of Class 1, SaRA Khan of Class 5B; nobody of Class 5A or Class 6.
    await user.type(box(), "ra");
    await waitFor(() => expect(shownClasses()).toEqual(["Class 1", "Class 5B"]));
    expect(within(classCard("Class 1").getByRole("list", { name: "Attendance of Class 1" })).getAllByRole("listitem").map((l) => l.getAttribute("aria-label"))).toEqual(["Kabir Rao", "Mira Shah"]);
    expect(row("Class 5B", "Sara Khan")).toBeInTheDocument();
  });

  it("the numbers stay whole while a search narrows the lines: the class's title and the school's summary", async () => {
    const { user } = open();
    await loaded();
    await user.type(box(), "kabir");
    await waitFor(() => expect(classCard("Class 1").getByText("1 found")).toBeInTheDocument());
    expect(classCard("Class 1").getByRole("heading", { name: "Class 1 · 4 students" })).toBeInTheDocument();
    expect(summary().getByText("Absent").parentElement).toHaveTextContent("Absent2");
    expect(summary().getByText("8 students · taken in 1 of 4 classes")).toBeInTheDocument();
  });

  it("keeps the classes on screen while the next answer comes (no flash of an empty page at every word)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { user } = open("/attendance/students", {
      [`GET ${DAY}`]: async (_b, q) => {
        if (q.get("search")) await gate;
        return dayOf(q);
      },
    });
    await loaded();
    await user.type(box(), "amit");
    await waitFor(() => expect(screen.getByRole("region", { name: "Class 1" }).closest("[aria-busy]")).toHaveAttribute("aria-busy", "true"));
    expect(shownClasses()).toHaveLength(4);
    release();
    await waitFor(() => expect(shownClasses()).toEqual(["Class 6"]));
  });

  it("says Nobody matches, with a way to clear the search; clearing asks for everyone again, with no search in the request", async () => {
    const { calls, user } = open();
    await loaded();
    await user.type(box(), "zzz");
    expect(await screen.findByText("Nobody matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(shownClasses()).toHaveLength(4));
    expect(box()).toHaveValue("");
    expect(searchesAsked(calls).at(-1)).toBeNull();
  });

  it("the words stay in the address, and a link with them asks the server with them at once", async () => {
    const { calls, router, user } = open("/attendance/students?q=amit");
    await screen.findByRole("region", { name: "Class 6" });
    expect(box()).toHaveValue("amit");
    expect(searchesAsked(calls)).toEqual(["amit"]);
    await user.clear(box());
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("the search stays when the day moves (one child through the days) and when a class is picked (that class's children with the words)", async () => {
    const { calls, user } = open("/attendance/students?date=2026-11-10");
    await loaded();
    await user.type(box(), "a");
    await waitFor(() => expect(lastQuery(calls).get("search")).toBe("a"));
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe("2026-11-11"));
    expect(lastQuery(calls).get("search")).toBe("a");
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "Class 6" }));
    await waitFor(() => expect(lastQuery(calls).get("classId")).toBe("c6"));
    expect(lastQuery(calls).get("search")).toBe("a");
    expect(box()).toHaveValue("a");
  });
});

describe("the day, with a left and a right arrow", () => {
  it("moves one day at a time; each step is another day asked of the server and stays in the address", async () => {
    const { calls, router, user } = open("/attendance/students?date=2026-11-10");
    await loaded();
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe("2026-11-11"));
    expect(router.state.location.search).toBe("?date=2026-11-11");
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe("2026-11-09"));
  });

  it("an arrow crosses a month's end like the calendar does", async () => {
    const { calls, user } = open("/attendance/students?date=2026-11-01");
    await loaded();
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe("2026-10-31"));
  });

  it("the right arrow stops at today (nothing is taken ahead); the left one is free", async () => {
    open();
    await loaded();
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeEnabled();
  });

  it("a Today button comes when another day is open, and is not there on today; Yesterday has no button (one left arrow)", async () => {
    const { calls, user } = open("/attendance/students?date=2026-11-10");
    await loaded();
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe(today));
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yesterday" })).not.toBeInTheDocument();
  });

  it("the day, the class, the search and the Register link are ONE line (one search group)", async () => {
    const { router, user } = open();
    await loaded();
    const bar = within(screen.getByRole("search", { name: "Choose the day and the class" }));
    expect(bar.getByRole("button", { name: "Previous day" })).toBeInTheDocument();
    expect(bar.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(bar.getByLabelText("Class")).toBeInTheDocument();
    expect(bar.getByRole("textbox", { name: "Search the children" })).toBeInTheDocument();
    await user.click(bar.getByRole("link", { name: "Register" }));
    expect(router.state.location.pathname).toBe("/attendance/students/register");
  });

  it("while a year that is over is open the arrows stay inside it and there is no Today; the classes not taken today are not asked", async () => {
    store.dispatch(yearViewChanged("y26"));
    const { calls } = open("/attendance/students", {
      "GET /academics/academic-years": () => [
        { id: "y27", name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "active", activatedAt: null },
        { id: "y26", name: "2025-2026", startDate: "2025-04-01", endDate: "2026-03-31", status: "closed", activatedAt: null },
      ],
    });
    // It opens on the last day of that year.
    await waitFor(() => expect(lastQuery(calls).get("date")).toBe("2026-03-31"));
    await loaded();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
    expect(reads(calls, "/attendance/students/today")).toHaveLength(0);
  });
});

describe("the classes that have not taken today's attendance", () => {
  it("are in one strip above the line, and a click opens that class for today", async () => {
    const PENDING = { date: today, working: true, holiday: null, pending: [{ classId: "c5", sectionId: "c5-B", label: "Class 5B" }] };
    const { calls, user } = open("/attendance/students?date=2026-11-10", { "GET /attendance/students/today": () => PENDING });
    const strip = await screen.findByRole("region", { name: "Attendance not taken today" });
    await user.click(within(strip).getByRole("button", { name: "Class 5B" }));
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls))).toMatchObject({ classId: "c5", sectionId: "c5-B", date: today }));
  });
});
