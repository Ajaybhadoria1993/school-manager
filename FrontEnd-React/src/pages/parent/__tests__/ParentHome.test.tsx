import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { GRID } from "../../../test/timetableFixtures";
import type { ChildDetail, ChildSummary, ChildTimetable } from "../../../types";
import DashboardPage from "../../dashboard/Dashboard";
import ChildPage from "../ChildPage";

/** A signed-in parent (2026-11-04): their children on the home page, and each child's record, class teacher and published week. */

const ASHA: ChildSummary = { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001", gender: "Female", dateOfBirth: "2018-05-14", place: { className: "Class 5", sectionName: "A", rollNumber: 12, label: "Class 5 - A" } };
const DEV: ChildSummary = { id: "s2", name: "Dev Verma", admissionNumber: "ADM-2026-0002", gender: "Male", dateOfBirth: "2020-01-01", place: { className: "Class 1", sectionName: null, rollNumber: null, label: "Class 1" } };

const ASHA_DETAIL: ChildDetail = {
  ...ASHA,
  firstName: "Asha",
  lastName: "Verma",
  admissionDate: "2026-04-01",
  bloodGroup: "B+",
  category: null,
  classTeacher: { name: "Meena Singh" },
  address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: null,
  records: { emergencyMobile: "9000000009", medicalNotes: null },
  guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9000000001", alternateMobile: null, email: null, occupation: "Farmer" }],
};

const WEEK: ChildTimetable = {
  label: "Class 5 - A",
  status: "published",
  publishedAt: "2026-11-01T00:00:00.000Z",
  days: GRID.days,
  cells: [{ day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: "Room 5A" }] }],
  allotments: [{ subjectId: "maths", subjectName: "Mathematics", subjectCode: null, periodsPerWeek: 6, teacherId: "meena" }],
  teachers: [{ id: "meena", name: "Meena Singh" }],
};

function openPage(path: string, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /parent/children": () => ({ parent: { name: "Ravi Verma", school: "Sunrise Public School" }, items: [ASHA, DEV] }),
    "GET /parent/children/s1": () => ASHA_DETAIL,
    "GET /parent/children/s1/timetable": () => WEEK,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/my-children/:id", element: <ChildPage /> },
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

beforeEach(() => {
  store.dispatch(
    sessionStarted({
      user: { id: "u9", name: "Ravi Verma", email: null, username: "ravi.verma_12", role: "parent", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
});

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const gets = (calls: Call[]) => calls.filter((c) => c.method === "GET").map((c) => c.path);

describe("a parent's home", () => {
  it("lists their children, each with the class, and opens a child", async () => {
    const { calls, user, router } = openPage("/dashboard");
    const list = await screen.findByRole("list", { name: "Your children" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((i) => within(i).getByRole("link").textContent)).toEqual([expect.stringContaining("Asha Verma"), expect.stringContaining("Dev Verma")]);
    expect(items[0]).toHaveTextContent("Class 5 - A");
    expect(items[0]).toHaveTextContent("Roll 12");
    expect(items[0]).toHaveTextContent("ADM-2026-0001");
    // Nothing of the school's own (its setup, numbers or shortcuts).
    expect(gets(calls)).toEqual(["/parent/children"]);
    await user.click(within(items[0]).getByRole("link"));
    expect(router.state.location.pathname).toBe("/my-children/s1");
  });

  it("says so when no child is linked to the login", async () => {
    openPage("/dashboard", { "GET /parent/children": () => ({ parent: { name: "Ravi Verma", school: "Sunrise Public School" }, items: [] }) });
    expect(await screen.findByText("No child is linked to your login yet")).toBeInTheDocument();
  });
});

describe("a child's page, for their parent", () => {
  it("shows the child's record: class, roll, class teacher, about, parents and address", async () => {
    openPage("/my-children/s1");
    expect(await screen.findByRole("heading", { name: "Asha Verma", level: 1 })).toBeInTheDocument();
    const klass = screen.getByRole("region", { name: "Class" });
    expect(klass).toHaveTextContent("Class 5 - A");
    expect(klass).toHaveTextContent("12");
    expect(klass).toHaveTextContent("Meena Singh");
    expect(screen.getByRole("region", { name: "About" })).toHaveTextContent("ADM-2026-0001");
    expect(screen.getByRole("region", { name: "About" })).toHaveTextContent("B+");
    expect(screen.getByRole("region", { name: "Parents" })).toHaveTextContent("Ravi Verma");
    expect(screen.getByRole("region", { name: "Address" })).toHaveTextContent("12 MG Road");
  });

  it("shows the class teacher as N/A when the class has none", async () => {
    openPage("/my-children/s1", { "GET /parent/children/s1": () => ({ ...ASHA_DETAIL, classTeacher: null }) });
    expect(await screen.findByRole("region", { name: "Class" })).toHaveTextContent("N/A");
  });

  it("shows the published week, each period with its subject and teacher", async () => {
    openPage("/my-children/s1");
    const week = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(within(week).getByRole("cell", { name: /Mathematics.*Meena Singh.*Room 5A/ })).toBeInTheDocument();
  });

  it("says the timetable is not out yet when the school has not published it", async () => {
    openPage("/my-children/s1", { "GET /parent/children/s1/timetable": () => null });
    expect(await screen.findByText("The timetable is not published yet")).toBeInTheDocument();
  });

  it("a child that is not theirs is not found", async () => {
    openPage("/my-children/s9", {
      "GET /parent/children/s9": () => new Response(JSON.stringify({ success: false, message: "Student not found", code: "STUDENT_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } }),
      "GET /parent/children/s9/timetable": () => null,
    });
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });
});

describe("leave for the child (2026-11-04)", () => {
  const SENT = {
    id: "l1",
    student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001" },
    label: "Class 5 - A",
    fromDate: "2026-11-12",
    toDate: "2026-11-12",
    days: 1,
    reason: "Fever",
    appliedBy: "Ravi Verma (Father)",
    status: "pending",
    note: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: "2026-11-04T08:00:00.000Z",
  };
  const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST");

  it("Apply for leave: the day in one click and the reason; sent, a window says the class teacher and the school will see it", async () => {
    const { calls, user } = openPage("/my-children/s1", {
      "GET /parent/children/s1/leaves": () => ({ items: [] }),
      "POST /parent/children/s1/leaves": (body) => ({ ...SENT, ...(body as object) }),
    });
    await user.click(await screen.findByRole("button", { name: "Apply for leave" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply for leave for Asha Verma" });
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.type(within(dialog).getByLabelText(/^Reason/), "Fever");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toMatchObject({ path: "/parent/children/s1/leaves", body: { reason: "Fever" } });
    expect((posts(calls)[0].body as { fromDate: string }).fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await screen.findByRole("dialog", { name: "Leave sent" })).toHaveTextContent("class teacher");
  });

  it("lists the leaves with their answer; one still waiting can be taken back, after asking", async () => {
    const { calls, user } = openPage("/my-children/s1", {
      "GET /parent/children/s1/leaves": () => ({ items: [SENT, { ...SENT, id: "l2", reason: "Wedding", status: "declined", note: "Exams that day", decidedBy: { name: "Meena Singh", role: "teacher" } }] }),
      "POST /parent/children/s1/leaves/l1/cancel": () => ({ ...SENT, status: "cancelled" }),
    });
    const leaves = await screen.findByRole("region", { name: "Leave" });
    await waitFor(() => expect(leaves).toHaveTextContent("Waiting"));
    expect(leaves).toHaveTextContent("Declined");
    expect(leaves).toHaveTextContent("Exams that day");
    await user.click(within(leaves).getByRole("button", { name: "Take back" }));
    const ask = await screen.findByRole("dialog", { name: "Take back this leave?" });
    await user.click(within(ask).getByRole("button", { name: "Take back" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0].path).toBe("/parent/children/s1/leaves/l1/cancel");
    expect(await screen.findByRole("dialog", { name: "Leave taken back" })).toBeInTheDocument();
  });
});

describe("the child's attendance (2026-11-04)", () => {
  const ATTENDANCE = {
    month: "2026-11",
    days: [
      { date: "2026-11-02", status: "absent" },
      { date: "2026-11-03", status: "late" },
    ],
    monthTally: { present: 0, absent: 1, late: 1, leave: 0, days: 2, percent: 50 },
    year: { present: 10, absent: 1, late: 1, leave: 0, days: 12, percent: 92 },
  };

  it("shows the year's percentage and counts, and the days of the month with their marks", async () => {
    openPage("/my-children/s1", { "GET /parent/children/s1/attendance": () => ATTENDANCE });
    const card = await screen.findByRole("region", { name: "Attendance" });
    await waitFor(() => expect(card).toHaveTextContent("92%"));
    expect(card).toHaveTextContent("10 present");
    expect(card).toHaveTextContent("1 absent");
    expect(card).toHaveTextContent("1 late");
    expect(within(card).getByRole("listitem", { name: "2 Nov" })).toHaveTextContent("Absent");
    expect(within(card).getByRole("listitem", { name: "3 Nov" })).toHaveTextContent("Late");
  });

  it("goes to the month before in one click", async () => {
    const { calls, user } = openPage("/my-children/s1", { "GET /parent/children/s1/attendance": () => ATTENDANCE });
    const card = await screen.findByRole("region", { name: "Attendance" });
    await waitFor(() => expect(card).toHaveTextContent("November 2026"));
    await user.click(within(card).getByRole("button", { name: "Month before" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/parent/children/s1/attendance" && c.query === "?month=2026-10")).toBe(true));
  });
});
