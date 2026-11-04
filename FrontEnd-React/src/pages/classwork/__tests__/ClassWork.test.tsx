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
    { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, status: "present" },
    { id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", rollNumber: 2, status: "leave" },
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
