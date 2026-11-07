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
  tenantId: "t1",
  emailVerifiedAt: null,
  ...over,
});
const tenant = { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true } as never;

function openPage(role: UserRole, handlers: Record<string, () => unknown> = {}) {
  store.dispatch(sessionStarted({ user: user(role), tenant }));
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
  it("is still what the school admin and the principal see", async () => {
    openPage("school_admin");
    expect(await screen.findByText("Approved and live")).toBeInTheDocument();
    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "About you" })).not.toBeInTheDocument();
  });

  it.each(["principal", "accountant"] as const)("is still what the %s sees (added from Staff, with the school's pages)", async (role) => {
    openPage(role);
    expect(await screen.findByText("Approved and live")).toBeInTheDocument();
  });
});

describe("The home of a receptionist or a member of the management (Staff > Add staff)", () => {
  it.each([
    ["receptionist", "Receptionist"],
    ["management", "Management"],
  ] as const)("greets the %s and shows who they are signed in as, and asks the server for nothing", async (role, label) => {
    const calls = openPage(role);
    expect(await screen.findByRole("heading", { name: /Good (morning|afternoon|evening), Meena/ })).toBeInTheDocument();
    const about = await screen.findByRole("region", { name: "About you" });
    expect(about).toHaveTextContent("Meena Singh");
    expect(about).toHaveTextContent(label);
    expect(about).toHaveTextContent("m@school.example");
    expect(about).toHaveTextContent("Sunrise Public School");
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
