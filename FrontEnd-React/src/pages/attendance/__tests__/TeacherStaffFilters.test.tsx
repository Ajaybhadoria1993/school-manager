import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { signInAs, signOut } from "../../../test/session";
import type { SheetDay, StaffSheet, TeacherRecord, TeacherSheet, TeacherSheetRow } from "../../../types";
import { todayInIndia } from "../../../utils/students";
import StaffAttendancePage from "../StaffAttendance";
import TeacherAttendancePage from "../TeacherAttendance";

/**
 * Attendance > Teacher and Attendance > Staff with a search and a filter (2026-11-22, asked for: "teacher me search bar aur filter: all teacher
 * ya class dalu to usi class ke teacher; staff me class nahi, department: reception, management...; admin present, absent, leave dekh sake").
 * One line of controls on each: the days, the search (the server's, asked once the typing stops), and the Class (teachers) or the Department
 * (staff). The counts on top are of the class or the department, never of the search.
 */

const today = todayInIndia();
const DAYS: SheetDay[] = [{ date: today, weekday: 2, working: true, holiday: null, start: "08:30", end: "14:20" }];
const rec = (status: TeacherRecord["status"], time: string | null = null, late: number | null = null, note: string | null = null): TeacherRecord => ({ date: today, status, checkedInTime: time, lateByMinutes: late, note, source: null, log: [] });
const tally = (r: TeacherRecord) => ({ present: +(r.status === "present"), late: +(r.status === "late"), absent: +(r.status === "absent"), leave: +(r.status === "leave"), days: 1, percent: null });
const person = (id: string, name: string, r: TeacherRecord, over: Partial<TeacherSheetRow> = {}): TeacherSheetRow => ({ id, name, employeeCode: null, designation: null, records: [r], tally: tally(r), ...over });
const sum = (rows: TeacherSheetRow[], key: "present" | "late" | "absent" | "leave") => rows.reduce((n, r) => n + r.tally[key], 0);
const found = (rows: TeacherSheetRow[], q: URLSearchParams) => rows.filter((r) => r.name.toLowerCase().includes((q.get("search") ?? "").toLowerCase()));

/** Dev and Meena teach Class 5; Kiran teaches nothing. */
const TEACHERS = [person("t1", "Dev Patel", rec("late", "09:00", 30)), person("t2", "Kiran Rao", rec("absent")), person("t3", "Meena Singh", rec("present", "08:10", 0))];
const OF_CLASS5 = ["t1", "t3"];
function teacherSheet(q: URLSearchParams): TeacherSheet {
  const scope = TEACHERS.filter((t) => !q.get("classId") || (q.get("classId") === "c5" && OF_CLASS5.includes(t.id)));
  return { from: today, to: today, days: DAYS, teachers: found(scope, q), summary: { teachers: scope.length, present: sum(scope, "present"), late: sum(scope, "late"), absent: sum(scope, "absent") } };
}

const dept = (key: string, label: string) => ({ department: { key, label } });
const STAFF = [
  person("m1", "Asha Rao", rec("present", "08:10", 0), dept("receptionist", "Receptionist")),
  person("m2", "Ramesh Yadav", rec("leave", null, null, "Wedding"), dept("peon", "Peon / attendant")),
  person("m3", "Ravi Kumar", rec("absent"), dept("accountant", "Accountant")),
];
const DEPARTMENTS = [
  { key: "accountant", label: "Accountant", count: 1 },
  { key: "receptionist", label: "Receptionist", count: 1 },
  { key: "peon", label: "Peon / attendant", count: 1 },
];
function staffSheet(q: URLSearchParams): StaffSheet {
  const scope = STAFF.filter((s) => !q.get("role") || s.department?.key === q.get("role"));
  return {
    from: today,
    to: today,
    days: DAYS,
    departments: DEPARTMENTS,
    staff: found(scope, q),
    summary: { staff: scope.length, present: sum(scope, "present"), late: sum(scope, "late"), absent: sum(scope, "absent"), leave: sum(scope, "leave") },
  };
}

function open(path: string, extra: Record<string, Handler> = {}) {
  signInAs("school_admin", []);
  // The counts count up, as on the dashboard; for someone who asks for less motion they are there at once (so here too).
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /attendance/teachers": (_b, q) => teacherSheet(q),
    "GET /attendance/staff": (_b, q) => staffSheet(q),
    ...extra,
  });
  const router = createMemoryRouter(
    [
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
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const reads = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path);
const lastQuery = (calls: Call[], path: string) => new URLSearchParams(reads(calls, path).at(-1)?.query ?? "");
const searchesAsked = (calls: Call[], path: string) => reads(calls, path).map((c) => new URLSearchParams(c.query).get("search"));
const namesIn = (table: string) => within(screen.getByRole("table", { name: table })).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("button")[0].textContent);
const teacherCounts = () => screen.getByRole("region", { name: "About the teachers' attendance" });

describe("Attendance > Teacher: the search and the Class", () => {
  const TABLE = "Attendance of the teachers on the day";

  it("has the days, the search and the Class (All classes) in ONE line", async () => {
    open("/attendance/teachers");
    await screen.findByRole("table", { name: TABLE });
    const bar = within(screen.getByRole("search", { name: "Find teachers" }));
    expect(bar.getByRole("group", { name: "Dates" })).toBeInTheDocument();
    expect(bar.getByRole("textbox", { name: "Search the teachers" })).toBeInTheDocument();
    expect(bar.getByLabelText("Class")).toHaveTextContent("All classes");
  });

  it("a class picked is asked of the server and only its teachers are shown, with its counts; All classes brings everyone back", async () => {
    const { calls, router, user } = open("/attendance/teachers");
    await screen.findByRole("table", { name: TABLE });
    expect(namesIn(TABLE)).toEqual(["Dev Patel", "Kiran Rao", "Meena Singh"]);
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "Class 5" }));
    await waitFor(() => expect(namesIn(TABLE)).toEqual(["Dev Patel", "Meena Singh"]));
    expect(Object.fromEntries(lastQuery(calls, "/attendance/teachers"))).toEqual({ from: today, to: today, classId: "c5" });
    expect(router.state.location.search).toContain("class=c5");
    await waitFor(() => expect(teacherCounts()).toHaveTextContent(/Teachers\s*2/));
    await user.click(screen.getByLabelText("Class"));
    await user.click(await screen.findByRole("option", { name: "All classes" }));
    await waitFor(() => expect(namesIn(TABLE)).toHaveLength(3));
    expect(lastQuery(calls, "/attendance/teachers").get("classId")).toBeNull();
  });

  it("the search is the server's: three keys are one request once the typing stops; the counts stay the school's", async () => {
    const { calls, user } = open("/attendance/teachers");
    await screen.findByRole("table", { name: TABLE });
    await user.type(screen.getByRole("textbox", { name: "Search the teachers" }), "mee");
    await waitFor(() => expect(namesIn(TABLE)).toEqual(["Meena Singh"]));
    expect(searchesAsked(calls, "/attendance/teachers")).toEqual([null, "mee"]);
    expect(teacherCounts()).toHaveTextContent(/Teachers\s*3/);
  });

  it("nobody found says so, with a way to clear the search", async () => {
    const { calls, user } = open("/attendance/teachers?q=zzz");
    expect(await screen.findByText("No teacher matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await screen.findByRole("table", { name: TABLE });
    expect(searchesAsked(calls, "/attendance/teachers").at(-1)).toBeNull();
  });

  it("a class with no teacher yet says so", async () => {
    open("/attendance/teachers?class=c9");
    expect(await screen.findByText("No teacher in this class yet")).toBeInTheDocument();
  });
});

describe("Attendance > Staff: the department, the search, and Present / Absent / Leave", () => {
  const TABLE = "Attendance of the staff on the day";

  it("has the days, the search and the Department in ONE line; the departments are the ones the school has, with how many", async () => {
    const { user } = open("/attendance/staff");
    await screen.findByRole("table", { name: TABLE });
    const bar = within(screen.getByRole("search", { name: "Find staff" }));
    expect(bar.getByRole("group", { name: "Dates" })).toBeInTheDocument();
    expect(bar.getByRole("textbox", { name: "Search the staff" })).toBeInTheDocument();
    expect(bar.getByLabelText("Department")).toHaveTextContent("All departments");
    await user.click(screen.getByLabelText("Department"));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["All departments", "Accountant (1)", "Receptionist (1)", "Peon / attendant (1)"]);
  });

  it("every staff member with their department under the name, their status, and five counts: Staff, Present, Late, Absent, On leave", async () => {
    open("/attendance/staff");
    await screen.findByRole("table", { name: TABLE });
    expect(namesIn(TABLE)).toEqual(["Asha Rao", "Ramesh Yadav", "Ravi Kumar"]);
    const ramesh = screen.getByRole("row", { name: /Ramesh Yadav/ });
    expect(ramesh).toHaveTextContent("Peon / attendant");
    expect(ramesh).toHaveTextContent("Leave");
    const counts = screen.getByRole("region", { name: "About the staff's attendance" });
    await waitFor(() => expect(counts).toHaveTextContent(/Staff\s*3/));
    expect(counts).toHaveTextContent(/Present\s*1/);
    expect(counts).toHaveTextContent(/Absent\s*1/);
    expect(counts).toHaveTextContent(/On leave\s*1/);
  });

  it("a department picked is asked of the server (and kept in the address); only its staff, with its counts", async () => {
    const { calls, router, user } = open("/attendance/staff");
    await screen.findByRole("table", { name: TABLE });
    await user.click(screen.getByLabelText("Department"));
    await user.click(await screen.findByRole("option", { name: "Receptionist (1)" }));
    await waitFor(() => expect(namesIn(TABLE)).toEqual(["Asha Rao"]));
    expect(Object.fromEntries(lastQuery(calls, "/attendance/staff"))).toEqual({ from: today, to: today, role: "receptionist" });
    expect(router.state.location.search).toContain("department=receptionist");
    await waitFor(() => expect(screen.getByRole("region", { name: "About the staff's attendance" })).toHaveTextContent(/Staff\s*1/));
  });

  it("a department in the address that is not one is not asked for (every department is shown)", async () => {
    const { calls } = open("/attendance/staff?department=pilot");
    await screen.findByRole("table", { name: TABLE });
    expect(lastQuery(calls, "/attendance/staff").get("role")).toBeNull();
  });

  it("the search is the server's: one request once the typing stops; nobody found says so, with Clear search", async () => {
    const { calls, user } = open("/attendance/staff");
    await screen.findByRole("table", { name: TABLE });
    await user.type(screen.getByRole("textbox", { name: "Search the staff" }), "kum");
    await waitFor(() => expect(namesIn(TABLE)).toEqual(["Ravi Kumar"]));
    expect(searchesAsked(calls, "/attendance/staff")).toEqual([null, "kum"]);
    await user.clear(screen.getByRole("textbox", { name: "Search the staff" }));
    await user.type(screen.getByRole("textbox", { name: "Search the staff" }), "zzz");
    expect(await screen.findByText("No staff member matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    await screen.findByRole("table", { name: TABLE });
  });

  it("a name opens the staff member's days to READ: the school never marks or changes a staff day (they mark themselves with their own login)", async () => {
    const { calls, user } = open("/attendance/staff");
    await screen.findByRole("table", { name: TABLE });
    await user.click(screen.getByRole("button", { name: "Ravi Kumar" }));
    const dialog = await screen.findByRole("dialog", { name: "Ravi Kumar" });
    expect(within(dialog).getByRole("list", { name: "Days" })).toHaveTextContent("Absent");
    expect(within(dialog).queryByRole("button", { name: /^Change / })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("no staff yet says so", async () => {
    open("/attendance/staff", { "GET /attendance/staff": (_b, q) => ({ ...staffSheet(q), departments: [], staff: [], summary: { staff: 0, present: 0, late: 0, absent: 0, leave: 0 } }) });
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
  });
});
