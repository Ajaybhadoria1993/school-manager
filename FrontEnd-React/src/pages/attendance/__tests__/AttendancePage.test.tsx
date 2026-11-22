import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import type { StudentRange, StudentRangeDay, StudentRangeRow, TeacherSheet, TeacherRecord } from "../../../types";
import { addDays, monthBounds, shiftMonth, shortDay } from "../../../utils/calendar";
import { rangeText } from "../../../utils/dateRange";
import { todayInIndia } from "../../../utils/students";
import AttendanceRedirect from "../AttendanceRedirect";
import StaffAttendancePage from "../StaffAttendance";
// The school's register (weeks, months) since 2026-11-23: Attendance > Student itself is the day of one class (StudentDayAttendance.test.tsx).
import StudentAttendancePage from "../StudentRegister";
import { StudentAttendance } from "../../../components/attendance/StudentAttendance";
import TeacherAttendancePage from "../TeacherAttendance";

/**
 * Attendance (the menu entry under Teacher, 2026-11-06): three tabs, Student, Teacher and Staff (coming). Student: every class by name
 * (a class with sections has its sections too), the children of the one picked with their marks for the days asked (this month to start
 * with), the reason of an absence; Teacher: every teacher, who came and at what time, who was late, who was absent.
 */

const today = todayInIndia();
const month = today.slice(0, 7);
const THIS_MONTH = monthBounds(month);
const LAST_MONTH = monthBounds(shiftMonth(month, -1));
/** Monday to Saturday of the week a day is in (a Sunday goes with the week before), `back` weeks earlier. Worked out here on its own, not with the app's helper. */
const weekOf = (day: string, back = 0) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  const shift = (d.getUTCDay() === 0 ? -6 : 1 - d.getUTCDay()) - 7 * back;
  const at = (n: number) => new Date(d.getTime() + (shift + n) * 86400000).toISOString().slice(0, 10);
  return { from: at(0), to: at(5) };
};
const THIS_WEEK = weekOf(today);
const LAST_WEEK = weekOf(today, 1);

const day = (date: string, weekday: number, over: Partial<StudentRangeDay> = {}): StudentRangeDay => ({ date, weekday, holiday: null, taken: true, ...over });
const kid = (id: string, name: string, roll: number, records: StudentRangeRow["records"], over: Partial<StudentRangeRow> = {}): StudentRangeRow => {
  const count = (s: string) => records.filter((r) => r.status === s).length;
  const days = records.length;
  return {
    id,
    name,
    admissionNumber: `ADM-${roll}`,
    rollNumber: roll,
    section: "A",
    records,
    tally: { present: count("present"), absent: count("absent"), late: count("late"), leave: count("leave"), days, percent: days === 0 ? null : Math.round(((count("present") + count("late")) / days) * 100) },
    ...over,
  };
};

const RANGE: StudentRange = {
  label: "Class 5",
  // A whole month (more than a week), whatever day the tests run on: it is the month grid.
  from: "2026-11-01",
  to: "2026-11-30",
  days: [day("2026-11-02", 1, { holiday: "Diwali", taken: false }), day("2026-11-03", 2), day("2026-11-04", 3), day("2026-11-05", 4, { taken: false })],
  students: [
    kid("s1", "Asha Verma", 1, [
      { date: "2026-11-03", status: "present", reason: null },
      { date: "2026-11-04", status: "late", reason: "Bus was late" },
    ]),
    kid("s2", "Kabir Rao", 2, [
      { date: "2026-11-03", status: "absent", reason: "Fever" },
      { date: "2026-11-04", status: "present", reason: null },
    ], { section: "B" }),
  ],
  summary: { students: 2, present: 2, absent: 1, late: 1, leave: 0, percent: 75 },
};

const rec = (date: string, status: TeacherRecord["status"], time: string | null = null, late: number | null = null, log: TeacherRecord["log"] = []): TeacherRecord => ({ date, status, checkedInTime: time, lateByMinutes: late, log, note: null, source: log.length > 0 ? "self" : null });
const logLine = (time: string, name: string): TeacherRecord["log"][number] => ({ time, at: `2026-11-03T${time}:00.000Z`, action: "checked_in", by: { name, role: "teacher" }, note: null });
const TEACHERS: TeacherSheet = {
  from: THIS_MONTH.from,
  to: today,
  days: [
    { date: "2026-11-02", weekday: 1, working: true, holiday: null, start: "08:30", end: "14:20" },
    { date: "2026-11-03", weekday: 2, working: true, holiday: null, start: "08:30", end: "14:20" },
    { date: "2026-11-04", weekday: 3, working: true, holiday: "Diwali", start: "08:30", end: "14:20" },
  ],
  teachers: [
    {
      id: "t1",
      name: "Dev Patel",
      employeeCode: "T-2",
      designation: "TGT",
      records: [rec("2026-11-02", "late", "09:00", 30, [logLine("09:00", "Dev Patel")]), rec("2026-11-03", "absent"), rec("2026-11-04", "holiday")],
      tally: { present: 0, late: 1, absent: 1, leave: 0, days: 2, percent: 50 },
    },
    {
      id: "t2",
      name: "Meena Singh",
      employeeCode: null,
      designation: null,
      records: [rec("2026-11-02", "present", "08:10", 0, [logLine("08:10", "Meena Singh")]), rec("2026-11-03", "pending"), rec("2026-11-04", "holiday")],
      tally: { present: 1, late: 0, absent: 0, leave: 0, days: 1, percent: 100 },
    },
  ],
  summary: { teachers: 2, present: 1, late: 1, absent: 1 },
};

function open(path = "/attendance/students", extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Admin", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /attendance/students": () => RANGE,
    "GET /attendance/teachers": () => TEACHERS,
    "GET /attendance/students/today": () => ({ date: today, working: true, holiday: null, pending: [] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/attendance", element: <AttendanceRedirect /> },
      { path: "/attendance/students", element: <StudentAttendancePage /> },
      { path: "/attendance/teachers", element: <TeacherAttendancePage /> },
      { path: "/attendance/staff", element: <StaffAttendancePage /> },
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
  store.dispatch(signedOut());
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const reads = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path);
const lastQuery = (calls: Call[], path: string) => new URLSearchParams(reads(calls, path).at(-1)?.query ?? "");
const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
/** The box of the date filter, by the days it says ("16 Nov 26 — 21 Nov 26"). */
const dateBox = (range: { from: string; to: string }) => screen.getByRole("button", { name: rangeText(range) });
/** Picks a ready-made range in the window "Select date range" (the whole app's date filter) and applies it. */
async function chooseRange(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: /\d{2} — \d{1,2} \w{3} \d{2}$/ }));
  const dialog = await screen.findByRole("dialog", { name: "Select date range" });
  await user.click(within(dialog).getByRole("button", { name }));
  await user.click(within(dialog).getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Select date range" })).not.toBeInTheDocument());
}

describe("three pages, no tabs (2026-11-10: they were the three tabs of one page)", () => {
  it("Student has its own title and no tabs, and asks only for the students' attendance", async () => {
    const { calls } = open();
    expect(await screen.findByRole("heading", { name: "Student attendance register", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    // The round arrow's trail leads back to the day of one class.
    expect(screen.getByRole("link", { name: "Student attendance" })).toHaveAttribute("href", "/attendance/students");
    await screen.findByRole("radiogroup", { name: "Class" });
    expect(reads(calls, "/attendance/teachers")).toHaveLength(0);
  });

  it("Teacher has its own title and no tabs, and asks only for the teachers' attendance", async () => {
    const { calls } = open("/attendance/teachers");
    expect(await screen.findByRole("heading", { name: "Teacher attendance", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await waitFor(() => expect(reads(calls, "/attendance/teachers")).toHaveLength(1));
    expect(reads(calls, "/attendance/students")).toHaveLength(0);
  });

  it("Staff has its own title (built 2026-11-22, it was coming) and asks only for the staff's attendance", async () => {
    const { calls } = open("/attendance/staff", { "GET /attendance/staff": () => ({ ...TEACHERS, departments: [], staff: [], summary: { staff: 0, present: 0, late: 0, absent: 0, leave: 0 } }) });
    expect(await screen.findByRole("heading", { name: "Staff attendance", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Staff attendance is coming soon")).not.toBeInTheDocument();
    await waitFor(() => expect(reads(calls, "/attendance/staff")).toHaveLength(1));
    expect(reads(calls, "/attendance/teachers")).toHaveLength(0);
  });

  it("the old addresses (a bookmark, a link in a notification) lead to the right page, with their filters", async () => {
    const at = async (from: string, path: string, search = "") => {
      const { router } = open(from);
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
      expect(router.state.location.search).toBe(search);
      cleanup();
    };
    await at("/attendance", "/attendance/students");
    await at("/attendance?tab=student", "/attendance/students");
    await at("/attendance?tab=teacher", "/attendance/teachers");
    await at("/attendance?tab=staff", "/attendance/staff");
    await at("/attendance?tab=nonsense", "/attendance/students");
    await at("/attendance?class=c5&section=c5-A", "/attendance/students", "?class=c5&section=c5-A");
    await at("/attendance?tab=teacher&from=2026-05-01&to=2026-05-31", "/attendance/teachers", "?from=2026-05-01&to=2026-05-31");
  });
});

describe("Student: the classes and their children", () => {
  it("lists every class by name, a class with two sections as one chip a section (Class 5A, Class 5B); the first is picked to start with, and the children of it are asked for this week (one request)", async () => {
    const { calls } = open();
    const classes = await screen.findByRole("radiogroup", { name: "Class" });
    // Class 1 and Class 9 have no section, Class 6 has only A (so it says nothing), Class 5 has A and B.
    expect(within(classes).getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent)).toEqual(["Class 1", "Class 5A", "Class 5B", "Class 6", "Class 9"]);
    expect(within(classes).getByRole("radio", { name: "Class 1" })).toBeChecked();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const q = lastQuery(calls, "/attendance/students");
    expect(Object.fromEntries(q)).toEqual({ classId: "c1", sectionId: "all", from: THIS_WEEK.from, to: THIS_WEEK.to });
    expect(reads(calls, "/attendance/students")).toHaveLength(1);
  });

  it("there is no Section row and no 'All sections': a section is a chip of its own, so one click picks class and section", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByRole("radiogroup", { name: "Section" })).not.toBeInTheDocument();
    expect(screen.queryByText("All sections")).not.toBeInTheDocument();
    const classes = () => within(screen.getByRole("radiogroup", { name: "Class" }));

    await user.click(classes().getByRole("radio", { name: "Class 5B" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("c5-B"));
    expect(lastQuery(calls, "/attendance/students").get("classId")).toBe("c5");
    expect(classes().getByRole("radio", { name: "Class 5B" })).toBeChecked();

    // A class with one section is asked for by that section, and says no letter.
    await user.click(classes().getByRole("radio", { name: "Class 6" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("c6-A"));
    expect(lastQuery(calls, "/attendance/students").get("classId")).toBe("c6");

    // A class with no section is read as the class.
    await user.click(classes().getByRole("radio", { name: "Class 9" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("classId")).toBe("c9"));
    expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("all");
  });

  it("the choice is kept in the address (class, section and the days), so a link or Back opens the same list", async () => {
    const { router, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5B" }));
    await waitFor(() => expect(router.state.location.search).toContain("section=c5-B"));
    expect(router.state.location.search).toContain("class=c5");
  });

  it("opens on what the address says: a class, a section and a range from May to November", async () => {
    const { calls } = open("/attendance/students?class=c5&section=c5-A&from=2026-05-01&to=2026-11-30");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toEqual({ classId: "c5", sectionId: "c5-A", from: "2026-05-01", to: "2026-11-30" });
    expect(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5A" })).toBeChecked();
  });

  it("an old address with a class and no section opens the class's first chip", async () => {
    const { calls } = open("/attendance/students?class=c5");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("c5-A");
    expect(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5A" })).toBeChecked();
  });

  it("the ranges in the window: Last Month asks for last month's days, and the box says them", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(dateBox(THIS_WEEK)).toBeInTheDocument();
    await chooseRange(user, "Last Month");
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("from")).toBe(LAST_MONTH.from));
    expect(lastQuery(calls, "/attendance/students").get("to")).toBe(LAST_MONTH.to);
    expect(dateBox(LAST_MONTH)).toBeInTheDocument();
  });

  it("the days are ONE box with an arrow each side (2026-11-17), not two date boxes and a row of buttons", async () => {
    open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByText("From")).not.toBeInTheDocument();
    expect(screen.queryByText("To")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last week" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous period" })).toBeEnabled();
    // This week (Monday to Saturday) reaches today, so there is nothing later to look at. On a Sunday the week ended yesterday and today is later.
    if (THIS_WEEK.to >= today) expect(screen.getByRole("button", { name: "Next period" })).toBeDisabled();
    else expect(screen.getByRole("button", { name: "Next period" })).toBeEnabled();
  });

  it("the arrows move a week at a time: the week before asks for last week's Monday to Saturday", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(screen.getByRole("button", { name: "Previous period" }));
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toMatchObject({ from: LAST_WEEK.from, to: LAST_WEEK.to }));
    expect(screen.getByRole("button", { name: "Next period" })).toBeEnabled();
  });
});

describe("Student: the list", () => {
  it("four numbers of the class: how many children, how many days they were there and not there, and the attendance rate (no Late: late is there)", async () => {
    // A person who wants less motion: the numbers are shown at once instead of counting up.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    open();
    const tiles = await screen.findByRole("region", { name: "About the attendance" });
    // The numbers count up to their value. The sheet says present 2, late 1, absent 1: three days there, one not.
    await waitFor(() => {
      expect(tiles).toHaveTextContent(/Total Students\s*2/);
      expect(tiles).toHaveTextContent(/Present\s*3/);
      expect(tiles).toHaveTextContent(/Absent\s*1/);
      expect(tiles).toHaveTextContent(/Attendance Rate\s*75%/);
    });
    expect(tiles).not.toHaveTextContent("Late");
  });

  it("every child with a column for each day up to a month: P there, A not there (late is there); a day nobody took is empty; a holiday says so", async () => {
    open();
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const head = within(table).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label") ?? h.textContent);
    expect(head).toEqual(expect.arrayContaining(["Mon 2 Nov, Holiday: Diwali", "Tue 3 Nov", "Wed 4 Nov", "Thu 5 Nov, attendance not taken"]));
    const asha = rowOf("Asha Verma");
    expect(within(asha).getByLabelText("Asha Verma, 3 Nov: Present")).toHaveTextContent("P");
    // Late is a day the child came: a P (the word and the reason are in the hover).
    expect(within(asha).getByLabelText("Asha Verma, 4 Nov: Late, Bus was late")).toHaveTextContent("P");
    const kabir = rowOf("Kabir Rao");
    expect(within(kabir).getByLabelText("Kabir Rao, 3 Nov: Absent, Fever")).toHaveTextContent("A");
    expect(within(kabir).queryByLabelText(/5 Nov/)).not.toBeInTheDocument();
  });

  it("each child's counts and percentage (and no section letter beside the name: the chip already says which section)", async () => {
    open("/attendance/students?class=c5");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const kabir = rowOf("Kabir Rao");
    expect(within(kabir).getByRole("cell", { name: "Present: 1" })).toBeInTheDocument();
    expect(within(kabir).getByRole("cell", { name: "Absent: 1" })).toBeInTheDocument();
    expect(within(kabir).getByRole("cell", { name: "Percentage" })).toHaveTextContent("50%");
    expect(within(kabir).getByRole("button", { name: "Kabir Rao" }).parentElement).toHaveTextContent(/^Kabir Rao$/);
  });

  it("a child's name opens their days: the ones they were not Present with the reason and what was marked", async () => {
    const { user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(rowOf("Kabir Rao")).getByRole("button", { name: "Kabir Rao" }));
    const dialog = await screen.findByRole("dialog", { name: "Kabir Rao" });
    expect(dialog).toHaveTextContent("1 present · 1 absent · 0 late · 0 on leave");
    const days = within(dialog).getByRole("list", { name: "Days they were not present" });
    expect(within(days).getAllByRole("listitem")).toHaveLength(1);
    expect(days).toHaveTextContent("3 Nov");
    expect(days).toHaveTextContent("Absent");
    expect(days).toHaveTextContent("Fever");
  });

  it("a child who was present on every day taken says so", async () => {
    const { user } = open("/attendance/students", {
      "GET /attendance/students": () => ({ ...RANGE, students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-03", status: "present", reason: null }])] }),
    });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(rowOf("Asha Verma")).getByRole("button", { name: "Asha Verma" }));
    expect(await screen.findByText("Present on every day attendance was taken")).toBeInTheDocument();
  });

  it("a long range (May to November) has no column for each day, only the counts; the days are in the child's window", async () => {
    const days: StudentRangeDay[] = Array.from({ length: 40 }, (_, i) => day(`2026-10-${String((i % 28) + 1).padStart(2, "0")}`, 1));
    const { user } = open("/attendance/students?from=2026-05-01&to=2026-11-30", { "GET /attendance/students": () => ({ ...RANGE, from: "2026-05-01", to: "2026-11-30", days }) });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).queryAllByRole("columnheader", { name: /Nov|Oct/ })).toHaveLength(0);
    expect(within(table).getByRole("columnheader", { name: "Absent" })).toBeInTheDocument();
    await user.click(within(rowOf("Kabir Rao")).getByRole("button", { name: "Kabir Rao" }));
    expect(await screen.findByRole("dialog", { name: "Kabir Rao" })).toHaveTextContent("Fever");
  });

  it("a class with no children says so", async () => {
    open("/attendance/students", { "GET /attendance/students": () => ({ ...RANGE, students: [], summary: { students: 0, present: 0, absent: 0, late: 0, leave: 0, percent: null } }) });
    expect(await screen.findByText("No student in this class yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says what the server said when it cannot read the class", async () => {
    open("/attendance/students", { "GET /attendance/students": () => new Response(JSON.stringify({ success: false, message: "Class not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("Class not found")).toBeInTheDocument();
  });

  it("a school with no classes says so and asks for no attendance", async () => {
    const { calls } = open("/attendance/students", { "GET /academics/structure": () => ({ ...STRUCTURE, classes: [] }) });
    expect(await screen.findByText("No class yet")).toBeInTheDocument();
    expect(reads(calls, "/attendance/students")).toHaveLength(0);
  });
});

describe("Student: this week, a register for it, and the day in two sides (2026-11-16)", () => {
  // Four days: a week or less is the register (bigger marks, Admission No.).
  const WEEK: StudentRange = { ...RANGE, from: "2026-11-02", to: "2026-11-05" };
  const asWeek = { "GET /attendance/students": () => WEEK };

  it("opens on this week; its window offers Today, This Week, Last Week, Last 7 Days, This Month, Last Month, Last 3 Months", async () => {
    const { user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(dateBox(THIS_WEEK));
    const dialog = await screen.findByRole("dialog", { name: "Select date range" });
    const names = within(within(dialog).getByRole("group", { name: "Ready-made ranges" })).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Today", "This Week", "Last Week", "Last 7 Days", "This Month", "Last Month", "Last 3 Months"]);
    expect(within(dialog).getByRole("button", { name: "This Week" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "This Month" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Last Week asks for last week's Monday to Saturday; This Month asks for the month, one request each", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await chooseRange(user, "Last Week");
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("from")).toBe(LAST_WEEK.from));
    expect(lastQuery(calls, "/attendance/students").get("to")).toBe(LAST_WEEK.to);
    await chooseRange(user, "This Month");
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("from")).toBe(THIS_MONTH.from));
    expect(reads(calls, "/attendance/students")).toHaveLength(3);
  });

  it("the Teacher page opens on today with the same date box, and reads a week at a time through its window", async () => {
    const { calls, user } = open("/attendance/teachers");
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: today, to: today });
    expect(dateBox({ from: today, to: today })).toBeInTheDocument();
    // Not the student's look: no From and To boxes, no row of range buttons.
    expect(screen.queryByText("From")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last week" })).not.toBeInTheDocument();

    // Week by week: each ready-made range asks for that Monday to Saturday.
    await chooseRange(user, "Last Week");
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: LAST_WEEK.from, to: LAST_WEEK.to }));
    expect(dateBox(LAST_WEEK)).toBeInTheDocument();
    await chooseRange(user, "This Week");
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: THIS_WEEK.from, to: THIS_WEEK.to }));
  });

  it("the Staff page has the same date box, opens on today, keeps a pick in the address and asks the staff's sheet for those days", async () => {
    const { calls, router, user } = open("/attendance/staff", { "GET /attendance/staff": () => ({ ...TEACHERS, departments: [], staff: [], summary: { staff: 0, present: 0, late: 0, absent: 0, leave: 0 } }) });
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
    expect(dateBox({ from: today, to: today })).toBeInTheDocument();
    expect(Object.fromEntries(lastQuery(calls, "/attendance/staff"))).toEqual({ from: today, to: today });
    await chooseRange(user, "Last Week");
    await waitFor(() => expect(router.state.location.search).toContain(`from=${LAST_WEEK.from}`));
    expect(router.state.location.search).toContain(`to=${LAST_WEEK.to}`);
    expect(dateBox(LAST_WEEK)).toBeInTheDocument();
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/staff"))).toEqual(LAST_WEEK));
  });

  it("a week has Roll, Student Name, Admission No., a column for each day, then Present, Absent and % (nothing else)", async () => {
    open("/attendance/students", asWeek);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const head = within(table).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label") ?? h.textContent);
    expect(head.slice(0, 3)).toEqual(["Roll", "Student Name", "Admission No."]);
    expect(head.slice(-3)).toEqual(["Present", "Absent", "%"]);
    expect(within(rowOf("Kabir Rao")).getByRole("cell", { name: "ADM-2" })).toBeInTheDocument();
  });

  it("a month has the Admission No. too", async () => {
    open();
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).getByRole("columnheader", { name: "Admission No." })).toBeInTheDocument();
  });

  it("a day's heading is a button: it opens that day in two sides, Present on one and Absent on the other, with the reason, and asks the server nothing", async () => {
    const { calls, user } = open("/attendance/students", asWeek);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(table).getByRole("button", { name: "Present and absent on Tue 3 Nov" }));
    const dialog = await screen.findByRole("dialog", { name: "Tue 3 Nov" });
    const present = within(dialog).getByRole("list", { name: "Present" });
    const absent = within(dialog).getByRole("list", { name: "Absent" });
    expect(within(present).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Asha Verma"]);
    expect(within(absent).getAllByRole("listitem")).toHaveLength(1);
    expect(absent).toHaveTextContent("Kabir Rao");
    expect(absent).toHaveTextContent("Fever");
    expect(dialog).toHaveTextContent("Present (1)");
    expect(dialog).toHaveTextContent("Absent (1)");
    expect(reads(calls, "/attendance/students")).toHaveLength(1);
  });

  it("a child who came late is on the Present side with a Late tag; a side nobody is on says so", async () => {
    const { user } = open("/attendance/students", asWeek);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(table).getByRole("button", { name: "Present and absent on Wed 4 Nov" }));
    const dialog = await screen.findByRole("dialog", { name: "Wed 4 Nov" });
    const present = within(dialog).getByRole("list", { name: "Present" });
    expect(within(present).getAllByRole("listitem")).toHaveLength(2);
    expect(within(present).getByText("Late")).toBeInTheDocument();
    expect(within(dialog).queryByRole("list", { name: "Absent" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Nobody was absent")).toBeInTheDocument();
  });

  it("a child on leave is on the Absent side, tagged Leave", async () => {
    const leave = { ...WEEK, students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-03", status: "leave", reason: "Wedding" }])] };
    const { user } = open("/attendance/students", { "GET /attendance/students": () => leave });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(table).getByRole("button", { name: "Present and absent on Tue 3 Nov" }));
    const dialog = await screen.findByRole("dialog", { name: "Tue 3 Nov" });
    const absent = within(dialog).getByRole("list", { name: "Absent" });
    expect(absent).toHaveTextContent("Asha Verma");
    expect(within(absent).getByText("Leave")).toBeInTheDocument();
    expect(within(dialog).getByText("Nobody was present")).toBeInTheDocument();
  });

  it("works in the month grid too; Close shuts it", async () => {
    const { user } = open();
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(table).getByRole("button", { name: "Present and absent on Tue 3 Nov" }));
    const dialog = await screen.findByRole("dialog", { name: "Tue 3 Nov" });
    // The corner cross and the footer button are both "Close": the footer's is the last.
    await user.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tue 3 Nov" })).not.toBeInTheDocument());
  });

  it("a holiday, or a day nobody took, has no button: there is nothing to split", async () => {
    open("/attendance/students", asWeek);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).queryByRole("button", { name: /Mon 2 Nov/ })).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Thu 5 Nov/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Mon 2 Nov, Holiday: Diwali" })).toBeInTheDocument();
  });

  it("a long range has no day columns, so no day buttons", async () => {
    const days: StudentRangeDay[] = Array.from({ length: 40 }, (_, i) => day(`2026-10-${String((i % 28) + 1).padStart(2, "0")}`, 1));
    open("/attendance/students?from=2026-05-01&to=2026-11-30", { "GET /attendance/students": () => ({ ...RANGE, from: "2026-05-01", to: "2026-11-30", days }) });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).queryByRole("button", { name: /Present and absent on/ })).not.toBeInTheDocument();
  });
});

describe("Student: the Filters card, today's column and the pages (2026-11-16)", () => {
  const weekdayOf = (d: string) => ((new Date(`${d}T00:00:00.000Z`).getUTCDay() + 6) % 7) + 1;
  const yesterday = addDays(today, -1);
  // Two days up to today: a register, with today's column in it.
  const SO_FAR: StudentRange = {
    ...RANGE,
    from: yesterday,
    to: today,
    days: [day(yesterday, weekdayOf(yesterday)), day(today, weekdayOf(today))],
    students: [kid("s1", "Asha Verma", 1, [{ date: today, status: "present", reason: null }])],
  };
  const many = (n: number) => Array.from({ length: n }, (_, i) => kid(`k${i + 1}`, `Child ${String(i + 1).padStart(2, "0")}`, i + 1, [{ date: today, status: "present", reason: null }]));
  const thirty = { "GET /attendance/students": () => ({ ...SO_FAR, students: many(30), summary: { ...SO_FAR.summary, students: 30 } }) };
  const bodyRows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);

  it("the class and the days are one card named Filters, with no Section row (the school looks: no Take attendance in it)", async () => {
    open("/attendance/students?class=c5&section=c5-A");
    const filters = await screen.findByRole("region", { name: "Filters" });
    expect(within(filters).getByRole("heading", { name: "Filters" })).toBeInTheDocument();
    expect(within(filters).getByRole("radiogroup", { name: "Class" })).toBeInTheDocument();
    expect(within(filters).queryByRole("radiogroup", { name: "Section" })).not.toBeInTheDocument();
    expect(within(filters).getByText("Date Range")).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: rangeText(THIS_WEEK) })).toBeInTheDocument();
    expect(within(filters).queryByRole("link", { name: "Take attendance" })).not.toBeInTheDocument();
    // The warning of the classes that have not taken today's attendance is above the card, not in it.
    expect(within(filters).queryByRole("region", { name: "Attendance not taken today" })).not.toBeInTheDocument();
  });

  it("today's column is marked, and only today's", async () => {
    open("/attendance/students", { "GET /attendance/students": () => SO_FAR });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const marked = within(table).getAllByRole("columnheader").filter((h) => h.getAttribute("aria-current") === "date");
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute("aria-label")).toContain(shortDay(today));
  });

  it("the children come in pages of 12 with 'Showing 1 to 12 of 30 students'; a page number shows the next 12 and asks the server nothing", async () => {
    const { calls, user } = open("/attendance/students", thirty);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(bodyRows(table)).toHaveLength(12);
    expect(within(table).getByRole("button", { name: "Child 01" })).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Child 13" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 12 of 30 students")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Showing 13 to 24 of 30 students")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Child 13" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(await screen.findByText("Showing 25 to 30 of 30 students")).toBeInTheDocument();
    expect(bodyRows(table)).toHaveLength(6);
    expect(reads(calls, "/attendance/students")).toHaveLength(1);
  });

  it("the four numbers are of the whole class, not of the page", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const { user } = open("/attendance/students", thirty);
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "About the attendance" })).toHaveTextContent(/Total Students\s*30/));
  });

  it("a new class, section or range starts again on page 1", async () => {
    const { user } = open("/attendance/students", thirty);
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await screen.findByText("Showing 13 to 24 of 30 students");
    await chooseRange(user, "Last Week");
    expect(await screen.findByText("Showing 1 to 12 of 30 students")).toBeInTheDocument();
  });

  it("a small class has the line too ('Showing 1 to 2 of 2 students'); a class with no children has none", async () => {
    open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.getByText("Showing 1 to 2 of 2 students")).toBeInTheDocument();
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    open("/attendance/students", { "GET /attendance/students": () => ({ ...RANGE, students: [], summary: { students: 0, present: 0, absent: 0, late: 0, leave: 0, percent: null } }) });
    await screen.findByText("No student in this class yet");
    expect(screen.queryByRole("navigation", { name: "Pages of students" })).not.toBeInTheDocument();
  });

  it("the day's two sides hold the whole class, not only the page", async () => {
    const { user } = open("/attendance/students", thirty);
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(table).getByRole("button", { name: `Present and absent on ${["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayOf(today)]} ${shortDay(today)}` }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Present (30)");
  });
});

describe("Student: the top of the page like the reference (2026-11-16, third round)", () => {
  const PENDING = {
    date: today,
    working: true,
    holiday: null,
    pending: [
      { classId: "c5", sectionId: "c5-A", label: "Class 5A" },
      { classId: "c1", sectionId: null, label: "Class 1" },
    ],
  };
  // jsdom has no layout: a row that is too full is a list taller than its one-row box.
  const crowd = (scroll: number, client: number) => {
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(scroll);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(client);
  };
  afterEach(() => vi.restoreAllMocks());

  it("the page starts with the round arrow and the trail, no big title of its own (the top bar names the page); the heading is there for a screen reader only", async () => {
    open();
    const heading = await screen.findByRole("heading", { name: "Student attendance register", level: 1 });
    expect(heading).toHaveClass("sr-only");
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(within(trail).getByRole("link", { name: "Student attendance" })).toHaveAttribute("href", "/attendance/students");
    expect(within(trail).getByText("Register")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Back to Student attendance" })).toBeInTheDocument();
  });

  it("the classes that have not taken attendance are one row; with room for all of them there is no chevron", async () => {
    open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    const strip = await screen.findByRole("region", { name: "Attendance not taken today" });
    expect(within(strip).getAllByRole("button").map((b) => b.textContent)).toEqual(["Class 5A", "Class 1"]);
    expect(within(strip).queryByRole("button", { name: /Show/ })).not.toBeInTheDocument();
  });

  it("when the row is too full a chevron at the end opens the rest, and closes it again", async () => {
    crowd(80, 32);
    const { user } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    const strip = await screen.findByRole("region", { name: "Attendance not taken today" });
    const more = await within(strip).findByRole("button", { name: "Show all classes" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    const less = within(strip).getByRole("button", { name: "Show fewer classes" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    await user.click(less);
    expect(within(strip).getByRole("button", { name: "Show all classes" })).toHaveAttribute("aria-expanded", "false");
  });

  it("the chevron is not a class: it opens nothing and asks the server nothing", async () => {
    crowd(80, 32);
    const { calls, user } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const before = reads(calls, "/attendance/students").length;
    await user.click(await screen.findByRole("button", { name: "Show all classes" }));
    expect(reads(calls, "/attendance/students")).toHaveLength(before);
  });

});

describe("Student: the table and its pages like the reference (2026-11-16, fifth round)", () => {
  const SO_FAR_DAY = (d: string) => ({ date: d, weekday: new Date(`${d}T00:00:00.000Z`).getUTCDay() || 7, holiday: null, taken: true });
  const many = (n: number) => Array.from({ length: n }, (_, i) => kid(`k${i + 1}`, `Child ${String(i + 1).padStart(2, "0")}`, i + 1, [{ date: "2026-11-16", status: "present", reason: null }]));
  const WEEK_OF_30: StudentRange = { ...RANGE, from: "2026-11-16", to: "2026-11-16", days: [SO_FAR_DAY("2026-11-16")], students: many(30), summary: { ...RANGE.summary, students: 30 } };
  const IN_WEEK = "/attendance/students?from=2026-11-16&to=2026-11-21";

  it("the table and its pages are one card (a region of its own), the pages at the foot of it", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => WEEK_OF_30 });
    const card = await screen.findByRole("region", { name: "Attendance register" });
    expect(within(card).getByRole("table", { name: "Attendance of Class 5" })).toBeInTheDocument();
    expect(within(card).getByRole("navigation", { name: "Pages of students" })).toBeInTheDocument();
  });

  it("the pages read 'Page', a back arrow, the numbers, a forward arrow and an arrow to the last page", async () => {
    const { user } = open(IN_WEEK, { "GET /attendance/students": () => WEEK_OF_30 });
    const pages = await screen.findByRole("navigation", { name: "Pages of students" });
    expect(within(pages).getByText("Page")).toBeInTheDocument();
    expect(within(pages).getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(within(pages).getByRole("button", { name: "Next page" })).toBeEnabled();
    await user.click(within(pages).getByRole("button", { name: "Last page" }));
    expect(await screen.findByText("Showing 25 to 30 of 30 students")).toBeInTheDocument();
    expect(within(pages).getByRole("button", { name: "Last page" })).toBeDisabled();
    expect(within(pages).getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
  });

  it("the other lists keep their own pages: Rows per page, and no Last page arrow", async () => {
    // The student list of the school uses the same pager without the register's look.
    const { StudentPager } = await import("../../../components/students/StudentPager");
    render(<StudentPager page={{ page: 1, limit: 12, total: 40, totalPages: 4, items: new Array(12) }} limit={12} onPage={() => {}} onLimit={() => {}} />);
    expect(screen.getByText("Rows per page:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last page" })).not.toBeInTheDocument();
    expect(screen.queryByText("Page")).not.toBeInTheDocument();
  });

});

describe("Student: the school only looks (2026-11-17)", () => {
  const IN_WEEK = "/attendance/students?from=2026-11-16&to=2026-11-21";
  const SHEET: StudentRange = {
    ...RANGE,
    from: "2026-11-16",
    to: "2026-11-17",
    days: [day("2026-11-16", 1), day("2026-11-17", 2, { taken: false })],
    students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-16", status: "present", reason: null }]), kid("s2", "Kabir Rao", 2, [])],
    summary: { students: 2, present: 1, absent: 0, late: 0, leave: 0, percent: 100 },
  };

  it("a child with no mark on a day up to today says Not taken; the days that have not come say nothing", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => SHEET });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const notTaken = (row: HTMLElement) => within(row).queryAllByText("Not taken");
    expect(notTaken(rowOf("Kabir Rao"))).toHaveLength(2); // Monday and Tuesday; Wed to Sat have not come
    expect(notTaken(rowOf("Asha Verma"))).toHaveLength(1);
  });

  it("the school, even the school admin, cannot mark: nothing to click in a cell, and no Take attendance button", async () => {
    const { calls } = open(IN_WEEK, { "GET /attendance/students": () => SHEET });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).queryByRole("button", { name: /not taken/ })).not.toBeInTheDocument();
    // A mark is only a mark: the name opens the child's window, the day's heading opens the two sides; no cell opens Present / Absent.
    expect(within(rowOf("Asha Verma")).queryByRole("button", { name: /Asha Verma, 16 Nov/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Take attendance" })).not.toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("a holiday and a Sunday say nothing, and neither does a day with a mark", async () => {
    const past: StudentRange = {
      ...SHEET,
      from: "2026-11-09",
      to: "2026-11-15",
      days: [day("2026-11-09", 1), day("2026-11-10", 2, { holiday: "Diwali", taken: false }), day("2026-11-11", 3, { taken: false }), day("2026-11-15", 7, { taken: false })],
      students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-09", status: "present", reason: null }])],
    };
    open("/attendance/students?from=2026-11-09&to=2026-11-15", { "GET /attendance/students": () => past });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Asha Verma")).queryAllByText("Not taken")).toHaveLength(1); // Wednesday 11 only
  });

  it("a month has no Not taken (its cells are small)", async () => {
    open();
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(table).queryByText("Not taken")).not.toBeInTheDocument();
  });
});

describe("The class teacher's register: Not taken, and a click to mark one child on one day (2026-11-17)", () => {
  // Monday 16 and Tuesday 17 are sent (the server stops at today). Asha came on Monday; nobody has a mark on Tuesday; Kabir has none at all.
  const SHEET: StudentRange = {
    ...RANGE,
    from: "2026-11-16",
    to: "2026-11-17",
    days: [day("2026-11-16", 1), day("2026-11-17", 2, { taken: false })],
    students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-16", status: "present", reason: null }]), kid("s2", "Kabir Rao", 2, [])],
    summary: { students: 2, present: 1, absent: 0, late: 0, leave: 0, percent: 100 },
  };
  const MARKED = { studentId: "s2", date: "2026-11-16", status: "absent" };
  const UNIT = { classId: "c5", sectionId: "c5-A" };

  /** The register as the class teacher has it in their class page: one class, no filters of classes, marking on. */
  function openRegister(extra: Record<string, Handler> = {}, props: { canMark?: boolean; range?: { from: string; to: string } } = {}) {
    store.dispatch(
      sessionStarted({
        user: { id: "u2", name: "Meena Singh", email: null, username: "meena", role: "teacher", tenantId: "t1", emailVerifiedAt: null },
        tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
      } as never)
    );
    const calls = fakeApi({
      "GET /classroom/attendance/register": () => SHEET,
      "PUT /classroom/attendance/student": () => MARKED,
      ...extra,
    });
    const router = createMemoryRouter([{ path: "/x", element: <StudentAttendance unit={UNIT} canMark={props.canMark ?? true} /> }], {
      initialEntries: [props.range ? `/x?from=${props.range.from}&to=${props.range.to}` : "/x?from=2026-11-16&to=2026-11-21"],
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    return { calls, user: userEvent.setup() };
  }
  const notTaken = (row: HTMLElement) => within(row).queryAllByText("Not taken");

  it("is the one class: no class or section to pick, no warning of other classes, only the days; it reads the class's own register", async () => {
    const { calls } = openRegister();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByRole("radiogroup", { name: "Class" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Section" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Attendance not taken today" })).not.toBeInTheDocument();
    expect(dateBox(THIS_WEEK)).toBeInTheDocument();
    const read = reads(calls, "/classroom/attendance/register");
    expect(read).toHaveLength(1);
    expect(Object.fromEntries(new URLSearchParams(read[0].query))).toMatchObject({ classId: "c5", sectionId: "c5-A" });
    // The school's pages and its list of classes are not asked.
    expect(calls.some((c) => c.path === "/academics/structure" || c.path.startsWith("/attendance/"))).toBe(false);
  });

  it("a child with no mark on a day up to today says Not taken", async () => {
    openRegister();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(notTaken(rowOf("Kabir Rao"))).toHaveLength(2);
    expect(notTaken(rowOf("Asha Verma"))).toHaveLength(1);
  });

  it("a click on a Not taken cell opens Present and Absent for that child and day; Absent sends that one mark and reads the register again", async () => {
    const { calls, user } = openRegister();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(rowOf("Kabir Rao")).getByLabelText("Kabir Rao, 16 Nov: not taken"));
    const menu = await screen.findByRole("dialog", { name: /Kabir Rao, Mon 16 Nov/ });
    expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual(["PPresent", "AAbsent"]);
    await user.click(within(menu).getByRole("button", { name: /Absent/ }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toMatchObject({ path: "/classroom/attendance/student", body: { studentId: "s2", date: "2026-11-16", status: "absent" } });
    await waitFor(() => expect(reads(calls, "/classroom/attendance/register")).toHaveLength(2));
    expect(screen.queryByRole("dialog", { name: /Kabir Rao/ })).not.toBeInTheDocument();
  });

  it("a mark can be changed: a click on a P offers the other answer; the answer it already is sends nothing (late is there)", async () => {
    const late: StudentRange = { ...SHEET, students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-16", status: "late", reason: "Bus was late" }]), SHEET.students[1]] };
    const { calls, user } = openRegister({ "GET /classroom/attendance/register": () => late });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(rowOf("Asha Verma")).getByLabelText("Asha Verma, 16 Nov: Late, Bus was late"));
    let menu = await screen.findByRole("dialog", { name: /Asha Verma, Mon 16 Nov/ });
    expect(within(menu).getByRole("button", { name: /Present/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(menu).getByRole("button", { name: /Present/ }));
    expect(puts(calls)).toHaveLength(0);
    await user.click(within(rowOf("Asha Verma")).getByLabelText("Asha Verma, 16 Nov: Late, Bus was late"));
    menu = await screen.findByRole("dialog", { name: /Asha Verma, Mon 16 Nov/ });
    await user.click(within(menu).getByRole("button", { name: /Absent/ }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({ studentId: "s1", date: "2026-11-16", status: "absent" });
  });

  it("what the server refuses is said in a message and nothing changes", async () => {
    const { user } = openRegister({ "PUT /classroom/attendance/student": () => new Response(JSON.stringify({ success: false, message: "Only the class teacher of this class takes its attendance.", code: "NOT_CLASS_TEACHER" }), { status: 403, headers: { "Content-Type": "application/json" } }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(rowOf("Kabir Rao")).getByLabelText("Kabir Rao, 16 Nov: not taken"));
    await user.click(within(await screen.findByRole("dialog", { name: /Kabir Rao/ })).getByRole("button", { name: /Present/ }));
    expect(await screen.findByText("Only the class teacher of this class takes its attendance.")).toBeInTheDocument();
  });

  it("without the right to mark (not the class teacher) Not taken is read and there is nothing to click", async () => {
    openRegister({}, { canMark: false });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(notTaken(rowOf("Kabir Rao")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /not taken/ })).not.toBeInTheDocument();
  });
});

describe("Student: only what is needed, did the child come or not (2026-11-17)", () => {
  const IN_WEEK = "/attendance/students?from=2026-11-16&to=2026-11-21";
  const headsOf = (table: HTMLElement) => within(table).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label") ?? h.textContent);
  const MARKED: StudentRange = {
    ...RANGE,
    from: "2026-11-16",
    to: "2026-11-17",
    days: [day("2026-11-16", 1), day("2026-11-17", 2)],
    students: [
      kid("s1", "Asha Verma", 1, [{ date: "2026-11-16", status: "late", reason: "Bus was late" }, { date: "2026-11-17", status: "present", reason: null }]),
      kid("s2", "Kabir Rao", 2, [{ date: "2026-11-16", status: "leave", reason: "Wedding" }, { date: "2026-11-17", status: "absent", reason: null }]),
    ],
    summary: { students: 2, present: 1, absent: 1, late: 1, leave: 1, percent: 50 },
  };
  const NOTHING_TAKEN: StudentRange = {
    ...MARKED,
    days: [day("2026-11-16", 1, { taken: false }), day("2026-11-17", 2, { taken: false })],
    students: [kid("s1", "Asha Verma", 1, []), kid("s2", "Kabir Rao", 2, [])],
    summary: { students: 2, present: 0, absent: 0, late: 0, leave: 0, percent: null },
  };

  it("the columns are the days, then Present, Absent and %: no Late, no Leave, no Remarks", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MARKED });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const heads = headsOf(table);
    expect(heads).toEqual(expect.arrayContaining(["Present", "Absent", "%"]));
    for (const gone of ["Late", "Leave", "Remarks"]) expect(heads).not.toContain(gone);
  });

  it("a child who came late is a P (there), a child on leave an A (not there); the word and the reason stay in the hover", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MARKED });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Asha Verma")).getByLabelText("Asha Verma, 16 Nov: Late, Bus was late")).toHaveTextContent("P");
    expect(within(rowOf("Kabir Rao")).getByLabelText("Kabir Rao, 16 Nov: Leave, Wedding")).toHaveTextContent("A");
    expect(within(table).queryByText("Lv")).not.toBeInTheDocument();
    expect(within(table).queryByText("L")).not.toBeInTheDocument();
  });

  it("the counts fold the same way: a late day is a day there, a leave day a day not there", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MARKED });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Asha Verma")).getByRole("cell", { name: "Present: 2" })).toBeInTheDocument();
    expect(within(rowOf("Asha Verma")).getByRole("cell", { name: "Absent: 0" })).toBeInTheDocument();
    expect(within(rowOf("Kabir Rao")).getByRole("cell", { name: "Present: 0" })).toBeInTheDocument();
    expect(within(rowOf("Kabir Rao")).getByRole("cell", { name: "Absent: 2" })).toBeInTheDocument();
  });

  it("the four numbers: the children, the days there, the days not there, the rate", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    open(IN_WEEK, { "GET /attendance/students": () => MARKED });
    const tiles = await screen.findByRole("region", { name: "About the attendance" });
    await waitFor(() => {
      expect(tiles).toHaveTextContent(/Total Students\s*2/);
      expect(tiles).toHaveTextContent(/Present\s*2/); // present 1 + late 1
      expect(tiles).toHaveTextContent(/Absent\s*2/); // absent 1 + leave 1
      expect(tiles).toHaveTextContent(/Attendance Rate\s*50%/);
    });
  });

  it("while attendance has not been taken on any of the days there are no zeros: no counts, a line that says so, dashes in the numbers", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    open(IN_WEEK, { "GET /attendance/students": () => NOTHING_TAKEN });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const heads = headsOf(table);
    for (const gone of ["Present", "Absent", "%"]) expect(heads).not.toContain(gone);
    expect(screen.getByText("Attendance has not been taken for these days yet")).toBeInTheDocument();
    const tiles = screen.getByRole("region", { name: "About the attendance" });
    await waitFor(() => expect(tiles).toHaveTextContent(/Total Students\s*2/));
    expect(tiles).toHaveTextContent(/Present\s*-/);
    expect(tiles).toHaveTextContent(/Absent\s*-/);
    expect(tiles).toHaveTextContent(/Attendance Rate\s*-/);
  });

  it("once a day is taken the counts and the line are back / gone", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MARKED });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(headsOf(table)).toContain("Present");
    expect(screen.queryByText("Attendance has not been taken for these days yet")).not.toBeInTheDocument();
  });

  it("a child's name says no section letter, in a class with one section or with two (the chip says which)", async () => {
    open("/attendance/students?class=c6", { "GET /attendance/students": () => ({ ...RANGE, students: [kid("s9", "Meera Nair", 9, [{ date: "2026-11-03", status: "present", reason: null }], { section: "A" })] }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const meera = rowOf("Meera Nair");
    expect(within(meera).getByRole("button", { name: "Meera Nair" }).parentElement).toHaveTextContent(/^Meera Nair$/);
  });

  it("a child with no mark at all, among children who have: a dash, not a row of zeros", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => ({ ...MARKED, students: [MARKED.students[0], kid("s3", "Newcomer Nair", 3, [])] }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const row = rowOf("Newcomer Nair");
    expect(within(row).getByRole("cell", { name: "Present: none marked" })).toHaveTextContent("–");
    expect(within(row).getByRole("cell", { name: "Absent: none marked" })).toHaveTextContent("–");
    expect(within(row).getByRole("cell", { name: "Percentage" })).toHaveTextContent("–");
  });
});

describe("Student: the register like the reference (2026-11-16, second round)", () => {
  // Monday 16 and Tuesday 17 are sent (the server stops at today); the week asked for runs to Saturday 21.
  const MON_TUE: StudentRange = {
    ...RANGE,
    from: "2026-11-16",
    to: "2026-11-17",
    days: [day("2026-11-16", 1), day("2026-11-17", 2)],
    students: [kid("s1", "Asha Verma", 1, [{ date: "2026-11-16", status: "present", reason: null }])],
  };
  const IN_WEEK = "/attendance/students?from=2026-11-16&to=2026-11-21";
  const dateHeads = (table: HTMLElement) => within(table).getAllByRole("columnheader").filter((h) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d/.test(h.getAttribute("aria-label") ?? ""));

  it("the whole week is there from Monday: Monday to Saturday, the days that have not come are columns too, without a button", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MON_TUE });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(dateHeads(table).map((h) => h.getAttribute("aria-label"))).toEqual(["Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov, coming", "Thu 19 Nov, coming", "Fri 20 Nov, coming", "Sat 21 Nov, coming"]);
    expect(within(table).getByRole("button", { name: "Present and absent on Tue 17 Nov" })).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Wed 18 Nov/ })).not.toBeInTheDocument();
    // Nobody has a mark on a day that has not come.
    expect(within(rowOf("Asha Verma")).queryByLabelText(/18 Nov/)).not.toBeInTheDocument();
  });

  it("a week that is over has only the days the server sent, none coming", async () => {
    const over: StudentRange = { ...MON_TUE, from: "2026-11-09", to: "2026-11-14", days: [9, 10, 11, 12, 13, 14].map((n, i) => day(`2026-11-${String(n).padStart(2, "0")}`, i + 1)), students: [] };
    open("/attendance/students?from=2026-11-09&to=2026-11-14", { "GET /attendance/students": () => ({ ...over, students: MON_TUE.students }) });
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(dateHeads(table)).toHaveLength(6);
    expect(dateHeads(table).some((h) => /coming/.test(h.getAttribute("aria-label") ?? ""))).toBe(false);
  });

  it("a child with no roll number is numbered by the place in the list (and it goes on over the pages)", async () => {
    const noRoll = Array.from({ length: 14 }, (_, i) => kid(`k${i + 1}`, `Child ${String(i + 1).padStart(2, "0")}`, i + 1, [], { rollNumber: null }));
    const { user } = open(IN_WEEK, { "GET /attendance/students": () => ({ ...MON_TUE, students: noRoll, summary: { ...MON_TUE.summary, students: 14 } }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Child 01")).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(rowOf("Child 12")).getAllByRole("cell")[0]).toHaveTextContent("12");
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(within(await screen.findByRole("row", { name: /Child 13/ })).getAllByRole("cell")[0]).toHaveTextContent("13");
  });

  it("a child who has a roll number shows it, not the place in the list", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => ({ ...MON_TUE, students: [kid("s1", "Asha Verma", 7, [])] }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Asha Verma")).getAllByRole("cell")[0]).toHaveTextContent("7");
  });

  it("the pages have the numbers and the arrows only: no Rows per page box", async () => {
    open(IN_WEEK, { "GET /attendance/students": () => MON_TUE });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.getByText("Showing 1 to 1 of 1 student")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toBeInTheDocument();
    expect(screen.queryByText("Rows per page:")).not.toBeInTheDocument();
  });
});

describe("Teacher: who came, and when", () => {
  it("opens on today (one request), with its own date box: the Student page's From / To boxes and row of buttons are not here", async () => {
    const { calls } = open("/attendance/teachers");
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: today, to: today });
    expect(reads(calls, "/attendance/teachers")).toHaveLength(1);
    expect(dateBox({ from: today, to: today })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Class" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("a month has a column for each day and the counts of every teacher", async () => {
    const { calls } = open(`/attendance/teachers?from=${THIS_MONTH.from}&to=${THIS_MONTH.to}`);
    const table = await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: THIS_MONTH.from, to: THIS_MONTH.to });
    expect(reads(calls, "/attendance/teachers")).toHaveLength(1);
    const dev = rowOf("Dev Patel");
    expect(within(dev).getByLabelText("Dev Patel, 2 Nov: Late at 9:00 AM, Late by 30 min")).toHaveTextContent("L");
    expect(within(dev).getByLabelText("Dev Patel, 3 Nov: Absent")).toHaveTextContent("A");
    expect(within(dev).getByLabelText("Dev Patel, 4 Nov: Holiday: Diwali")).toHaveTextContent("H");
    const meena = rowOf("Meena Singh");
    expect(within(meena).getByLabelText("Meena Singh, 2 Nov: Present at 8:10 AM, On time")).toHaveTextContent("P");
    expect(within(meena).getByLabelText("Meena Singh, 3 Nov: Not yet")).toBeInTheDocument();
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(2);
  });

  it("four numbers: the teachers, and how many came, were late and were absent", async () => {
    // A person who wants less motion: the numbers are shown at once instead of counting up.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    open("/attendance/teachers");
    const tiles = await screen.findByRole("region", { name: "About the teachers' attendance" });
    await waitFor(() => {
      expect(tiles).toHaveTextContent(/Teachers\s*2/);
      expect(tiles).toHaveTextContent(/Present\s*1/);
      expect(tiles).toHaveTextContent(/Late\s*1/);
      expect(tiles).toHaveTextContent(/Absent\s*1/);
    });
  });

  it("Today shows the day: each teacher's status, the time they came and how late, and when school starts", async () => {
    const one = { ...TEACHERS, days: [TEACHERS.days[0]], teachers: TEACHERS.teachers.map((t) => ({ ...t, records: [t.records[0]] })) };
    open("/attendance/teachers", { "GET /attendance/teachers": (_b, q) => (q.get("from") === q.get("to") ? one : TEACHERS) });
    const table = await screen.findByRole("table", { name: "Attendance of the teachers on the day" });
    const dev = within(table).getByRole("row", { name: /Dev Patel/ });
    expect(dev).toHaveTextContent("Late");
    expect(dev).toHaveTextContent("9:00 AM");
    expect(dev).toHaveTextContent("Late by 30 min");
    const meena = within(table).getByRole("row", { name: /Meena Singh/ });
    expect(meena).toHaveTextContent("Present");
    expect(meena).toHaveTextContent("8:10 AM");
    expect(meena).toHaveTextContent("On time");
    expect(screen.getByText(/School 8:30 AM to 2:20 PM/)).toBeInTheDocument();
  });

  it("a week shows the time each teacher came, under the mark of every day (2026-11-17)", async () => {
    // Three school days (a week or less): the register of the week.
    const { user } = open("/attendance/teachers", { "GET /attendance/teachers": () => ({ ...TEACHERS, from: "2026-11-02", to: "2026-11-04" }) });
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    await chooseRange(user, "This Week");
    const table = await screen.findByRole("table", { name: "Attendance of the teachers" });
    // The days are named in full (Mon 2), not by a letter.
    expect(within(table).getByRole("columnheader", { name: /^Mon 2 Nov/ })).toBeInTheDocument();
    const dev = rowOf("Dev Patel");
    expect(within(dev).getByLabelText("Dev Patel, 2 Nov: Late at 9:00 AM, Late by 30 min")).toHaveTextContent("L");
    expect(dev).toHaveTextContent("9:00 AM");
    expect(rowOf("Meena Singh")).toHaveTextContent("8:10 AM");
    // A day with no check-in has no time.
    expect(within(rowOf("Dev Patel")).getByLabelText("Dev Patel, 3 Nov: Absent").parentElement).not.toHaveTextContent(/AM|PM/);
  });

  it("a month keeps the marks small: the time of each day is in its hover, not written", async () => {
    open(`/attendance/teachers?from=${THIS_MONTH.from}&to=${THIS_MONTH.to}`);
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    const mark = within(rowOf("Dev Patel")).getByLabelText("Dev Patel, 2 Nov: Late at 9:00 AM, Late by 30 min");
    expect(mark).toHaveAttribute("title", "Dev Patel, 2 Nov: Late at 9:00 AM, Late by 30 min");
    expect(mark.parentElement).not.toHaveTextContent(/AM|PM/);
  });

  it("a teacher's name opens their days with the time of each mark and the log: when, what, by whom", async () => {
    const { user } = open("/attendance/teachers");
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    await user.click(within(rowOf("Dev Patel")).getByRole("button", { name: "Dev Patel" }));
    const dialog = await screen.findByRole("dialog", { name: "Dev Patel" });
    expect(dialog).toHaveTextContent("1 late · 1 absent");
    const days = within(dialog).getByRole("list", { name: "Days" });
    const items = within(days).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2 Nov");
    expect(items[0]).toHaveTextContent("Late");
    expect(items[0]).toHaveTextContent("9:00 AM");
    expect(items[0]).toHaveTextContent("Late by 30 min");
    expect(items[0]).toHaveTextContent("Marked present at 9:00 AM by Dev Patel");
    expect(items[1]).toHaveTextContent("Absent");
  });

  it("says what the server said when it cannot read the sheet", async () => {
    open("/attendance/teachers", { "GET /attendance/teachers": () => new Response(JSON.stringify({ success: false, message: "Choose a year or less" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("Choose a year or less")).toBeInTheDocument();
  });

  it("a school with no teacher says so", async () => {
    open("/attendance/teachers", { "GET /attendance/teachers": () => ({ ...TEACHERS, teachers: [], summary: { teachers: 0, present: 0, late: 0, absent: 0 } }) });
    expect(await screen.findByText("No teacher yet")).toBeInTheDocument();
  });
});

describe("the school sees who is below 75% (2026-11-06)", () => {
  it("a child under 75% has the percentage marked (red, with its reason in the title); a child above does not", async () => {
    open("/attendance/students?class=c5");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(within(rowOf("Kabir Rao")).getByRole("cell", { name: "Percentage" })).toHaveAttribute("title", "Below 75%");
    expect(within(rowOf("Asha Verma")).getByRole("cell", { name: "Percentage" })).not.toHaveAttribute("title");
  });

  it("a teacher under 75% too", async () => {
    open("/attendance/teachers");
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(within(rowOf("Dev Patel")).getByRole("cell", { name: "Percentage" })).toHaveAttribute("title", "Below 75%");
    expect(within(rowOf("Meena Singh")).getByRole("cell", { name: "Percentage" })).not.toHaveAttribute("title");
  });
});

describe("the classes that have not taken today's attendance (2026-11-06)", () => {
  const PENDING = { date: today, working: true, holiday: null, pending: [{ classId: "c5", sectionId: "c5-A", label: "Class 5A" }, { classId: "c1", sectionId: null, label: "Class 1" }] };

  it("a warning names them, one request for it, only on the Student page", async () => {
    const { calls } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    const warning = await screen.findByRole("region", { name: "Attendance not taken today" });
    expect(within(warning).getAllByRole("button").map((b) => b.textContent)).toEqual(["Class 5A", "Class 1"]);
    expect(reads(calls, "/attendance/students/today")).toHaveLength(1);
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    const second = open("/attendance/teachers", { "GET /attendance/students/today": () => PENDING });
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(reads(second.calls, "/attendance/students/today")).toHaveLength(0);
  });

  it("a click on a class opens it, for today", async () => {
    const { calls, user } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    await user.click(await within(await screen.findByRole("region", { name: "Attendance not taken today" })).findByRole("button", { name: "Class 5A" }));
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toEqual({ classId: "c5", sectionId: "c5-A", from: today, to: today }));
    expect(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5A" })).toBeChecked();
  });

  it("a class with no sections opens as the class", async () => {
    const { calls, user } = open("/attendance/students?class=c5", { "GET /attendance/students/today": () => PENDING });
    await user.click(await within(await screen.findByRole("region", { name: "Attendance not taken today" })).findByRole("button", { name: "Class 1" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("classId")).toBe("c1"));
    expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("all");
  });

  it("nothing pending, a holiday, or a failed read: no warning", async () => {
    open("/attendance");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByRole("region", { name: "Attendance not taken today" })).not.toBeInTheDocument();
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    open("/attendance/students", { "GET /attendance/students/today": () => new Response(JSON.stringify({ success: false, message: "Boom" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByRole("region", { name: "Attendance not taken today" })).not.toBeInTheDocument();
  });
});

describe("the school marks a teacher's day (2026-11-06)", () => {
  const SAVED = { ...rec("2026-11-03", "present", "08:20", 0), source: "school" as const, note: "Phone was dead", log: [{ time: "10:00", at: "2026-11-05T04:30:00.000Z", action: "marked_by_school" as const, by: { name: "Asha Admin", role: "school_admin" }, note: "Phone was dead" }] };

  async function openChange(day = "3 Nov", extra: Record<string, Handler> = {}) {
    const ctx = open("/attendance/teachers", extra);
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    await ctx.user.click(within(rowOf("Dev Patel")).getByRole("button", { name: "Dev Patel" }));
    const dialog = await screen.findByRole("dialog", { name: "Dev Patel" });
    await ctx.user.click(within(dialog).getByRole("button", { name: `Change ${day}` }));
    return { ...ctx, dialog };
  }

  it("every day in a teacher's window can be changed: the form has Present, Absent and Leave, the time (for Present) and a note", async () => {
    const { dialog } = await openChange();
    const form = within(dialog).getByRole("group", { name: "Change 3 Nov" });
    expect(within(form).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["Present", "Absent", "Leave"]);
    expect(within(form).getByRole("radio", { name: "Absent" })).toBeChecked(); // what the day is now
    expect(within(form).queryByLabelText("Time")).not.toBeInTheDocument();
    expect(within(form).getByLabelText("Note")).toHaveAttribute("maxlength", "300");
  });

  it("Present asks for the time a teacher came; Save sends the day, the status, the time and the note, and a window says it is done", async () => {
    const { calls, user, dialog } = await openChange("3 Nov", { "PUT /attendance/teachers/t1/day": () => SAVED });
    const form = within(dialog).getByRole("group", { name: "Change 3 Nov" });
    await user.click(within(form).getByRole("radio", { name: "Present" }));
    await user.type(within(form).getByLabelText("Time"), "08:20");
    await user.type(within(form).getByLabelText("Note"), "Phone was dead");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toMatchObject({ path: "/attendance/teachers/t1/day", body: { date: "2026-11-03", status: "present", time: "08:20", note: "Phone was dead" } });
    const done = await screen.findByRole("dialog", { name: "Attendance saved" });
    expect(done).toHaveTextContent("Dev Patel");
    expect(done).toHaveTextContent("Present");
  });

  it("Leave and Absent send no time; an empty note is not sent", async () => {
    const { calls, user, dialog } = await openChange("3 Nov", { "PUT /attendance/teachers/t1/day": () => ({ ...SAVED, status: "leave", checkedInTime: null }) });
    const form = within(dialog).getByRole("group", { name: "Change 3 Nov" });
    await user.click(within(form).getByRole("radio", { name: "Leave" }));
    expect(within(form).queryByLabelText("Time")).not.toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({ date: "2026-11-03", status: "leave" });
  });

  it("the sheet reads again after a save, and the window shows the new word and the log line of who did it", async () => {
    let state = TEACHERS;
    const { calls, user, dialog } = await openChange("3 Nov", {
      "GET /attendance/teachers": () => state,
      "PUT /attendance/teachers/t1/day": () => {
        state = { ...TEACHERS, teachers: TEACHERS.teachers.map((t) => (t.id === "t1" ? { ...t, records: t.records.map((r) => (r.date === "2026-11-03" ? SAVED : r)), tally: { ...t.tally, present: 1, late: 1, absent: 0, days: 2, percent: 100 } } : t)) };
        return SAVED;
      },
    });
    const form = within(dialog).getByRole("group", { name: "Change 3 Nov" });
    await user.click(within(form).getByRole("radio", { name: "Present" }));
    await user.type(within(form).getByLabelText("Time"), "08:20");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await user.click(await within(await screen.findByRole("dialog", { name: "Attendance saved" })).findByRole("button", { name: "OK" }));
    await waitFor(() => expect(reads(calls, "/attendance/teachers")).toHaveLength(2));
    const days = await within(await screen.findByRole("dialog", { name: "Dev Patel" })).findByRole("list", { name: "Days" });
    await waitFor(() => expect(days).toHaveTextContent("Marked by Asha Admin (school): Phone was dead"));
    expect(days).toHaveTextContent("8:20 AM");
  });

  it("a refusal of the server (a holiday) is read in the form and nothing changes", async () => {
    const { user, dialog } = await openChange("3 Nov", {
      "PUT /attendance/teachers/t1/day": () => new Response(JSON.stringify({ success: false, message: "Today is a holiday (Diwali): there is no attendance.", code: "NOT_A_WORKING_DAY" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const form = within(dialog).getByRole("group", { name: "Change 3 Nov" });
    await user.click(within(form).getByRole("radio", { name: "Leave" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByText("Today is a holiday (Diwali): there is no attendance.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Attendance saved" })).not.toBeInTheDocument();
  });

  it("Cancel closes the form and sends nothing", async () => {
    const { calls, user, dialog } = await openChange();
    await user.click(within(within(dialog).getByRole("group", { name: "Change 3 Nov" })).getByRole("button", { name: "Cancel" }));
    expect(within(dialog).queryByRole("group", { name: "Change 3 Nov" })).not.toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("a day of a teacher who has no login can be marked too (it is the only way they are counted)", async () => {
    const noLogin = { ...TEACHERS, teachers: [{ ...TEACHERS.teachers[0], records: [rec("2026-11-02", "no_login"), rec("2026-11-03", "no_login")], tally: { present: 0, late: 0, absent: 0, leave: 0, days: 0, percent: null } }] };
    const { user } = open("/attendance/teachers", { "GET /attendance/teachers": () => noLogin });
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    await user.click(within(rowOf("Dev Patel")).getByRole("button", { name: "Dev Patel" }));
    const dialog = await screen.findByRole("dialog", { name: "Dev Patel" });
    expect(within(dialog).getByRole("button", { name: "Change 2 Nov" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("No login");
  });
});

describe("a year that is over is open (the school admin looks at the past)", () => {
  const OVER = { id: "y26", name: "2025-2026", startDate: "2025-04-01", endDate: "2026-03-31", status: "closed", activatedAt: null };
  const RUNNING = { id: "y27", name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "active", activatedAt: null };
  const YEARS = { "GET /academics/academic-years": () => [RUNNING, OVER] };
  afterEach(() => {
    store.dispatch(yearViewChanged(null));
  });

  it("starts on the last month of that year (this month would be empty), and does not ask who has not taken today's attendance", async () => {
    store.dispatch(yearViewChanged("y26"));
    const { calls } = open("/attendance/students", YEARS);
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toMatchObject({ from: "2026-03-01", to: "2026-03-31" }));
    expect(reads(calls, "/attendance/students/today")).toHaveLength(0);
  });

  it("the Teacher page starts on the same month", async () => {
    store.dispatch(yearViewChanged("y26"));
    const { calls } = open("/attendance/teachers", YEARS);
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toMatchObject({ from: "2026-03-01", to: "2026-03-31" }));
  });

  it("a range the school picked is kept, whatever year is open", async () => {
    store.dispatch(yearViewChanged("y26"));
    const { calls } = open("/attendance/students?from=2026-11-01&to=2026-11-30", YEARS);
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toMatchObject({ from: "2026-11-01", to: "2026-11-30" }));
  });
});
