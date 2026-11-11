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
import { monthBounds, shiftMonth } from "../../../utils/calendar";
import { todayInIndia } from "../../../utils/students";
import AttendanceRedirect from "../AttendanceRedirect";
import StaffAttendancePage from "../StaffAttendance";
import StudentAttendancePage from "../StudentAttendance";
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
  from: THIS_MONTH.from,
  to: today,
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

describe("three pages, no tabs (2026-11-10: they were the three tabs of one page)", () => {
  it("Student has its own title and no tabs, and asks only for the students' attendance", async () => {
    const { calls } = open();
    expect(await screen.findByRole("heading", { name: "Student attendance", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
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

  it("Staff is coming: it has its own title, says so and asks the server nothing", async () => {
    const { calls } = open("/attendance/staff");
    expect(await screen.findByRole("heading", { name: "Staff attendance", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Staff attendance is coming soon")).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith("/attendance"))).toHaveLength(0);
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
  it("lists every class by name; the first is picked to start with, and the children of it are asked for this month (one request)", async () => {
    const { calls } = open();
    const classes = await screen.findByRole("radiogroup", { name: "Class" });
    expect(within(classes).getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent)).toEqual(["Class 1", "Class 5", "Class 6", "Class 9"]);
    expect(within(classes).getByRole("radio", { name: "Class 1" })).toBeChecked();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const q = lastQuery(calls, "/attendance/students");
    expect(Object.fromEntries(q)).toEqual({ classId: "c1", sectionId: "all", from: THIS_MONTH.from, to: THIS_MONTH.to });
    expect(reads(calls, "/attendance/students")).toHaveLength(1);
  });

  it("a class with sections shows its sections as soon as it is picked (All sections to start with); a class without shows none", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.queryByRole("radiogroup", { name: "Section" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5" }));
    const sections = await screen.findByRole("radiogroup", { name: "Section" });
    expect(within(sections).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["All sections", "A", "B"]);
    expect(within(sections).getByRole("radio", { name: "All sections" })).toBeChecked();
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("classId")).toBe("c5"));
    expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("all");

    await user.click(within(sections).getByRole("radio", { name: "A" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("c5-A"));
    await user.click(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 9" }));
    await waitFor(() => expect(screen.queryByRole("radiogroup", { name: "Section" })).not.toBeInTheDocument());
    expect(lastQuery(calls, "/attendance/students").get("sectionId")).toBe("all");
  });

  it("the choice is kept in the address (class, section and the days), so a link or Back opens the same list", async () => {
    const { router, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    await user.click(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5" }));
    await user.click(await within(await screen.findByRole("radiogroup", { name: "Section" })).findByRole("radio", { name: "B" }));
    await waitFor(() => expect(router.state.location.search).toContain("section=c5-B"));
    expect(router.state.location.search).toContain("class=c5");
  });

  it("opens on what the address says: a class, a section and a range from May to November", async () => {
    const { calls } = open("/attendance/students?class=c5&section=c5-A&from=2026-05-01&to=2026-11-30");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toEqual({ classId: "c5", sectionId: "c5-A", from: "2026-05-01", to: "2026-11-30" });
    expect(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5" })).toBeChecked();
    expect(within(screen.getByRole("radiogroup", { name: "Section" })).getByRole("radio", { name: "A" })).toBeChecked();
  });

  it("the ranges in one click: Last month asks for last month's days", async () => {
    const { calls, user } = open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Last month" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/students").get("from")).toBe(LAST_MONTH.from));
    expect(lastQuery(calls, "/attendance/students").get("to")).toBe(LAST_MONTH.to);
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute("aria-pressed", "false");
  });

  it("has a From and a To box for any days", async () => {
    open();
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });
});

describe("Student: the list", () => {
  it("four numbers of the class: how many children, the average, the absences and the late comings", async () => {
    // A person who wants less motion: the numbers are shown at once instead of counting up.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    open();
    const tiles = await screen.findByRole("region", { name: "About the attendance" });
    // The numbers count up to their value.
    await waitFor(() => {
      expect(tiles).toHaveTextContent(/Students\s*2/);
      expect(tiles).toHaveTextContent(/Attendance\s*75%/);
      expect(tiles).toHaveTextContent(/Absent\s*1/);
      expect(tiles).toHaveTextContent(/Late\s*1/);
    });
  });

  it("every child with a column for each day up to a month: P present, A absent, L late; a day nobody took is empty; a holiday says so", async () => {
    open();
    const table = await screen.findByRole("table", { name: "Attendance of Class 5" });
    const head = within(table).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label") ?? h.textContent);
    expect(head).toEqual(expect.arrayContaining(["Mon 2 Nov, Holiday: Diwali", "Tue 3 Nov", "Wed 4 Nov", "Thu 5 Nov, attendance not taken"]));
    const asha = rowOf("Asha Verma");
    expect(within(asha).getByLabelText("Asha Verma, 3 Nov: Present")).toHaveTextContent("P");
    expect(within(asha).getByLabelText("Asha Verma, 4 Nov: Late, Bus was late")).toHaveTextContent("L");
    const kabir = rowOf("Kabir Rao");
    expect(within(kabir).getByLabelText("Kabir Rao, 3 Nov: Absent, Fever")).toHaveTextContent("A");
    expect(within(kabir).queryByLabelText(/5 Nov/)).not.toBeInTheDocument();
  });

  it("each child's counts and percentage, and the section when the whole class is read together", async () => {
    open("/attendance/students?class=c5");
    await screen.findByRole("table", { name: "Attendance of Class 5" });
    const kabir = rowOf("Kabir Rao");
    expect(within(kabir).getByRole("cell", { name: "Present: 1" })).toBeInTheDocument();
    expect(within(kabir).getByRole("cell", { name: "Absent: 1" })).toBeInTheDocument();
    expect(within(kabir).getByRole("cell", { name: "Percentage" })).toHaveTextContent("50%");
    expect(kabir).toHaveTextContent("B");
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

describe("Teacher: who came, and when", () => {
  it("asks for this month and lists every teacher with a column for each day and their counts", async () => {
    const { calls } = open("/attendance/teachers");
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
    const { calls, user } = open("/attendance/teachers", { "GET /attendance/teachers": (_b, q) => (q.get("from") === q.get("to") ? one : TEACHERS) });
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    await user.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(lastQuery(calls, "/attendance/teachers").get("from")).toBe(today));
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
  const PENDING = { date: today, working: true, holiday: null, pending: [{ classId: "c5", sectionId: "c5-A", label: "Class 5 - A" }, { classId: "c1", sectionId: null, label: "Class 1" }] };

  it("a warning names them, one request for it, only on the Student page", async () => {
    const { calls } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    const warning = await screen.findByRole("region", { name: "Attendance not taken today" });
    expect(within(warning).getAllByRole("button").map((b) => b.textContent)).toEqual(["Class 5 - A", "Class 1"]);
    expect(reads(calls, "/attendance/students/today")).toHaveLength(1);
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    const second = open("/attendance/teachers", { "GET /attendance/students/today": () => PENDING });
    await screen.findByRole("table", { name: "Attendance of the teachers" });
    expect(reads(second.calls, "/attendance/students/today")).toHaveLength(0);
  });

  it("a click on a class opens it, for today", async () => {
    const { calls, user } = open("/attendance/students", { "GET /attendance/students/today": () => PENDING });
    await user.click(await within(await screen.findByRole("region", { name: "Attendance not taken today" })).findByRole("button", { name: "Class 5 - A" }));
    await waitFor(() => expect(Object.fromEntries(lastQuery(calls, "/attendance/students"))).toEqual({ classId: "c5", sectionId: "c5-A", from: today, to: today }));
    expect(within(screen.getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name: "Class 5" })).toBeChecked();
    expect(within(screen.getByRole("radiogroup", { name: "Section" })).getByRole("radio", { name: "A" })).toBeChecked();
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
