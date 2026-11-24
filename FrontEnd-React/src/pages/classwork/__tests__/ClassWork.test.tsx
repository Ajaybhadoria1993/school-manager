import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { AttendanceSheet, MyClass, UserRole } from "../../../types";
import { todayInIndia } from "../../../utils/students";
import DashboardPage from "../../dashboard/Dashboard";
import ClassWorkPage from "../ClassWorkPage";

/** A teacher's classes and a class's work (docs/parent-teacher-flow.md): phase 3, attendance in one Save. */

const FIVE_A: MyClass = { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", isClassTeacher: true, subjects: [{ id: "maths", name: "Mathematics" }] };
const today = todayInIndia();
const SHEET: AttendanceSheet = {
  classId: "c5",
  sectionId: "c5-A",
  label: "Class 5 - A",
  date: today,
  holiday: null,
  saved: false,
  markedBy: null,
  counts: { present: 1, absent: 0, late: 0, leave: 1 },
  students: [
    { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, status: "present", reason: null },
    { id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", rollNumber: 2, status: "leave", reason: null },
  ],
};

function openPage(path: string, role: UserRole = "teacher", extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Meena Singh", email: null, username: "meena", role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/my-classes": () => ({ items: [FIVE_A] }),
    "GET /staff/teachers/me": () => new Response(JSON.stringify({ success: false, message: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }),
    "GET /subjects": () => ({ items: [] }),
    "GET /classroom/attendance": () => SHEET,
    "GET /classroom/attendance/register": () => REGISTER,
    "PUT /classroom/attendance/student": () => ({ studentId: "s1", date: today, status: "absent" }),
    "PUT /classroom/attendance": (body) => {
      const marks = (body as { marks: { studentId: string; status: string }[] }).marks;
      const students = SHEET.students.map((st) => ({ ...st, status: (marks.find((m) => m.studentId === st.id)?.status ?? "present") as AttendanceSheet["students"][number]["status"] }));
      const count = (s: string) => students.filter((st) => st.status === s).length;
      return { ...SHEET, saved: true, markedBy: { name: "Meena Singh", role: "teacher" }, students, counts: { present: count("present"), absent: count("absent"), late: count("late"), leave: count("leave") } };
    },
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/class-work/:classId", element: <ClassWorkPage /> },
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
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");

describe("a teacher's home", () => {
  it("lists My classes: each class, whether they are its class teacher, and their subjects; a class opens its work", async () => {
    const { user, router } = openPage("/dashboard");
    const list = await screen.findByRole("list", { name: "My classes" });
    const item = within(list).getByRole("link", { name: /Class 5 - A/ });
    expect(item).toHaveTextContent("Class teacher");
    expect(item).toHaveTextContent("Mathematics");
    await user.click(item);
    expect(router.state.location.pathname).toBe("/class-work/c5");
    expect(router.state.location.search).toBe("?section=c5-A");
  });
});

// The class teacher's week (2026-11-17): today is sent, nobody has a mark yet, so today says Not taken.
const REGISTER = {
  label: "Class 5 - A",
  from: today,
  to: today,
  // A Tuesday whatever day the tests run on (a Sunday would say nothing).
  days: [{ date: today, weekday: 2, holiday: null, taken: false }],
  students: SHEET.students.map((st) => ({ id: st.id, name: st.name, admissionNumber: st.admissionNumber, rollNumber: st.rollNumber, section: "A", records: [], tally: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null } })),
  summary: { students: SHEET.students.length, present: 0, absent: 0, late: 0, leave: 0, percent: null },
};

describe("the class teacher's register in the Attendance tab (2026-11-17)", () => {
  it("is above the day's sheet: the week with Not taken, and the sheet to take the whole day", async () => {
    const { calls } = openPage("/class-work/c5?section=c5-A");
    expect(await screen.findByRole("table", { name: "Attendance of Class 5 - A" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Attendance" })).toBeInTheDocument();
    const read = calls.find((c) => c.path === "/classroom/attendance/register");
    expect(read?.query).toContain("classId=c5");
    expect(read?.query).toContain("sectionId=c5-A");
  });

  it("a click on a cell marks one child on one day, with one request for that child", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A");
    const table = await screen.findByRole("table", { name: "Attendance of Class 5 - A" });
    const row = within(table).getByRole("row", { name: /Asha Verma/ });
    const notTaken = within(row).getAllByRole("button", { name: /not taken/ });
    await user.click(notTaken[0]);
    await user.click(within(await screen.findByRole("dialog", { name: /Asha Verma/ })).getByRole("button", { name: /Absent/ }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT" && c.path === "/classroom/attendance/student")).toHaveLength(1));
    expect(calls.find((c) => c.path === "/classroom/attendance/student")?.body).toEqual({ studentId: "s1", date: today, status: "absent" });
    // The class's day sheet is the whole day's and was not saved by it.
    expect(calls.filter((c) => c.method === "PUT" && c.path === "/classroom/attendance")).toHaveLength(0);
  });

  it("a teacher who is not the class teacher has neither the register nor the sheet", async () => {
    openPage("/class-work/c5?section=c5-A", "teacher", { "GET /classroom/my-classes": () => ({ items: [{ ...FIVE_A, isClassTeacher: false }] }) });
    await screen.findByRole("heading", { name: "Class 5 - A", level: 1 });
    expect(screen.queryByRole("table", { name: /Attendance of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Attendance" })).not.toBeInTheDocument();
  });
});

describe("a class's attendance", () => {
  it("opens on today: every child with their mark (approved leave already Leave)", async () => {
    const { calls } = openPage("/class-work/c5?section=c5-A");
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Attendance" });
    expect(within(within(list).getByRole("listitem", { name: "Asha Verma" })).getByRole("radio", { name: "Present" })).toBeChecked();
    expect(within(within(list).getByRole("listitem", { name: "Kabir Rao" })).getByRole("radio", { name: "Leave" })).toBeChecked();
    expect(calls.find((c) => c.path === "/classroom/attendance")?.query).toBe(`?classId=c5&sectionId=c5-A&date=${today}`);
  });

  it("one click makes a child Absent, one Save keeps the day, and a window says how many were present", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A");
    const list = await screen.findByRole("list", { name: "Attendance" });
    await user.click(within(within(list).getByRole("listitem", { name: "Asha Verma" })).getByRole("radio", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({
      classId: "c5",
      sectionId: "c5-A",
      date: today,
      marks: [
        { studentId: "s1", status: "absent" },
        { studentId: "s2", status: "leave" },
      ],
    });
    const done = await screen.findByRole("dialog", { name: "Attendance saved" });
    expect(done).toHaveTextContent("0 present");
    expect(done).toHaveTextContent("1 absent");
    expect(done).toHaveTextContent("1 on leave");
  });

  it("a holiday says so and has nothing to save", async () => {
    openPage("/class-work/c5?section=c5-A", "teacher", { "GET /classroom/attendance": () => ({ ...SHEET, holiday: { title: "Diwali" } }) });
    expect(await screen.findByText("Holiday: Diwali")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save attendance" })).not.toBeInTheDocument();
  });

  it("a teacher who is not the class teacher has no attendance here", async () => {
    openPage("/class-work/c5?section=c5-A", "teacher", { "GET /classroom/my-classes": () => ({ items: [{ ...FIVE_A, isClassTeacher: false }] }) });
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Attendance" })).not.toBeInTheDocument();
  });
});

describe("the reason of an absence (2026-11-06)", () => {
  const asha = () => within(screen.getByRole("listitem", { name: "Asha Verma" }));

  it("a child marked Absent or Late gets a Reason box; a child Present has none", async () => {
    const { user } = openPage("/class-work/c5?section=c5-A");
    await screen.findByRole("list", { name: "Attendance" });
    expect(asha().queryByRole("textbox", { name: "Reason for Asha Verma" })).not.toBeInTheDocument();
    await user.click(asha().getByRole("radio", { name: "Absent" }));
    expect(asha().getByRole("textbox", { name: "Reason for Asha Verma" })).toHaveAttribute("maxlength", "200");
    await user.click(asha().getByRole("radio", { name: "Late" }));
    expect(asha().getByRole("textbox", { name: "Reason for Asha Verma" })).toBeInTheDocument();
    await user.click(asha().getByRole("radio", { name: "Present" }));
    expect(asha().queryByRole("textbox", { name: "Reason for Asha Verma" })).not.toBeInTheDocument();
  });

  it("the reason is sent with the mark when the day is saved; the children with none send none", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A");
    await screen.findByRole("list", { name: "Attendance" });
    await user.click(asha().getByRole("radio", { name: "Absent" }));
    await user.type(asha().getByRole("textbox", { name: "Reason for Asha Verma" }), "  Fever, doctor's advice ");
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({
      classId: "c5",
      sectionId: "c5-A",
      date: today,
      marks: [
        { studentId: "s1", status: "absent", reason: "Fever, doctor's advice" },
        { studentId: "s2", status: "leave" },
      ],
    });
  });

  it("a reason already saved is in the box when the day is opened, and changing the child back to Present drops it", async () => {
    const withReason = { ...SHEET, saved: true, students: [{ ...SHEET.students[0], status: "absent" as const, reason: "Wedding" }, SHEET.students[1]] };
    const { calls, user } = openPage("/class-work/c5?section=c5-A", "teacher", { "GET /classroom/attendance": () => withReason });
    await screen.findByRole("list", { name: "Attendance" });
    await waitFor(() => expect(asha().getByRole("textbox", { name: "Reason for Asha Verma" })).toHaveValue("Wedding"));
    await user.click(asha().getByRole("radio", { name: "Present" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect((puts(calls)[0].body as { marks: object[] }).marks[0]).toEqual({ studentId: "s1", status: "present" });
  });

  it("a reason typed and then the child changed to Late keeps what was typed", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A");
    await screen.findByRole("list", { name: "Attendance" });
    await user.click(asha().getByRole("radio", { name: "Absent" }));
    await user.type(asha().getByRole("textbox", { name: "Reason for Asha Verma" }), "Bus");
    await user.click(asha().getByRole("radio", { name: "Late" }));
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect((puts(calls)[0].body as { marks: object[] }).marks[0]).toEqual({ studentId: "s1", status: "late", reason: "Bus" });
  });
});

describe("the marking sheet in the look of the reference pictures (2026-11-22)", () => {
  const row = (name: string) => within(screen.getByRole("listitem", { name }));
  const summary = () => within(screen.getByRole("region", { name: "Summary of the day" }));
  /** "Absent1": the name of a count and its number, as the summary writes them. */
  const countOf = (label: string) => summary().getByText(label).parentElement!.textContent;
  async function open(extra: Record<string, Handler> = {}) {
    const page = openPage("/class-work/c5?section=c5-A", "teacher", extra);
    await screen.findByRole("list", { name: "Attendance" });
    return page;
  }

  it("each child has four short buttons, P, A, L and Lv, and the lit one is a solid colour (the full words are for a screen reader)", async () => {
    await open();
    const asha = row("Asha Verma");
    for (const letter of ["P", "A", "L", "Lv"]) expect(asha.getByText(letter)).toBeInTheDocument();
    expect(asha.getByRole("radio", { name: "Present" }).closest("label")!.className).toContain("bg-success");
    expect(asha.getByRole("radio", { name: "Absent" }).closest("label")!.className).not.toContain("bg-danger");
    expect(row("Kabir Rao").getByRole("radio", { name: "Leave" }).closest("label")!.className).toContain("bg-info");
  });

  it("Today's summary: a ring and the four counts, which follow every click", async () => {
    const { user } = await open();
    expect(summary().getByRole("heading", { name: "Today's summary" })).toBeInTheDocument();
    expect(summary().getByRole("img", { name: "50% came to school" })).toBeInTheDocument();
    expect([countOf("Present"), countOf("Absent"), countOf("Late"), countOf("On leave")]).toEqual(["Present1", "Absent0", "Late0", "On leave1"]);
    await user.click(row("Asha Verma").getByRole("radio", { name: "Absent" }));
    expect([countOf("Present"), countOf("Absent"), countOf("On leave")]).toEqual(["Present0", "Absent1", "On leave1"]);
    expect(summary().getByRole("img", { name: "0% came to school" })).toBeInTheDocument();
    await user.click(row("Asha Verma").getByRole("radio", { name: "Late" }));
    // A child who came late came: late is there.
    expect(summary().getByRole("img", { name: "50% came to school" })).toBeInTheDocument();
  });

  it("Mark all present puts every child to Present except the one on an approved leave, and takes their reasons away", async () => {
    const { calls, user } = await open();
    await user.click(row("Asha Verma").getByRole("radio", { name: "Absent" }));
    await user.type(row("Asha Verma").getByRole("textbox", { name: "Reason for Asha Verma" }), "Fever");
    await user.click(screen.getByRole("button", { name: "Mark all present" }));
    expect(row("Asha Verma").getByRole("radio", { name: "Present" })).toBeChecked();
    expect(row("Asha Verma").queryByRole("textbox", { name: "Reason for Asha Verma" })).not.toBeInTheDocument();
    expect(row("Kabir Rao").getByRole("radio", { name: "Leave" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect((puts(calls)[0].body as { marks: object[] }).marks).toEqual([
      { studentId: "s1", status: "present" },
      { studentId: "s2", status: "leave" },
    ]);
  });

  it("Reset goes back to what the day was when it was opened (the saved marks and reasons)", async () => {
    const saved = { ...SHEET, saved: true, students: [{ ...SHEET.students[0], status: "absent" as const, reason: "Wedding" }, SHEET.students[1]] };
    const { user } = await open({ "GET /classroom/attendance": () => saved });
    await waitFor(() => expect(row("Asha Verma").getByRole("textbox", { name: "Reason for Asha Verma" })).toHaveValue("Wedding"));
    await user.click(row("Asha Verma").getByRole("radio", { name: "Present" }));
    await user.click(row("Kabir Rao").getByRole("radio", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(row("Asha Verma").getByRole("radio", { name: "Absent" })).toBeChecked();
    expect(row("Asha Verma").getByRole("textbox", { name: "Reason for Asha Verma" })).toHaveValue("Wedding");
    expect(row("Kabir Rao").getByRole("radio", { name: "Leave" })).toBeChecked();
  });

  it("a search finds a child by name, roll number or admission number; the summary and the Save are still of the whole class", async () => {
    const { calls, user } = await open();
    await user.type(screen.getByRole("textbox", { name: "Search the children" }), "kab");
    expect(screen.queryByRole("listitem", { name: "Asha Verma" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Kabir Rao" })).toBeInTheDocument();
    expect(countOf("Present")).toBe("Present1");
    // Nobody matching says so, and does not look like an empty class.
    await user.clear(screen.getByRole("textbox", { name: "Search the children" }));
    await user.type(screen.getByRole("textbox", { name: "Search the children" }), "zzz");
    expect(screen.getByText("Nobody matches")).toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "Search the children" }));
    await user.type(screen.getByRole("textbox", { name: "Search the children" }), "ADM-1");
    expect(screen.getByRole("listitem", { name: "Asha Verma" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Kabir Rao" })).not.toBeInTheDocument();
    // Saved while only Asha is on screen: both children are sent.
    await user.click(screen.getByRole("button", { name: "Save attendance" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect((puts(calls)[0].body as { marks: object[] }).marks).toHaveLength(2);
  });

  it("Save attendance is the orange main button, and it is in the summary", async () => {
    await open();
    const save = screen.getByRole("button", { name: "Save attendance" });
    expect(save.className).toContain("bg-orange");
    expect(summary().getByRole("button", { name: "Save attendance" })).toBe(save);
  });

  it("the tabs of a class's work are the page tabs: the open one has the orange bar", async () => {
    await open();
    expect(screen.getByRole("tab", { name: "Attendance" }).className).toContain("after:scale-x-100");
    expect(screen.getByRole("tab", { name: "Diary" }).className).not.toContain("after:scale-x-100");
  });
});
