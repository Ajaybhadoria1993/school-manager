import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { authChecked, sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../../test/fakeApi";
import { ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { AuthUser, UserRole } from "../../../types";
import DashboardPage from "../Dashboard";

const user = (role: UserRole, over: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  name: "Meena Singh",
  email: role === "teacher" ? null : "m@school.example",
  username: role === "teacher" ? "meena.singh" : null,
  role,
  roleLabel: null,
  tenantId: "t1",
  emailVerifiedAt: null,
  ...over,
});
const tenant = { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true } as never;

function openPage(role: UserRole, handlers: Record<string, () => unknown> = {}, over: Partial<AuthUser> = {}) {
  store.dispatch(sessionStarted({ user: user(role, over), tenant }));
  store.dispatch(authChecked());
  const calls = fakeApi(handlers);
  const router = createMemoryRouter([{ path: "/dashboard", element: <DashboardPage /> }], { initialEntries: ["/dashboard"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return calls;
}

beforeEach(() => store.dispatch(signedOut()));
afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const paths = (calls: Call[]) => calls.map((c) => `${c.method} ${c.path}`).sort();

const OWN = {
  ...MEENA,
  designation: "TGT (Trained graduate teacher)",
  maxPeriodsPerDay: 6,
  offDays: [6],
  login: { username: "meena.singh", isActive: true },
};

describe("A teacher's home", () => {
  it("greets the teacher and shows their own details: post, what they teach, what they were given, the days they do not come", async () => {
    openPage("teacher", { "GET /staff/teachers/me": () => OWN, "GET /subjects": () => ({ items: [MATHS, ENGLISH] }) });
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Meena/ })).toBeInTheDocument();
    expect(screen.getByText(/Sunrise Public School/)).toBeInTheDocument();
    const about = await screen.findByRole("region", { name: "About you" });
    expect(about).toHaveTextContent("TGT (Trained graduate teacher)");
    expect(about).toHaveTextContent("T-1");
    expect(await within(about).findByText("Mathematics")).toBeInTheDocument();
    expect(about).toHaveTextContent("2 classes · 12 periods a week");
    expect(within(about).getByText("Sat")).toBeInTheDocument();
    expect(about).toHaveTextContent("meena.singh");
  });

  it("is not the school's dashboard: no admin tiles, no shortcuts, no sample charts", async () => {
    openPage("teacher", { "GET /staff/teachers/me": () => OWN, "GET /subjects": () => ({ items: [MATHS] }) });
    await screen.findByRole("region", { name: "About you" });
    for (const text of ["Administrators", "You, as the school admin", "Add a student", "Send a notice", "Sample data", "Approved and live"]) {
      expect(screen.queryByText(text), text).not.toBeInTheDocument();
    }
  });

  it("asks only for the teacher's own record, their classes, their own attendance of the day and the subject names, nothing of the school's setup", async () => {
    const calls = openPage("teacher", { "GET /staff/teachers/me": () => OWN, "GET /subjects": () => ({ items: [MATHS] }), "GET /classroom/my-classes": () => ({ items: [] }) });
    await screen.findByRole("region", { name: "About you" });
    await screen.findByText("Mathematics");
    // My classes (docs/parent-teacher-flow.md, 2026-11-04) and My attendance (2026-11-06) are on the teacher's home too.
    expect([...paths(calls)].sort()).toEqual(["GET /attendance/teachers/me", "GET /classroom/my-classes", "GET /staff/teachers/me", "GET /subjects"]);
  });

  it("says so when the login is not tied to a teacher record", async () => {
    openPage("teacher", {
      "GET /staff/teachers/me": () => new Response(JSON.stringify({ success: false, message: "Your teacher record was not found. Ask your school.", code: "TEACHER_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } }),
    });
    expect(await screen.findByText("Your teacher record was not found. Ask your school.")).toBeInTheDocument();
  });
});

describe("The school's dashboard", () => {
  // The school's home (redone like Infinity Medisetu's 2026-11-10, its own tests are in components/dashboard): a greeting and the days, five figures, then the cards.
  const SCHOOL_HOME = {
    date: "2026-11-05",
    academicYear: { id: "y1", name: "2026-2027" },
    classes: 1,
    students: { total: 2, byClass: [{ classId: "c1", name: "Class 1", enrolled: 2 }], gender: { male: 1, female: 1, other: 0 } },
    people: { teachers: 1, staff: 0 },
    attendance: { working: true, holiday: null, students: { present: 0, late: 0, absent: 0, leave: 0, percent: null, classesTaken: 0, classesTotal: 1 }, teachers: { total: 1, present: 0, late: 0, absent: 0 } },
    admissions: [],
    attention: [],
    upcoming: [],
    period: {
      from: "2026-11-05",
      to: "2026-11-05",
      previous: { from: "2026-11-04", to: "2026-11-04" },
      students: { admitted: 0, admittedBefore: 0 },
      attendance: { present: 0, late: 0, absent: 0, leave: 0, percent: null, before: { absent: 0, percent: null } },
      teachers: { present: 0, late: 0, absent: 0, percent: null, before: { percent: null } },
      leaves: { asked: 0, askedBefore: 0 },
      absentClasses: [],
    },
    day: { working: true, holiday: null, start: "08:30", end: "14:20" },
  };
  const SCHOOL_TREND = { period: "week", from: "2026-11-02", to: "2026-11-08", points: [], percent: null, before: null };

  it("is the school's home for the school admin: the figures on top and the cards under them, no estimates or sample tiles", async () => {
    openPage("school_admin", { "GET /dashboard/school": () => SCHOOL_HOME, "GET /dashboard/school/trend": () => SCHOOL_TREND });
    expect(await screen.findByRole("heading", { level: 1, name: /Hello Meena/ })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Needs your attention" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Students" })).toBeInTheDocument();
    expect(screen.queryByText("Administrators")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About you" })).not.toBeInTheDocument();
  });

  it.each(["principal", "accountant"] as const)("is still what the %s sees (added from Staff, with the school's pages)", async (role) => {
    openPage(role, { "GET /dashboard/school": () => SCHOOL_HOME, "GET /dashboard/school/trend": () => SCHOOL_TREND });
    expect(await screen.findByRole("heading", { level: 1, name: /Hello Meena/ })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Students" })).toBeInTheDocument();
  });

  // What the school allowed (Permissions)
  it("a receptionist given the dashboard gets the school's dashboard, not the staff home", async () => {
    openPage("receptionist", { "GET /dashboard/school": () => SCHOOL_HOME, "GET /dashboard/school/trend": () => SCHOOL_TREND }, { permissions: ["calendar.view", "dashboard.view"] });
    expect(await screen.findByRole("heading", { level: 1, name: /Hello Meena/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About you" })).not.toBeInTheDocument();
  });

  it("an accountant the school took the dashboard from has the staff home, and asks the server for no numbers", async () => {
    const calls = openPage("accountant", {}, { permissions: ["calendar.view"] });
    expect(await screen.findByRole("region", { name: "About you" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith("/dashboard"))).toEqual([]);
  });

  it("the school admin and the principal always have it, even with an empty list", async () => {
    openPage("principal", { "GET /dashboard/school": () => SCHOOL_HOME, "GET /dashboard/school/trend": () => SCHOOL_TREND }, { permissions: [] });
    expect(await screen.findByRole("heading", { level: 1, name: /Hello Meena/ })).toBeInTheDocument();
  });
});

describe("The home of a receptionist or a member of the management (Staff > Add staff)", () => {
  // Staff sign in with the username and the password their school made; the email is only a contact and may be missing.
  it.each([
    ["receptionist", "Receptionist"],
    ["management", "Management"],
  ] as const)("greets the %s and shows who they are signed in as (the username, no email), and asks the server for nothing", async (role, label) => {
    const calls = openPage(role, {}, { email: null, username: "meena.singh_41" });
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Meena/ })).toBeInTheDocument();
    const about = await screen.findByRole("region", { name: "About you" });
    expect(about).toHaveTextContent("Meena Singh");
    expect(about).toHaveTextContent(label);
    expect(about).toHaveTextContent("Username");
    expect(about).toHaveTextContent("meena.singh_41");
    expect(about).not.toHaveTextContent("Email");
    expect(about).toHaveTextContent("Sunrise Public School");
    expect(calls).toHaveLength(0);
  });

  it("shows the email too when the person has one", async () => {
    openPage("receptionist", {}, { email: "m@school.example", username: "meena.singh_41" });
    const about = await screen.findByRole("region", { name: "About you" });
    expect(about).toHaveTextContent("meena.singh_41");
    expect(about).toHaveTextContent("m@school.example");
  });

  it("a staff member of any other kind (a librarian, a role the school wrote) has the same home, with the title they were given", async () => {
    store.dispatch(sessionStarted({ user: user("staff", { roleLabel: "Lab technician", email: null, username: "lata.das_52" }), tenant }));
    store.dispatch(authChecked());
    const calls = fakeApi({});
    const router = createMemoryRouter([{ path: "/dashboard", element: <DashboardPage /> }], { initialEntries: ["/dashboard"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const about = await screen.findByRole("region", { name: "About you" });
    expect(about).toHaveTextContent("Lab technician");
    expect(about).not.toHaveTextContent("Staff member");
    expect(screen.queryByText("My classes")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("is not the school's dashboard: no admin tiles, no shortcuts, no sample charts, and not a teacher's home", async () => {
    openPage("receptionist");
    await screen.findByRole("region", { name: "About you" });
    for (const text of ["Administrators", "You, as the school admin", "Add a student", "Send a notice", "Sample data", "Approved and live", "My classes"]) {
      expect(screen.queryByText(text), text).not.toBeInTheDocument();
    }
  });
});
