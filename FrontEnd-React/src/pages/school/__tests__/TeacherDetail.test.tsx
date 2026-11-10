import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { UserRole } from "../../../types";
import { DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherDetailPage from "../TeacherDetail";

const FULL: Teacher = {
  ...MEENA,
  gender: "Female",
  dateOfBirth: "1988-07-14",
  email: "meena@school.example",
  address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  designation: "TGT (Trained graduate teacher)",
  qualification: "M.Sc., B.Ed.",
  experienceYears: 9,
  joiningDate: "2019-06-17",
  employmentType: "full_time",
  maxPeriodsPerDay: 6,
  offDays: [6],
  login: { username: "meena.singh", isActive: true },
};

function openPage(teacher: Teacher, extra: Record<string, Handler> = {}, who?: { role: UserRole; permissions: string[] }) {
  // The school admin unless a test signed somebody in first: the page asks who is looking (what the school allowed them).
  if (who) signInAs(who.role, who.permissions);
  else if (!store.getState().auth.user) signInAs("school_admin");
  const calls = fakeApi({
    [`GET /staff/teachers/${teacher.id}`]: () => teacher,
    [`GET /staff/teachers/${teacher.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }),
    "GET /staff/teachers": () => ({ items: [teacher, DEV] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/teachers/:id", element: <TeacherDetailPage /> },
      { path: "/school/teachers/:id/edit", element: <p>Change a teacher</p> },
      { path: "/school/teachers", element: <p>The teachers</p> },
      { path: "/school/timetable/teacher/:teacherId", element: <p>The week</p> },
    ],
    { initialEntries: [`/school/teachers/${teacher.id}`] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup(), router };
}

afterEach(() => {
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

describe("A teacher's page", () => {
  it("shows everything the school keeps about the teacher, in cards", async () => {
    openPage(FULL);
    expect(await screen.findByRole("heading", { name: "Meena Singh" })).toBeInTheDocument();
    const personal = screen.getByRole("region", { name: "Personal" });
    expect(personal).toHaveTextContent("Female");
    expect(personal).toHaveTextContent("14 Jul 1988");
    expect(personal).toHaveTextContent("98765 43210");
    expect(personal).toHaveTextContent("meena@school.example");
    expect(personal).toHaveTextContent("12, MG Road, Bhopal, Madhya Pradesh, 462001");
    const job = screen.getByRole("region", { name: "Job" });
    expect(job).toHaveTextContent("T-1");
    expect(job).toHaveTextContent("TGT (Trained graduate teacher)");
    expect(job).toHaveTextContent("M.Sc., B.Ed.");
    expect(job).toHaveTextContent("9 years");
    expect(job).toHaveTextContent("17 Jun 2019");
    expect(job).toHaveTextContent("Full time");
    const teaching = screen.getByRole("region", { name: "Teaching" });
    expect(await within(teaching).findByText("Mathematics")).toBeInTheDocument();
    expect(teaching).toHaveTextContent("2 classes · 12 periods a week");
    expect(teaching).toHaveTextContent("6");
    expect(within(teaching).getByText("Sat")).toBeInTheDocument();
  });

  it("shows a dash for what was not given", async () => {
    openPage(DEV);
    const personal = await screen.findByRole("region", { name: "Personal" });
    expect(within(personal).getAllByText("Not given").length).toBeGreaterThan(3);
  });

  it("asks for the teacher once, the subjects once and their classes once", async () => {
    const { calls } = openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    await screen.findByText("Mathematics");
    expect(calls.filter((c) => c.method === "GET").map((c) => c.path).sort()).toEqual(["/staff/teachers/meena", "/staff/teachers/meena/classes", "/staff/teachers/settings", "/subjects"]);
  });

  it("goes to the week and to the change form", async () => {
    openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute("href", "/school/timetable/teacher/meena");
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/school/teachers/meena/edit");
  });

  it("says when the teacher is not found", async () => {
    openPage(FULL, { "GET /staff/teachers/meena": server(404, "Teacher not found", "TEACHER_NOT_FOUND") });
    expect(await screen.findByText("Teacher not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All teachers" })).toHaveAttribute("href", "/school/teachers");
  });
});

describe("A teacher's login", () => {
  it("shows the username and that it works, but never a password", async () => {
    openPage(FULL);
    const card = await screen.findByRole("region", { name: "Login" });
    expect(card).toHaveTextContent("meena.singh");
    expect(card).toHaveTextContent("Active");
    expect(card).not.toHaveTextContent(/password:/i);
  });

  it("says the login is closed for a teacher who has left, and brings the teacher back", async () => {
    const left = { ...FULL, isActive: false, load: { sections: 0, periodsAllotted: 0 }, login: { username: "meena.singh", isActive: false } };
    const { calls, user } = openPage(left, { "PATCH /staff/teachers/meena": () => ({ ...left, isActive: true, login: { username: "meena.singh", isActive: true } }) });
    const card = await screen.findByRole("region", { name: "Login" });
    expect(card).toHaveTextContent("Closed");
    expect(screen.getByText("Left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bring back" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/teachers/meena", body: { isActive: true } });
  });

  it("gives a new password: made for the school, sent once, then shown to hand over", async () => {
    const { calls, user } = openPage(FULL, { "POST /staff/teachers/meena/reset-password": () => ({}) });
    await user.click(await screen.findByRole("button", { name: "New password" }));
    const d = await screen.findByRole("dialog", { name: "New password for Meena Singh" });
    const box = within(d).getByLabelText(/^Password/) as HTMLInputElement;
    expect(box.value).toHaveLength(10);
    await user.clear(box);
    await user.type(box, "N3w@Passw0rd");
    await user.click(within(d).getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/staff/teachers/meena/reset-password", body: { password: "N3w@Passw0rd" } });
    const card = await within(d).findByRole("region", { name: "Login details" });
    expect(card).toHaveTextContent("meena.singh");
    expect(card).toHaveTextContent("N3w@Passw0rd");
    expect(within(d).queryByLabelText(/^Password/)).not.toBeInTheDocument();
  });

  it("will not send a password that breaks the rules", async () => {
    const { calls, user } = openPage(FULL);
    await user.click(await screen.findByRole("button", { name: "New password" }));
    const d = await screen.findByRole("dialog");
    await user.clear(within(d).getByLabelText(/^Password/));
    await user.type(within(d).getByLabelText(/^Password/), "weak");
    await user.click(within(d).getByRole("button", { name: "Change password" }));
    expect(await within(d).findByText(/Password must be 8-72 characters/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("makes a login for a teacher who has none, with a username from the name, and shows what to hand over", async () => {
    const bare = { ...MEENA };
    const { calls, user } = openPage(bare, { "POST /staff/teachers/meena/login": (body) => ({ ...bare, login: { username: (body as { username: string }).username, isActive: true } }) });
    const card = await screen.findByRole("region", { name: "Login" });
    expect(card).toHaveTextContent("No login yet");
    await user.click(within(card).getByRole("button", { name: "Make a login" }));
    const d = await screen.findByRole("dialog", { name: "Make a login for Meena Singh" });
    expect(within(d).getByLabelText(/^Username/)).toHaveValue("meena.singh");
    const password = (within(d).getByLabelText(/^Password/) as HTMLInputElement).value;
    await user.click(within(d).getByRole("button", { name: "Make login" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/staff/teachers/meena/login", body: { username: "meena.singh", password } });
    const details = await within(d).findByRole("region", { name: "Login details" });
    expect(details).toHaveTextContent(password);
  });

  it("asks for the mobile number first when the teacher has none", async () => {
    openPage({ ...DEV, id: "dev" });
    const card = await screen.findByRole("region", { name: "Login" });
    await userEvent.setup().click(within(card).getByRole("button", { name: "Make a login" }));
    const d = await screen.findByRole("dialog");
    expect(d).toHaveTextContent("mobile number");
    expect(within(d).queryByLabelText(/^Username/)).not.toBeInTheDocument();
    expect(within(d).getByRole("link", { name: "Change Dev Patel" })).toHaveAttribute("href", "/school/teachers/dev/edit");
  });

  it("shows the server's reason under the username, and keeps the dialog", async () => {
    const message = "This username is taken. Try meena.singh2";
    const { user } = openPage(MEENA, { "POST /staff/teachers/meena/login": server(409, message, "USERNAME_TAKEN", [{ path: "login.username", message }]) });
    await user.click(await screen.findByRole("button", { name: "Make a login" }));
    const d = await screen.findByRole("dialog");
    await user.click(within(d).getByRole("button", { name: "Make login" }));
    expect(await within(d).findByText(message)).toBeInTheDocument();
  });
});

describe("A teacher who leaves, from their page", () => {
  it("is marked as left after a question", async () => {
    const dev = { ...DEV, login: { username: "dev.patel", isActive: true } };
    const { calls, user } = openPage(dev, { "PATCH /staff/teachers/dev": () => ({ ...dev, isActive: false }) });
    await user.click(await screen.findByRole("button", { name: "Has left" }));
    const d = await screen.findByRole("dialog", { name: "Dev Patel has left?" });
    await user.click(within(d).getByRole("button", { name: "Yes, they have left" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/teachers/dev", body: { isActive: false } });
  });

  it("is led to give the classes to another teacher first when there are some", async () => {
    openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(screen.queryByRole("button", { name: "Has left" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Give classes" })).toBeInTheDocument();
  });
});

describe("A teacher who teaches in more than one medium", () => {
  const SIDES = [
    { id: "t1", label: "English Medium" },
    { id: "t2", label: "Hindi Medium" },
  ];
  const signIn = (role: string, mediums: typeof SIDES = SIDES) =>
    store.dispatch(
      sessionStarted({
        user: { id: "u1", name: "Asha", email: "a@school.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
        tenant: { id: "t1", name: "Sunrise", approvalStatus: "approved", isActive: true, mediums },
      } as never)
    );
  const list = (teaches: boolean) => ({
    items: [
      { id: "t1", label: "English Medium", here: true, teaches: true },
      { id: "t2", label: "Hindi Medium", here: false, teaches },
    ],
  });
  const asked = (calls: Call[]) => calls.some((c) => c.path === `/staff/teachers/${FULL.id}/mediums`);

  it("the administrator sees where they teach, and can add the other medium", async () => {
    signIn("school_admin");
    let teaches = false;
    const { calls, user } = openPage(FULL, {
      [`GET /staff/teachers/${FULL.id}/mediums`]: () => list(teaches),
      [`POST /staff/teachers/${FULL.id}/mediums`]: () => {
        teaches = true;
        return list(true);
      },
    });
    const card = await screen.findByRole("region", { name: "Teaches in" });
    expect(within(card).getByText("This medium")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Add to Hindi Medium" }));
    expect(await within(card).findByText("Teaches here")).toBeInTheDocument();
    expect(writes(calls)).toMatchObject([{ method: "POST", body: { mediumId: "t2" } }]);
    expect(await screen.findByText("Meena Singh now teaches in Hindi Medium")).toBeInTheDocument();
  });

  it("says what the server refuses", async () => {
    signIn("school_admin");
    const { user } = openPage(FULL, {
      [`GET /staff/teachers/${FULL.id}/mediums`]: () => list(false),
      [`POST /staff/teachers/${FULL.id}/mediums`]: server(409, "Meena Singh has no login yet. Make a login first.", "TEACHER_HAS_NO_LOGIN"),
    });
    await user.click(await screen.findByRole("button", { name: "Add to Hindi Medium" }));
    expect(await screen.findByText("Meena Singh has no login yet. Make a login first.")).toBeInTheDocument();
  });

  it("offers nothing for a teacher who has left", async () => {
    signIn("school_admin");
    openPage({ ...FULL, isActive: false }, { [`GET /staff/teachers/${FULL.id}/mediums`]: () => list(false) });
    const card = await screen.findByRole("region", { name: "Teaches in" });
    expect(within(card).queryByRole("button", { name: "Add to Hindi Medium" })).not.toBeInTheDocument();
  });

  it("is not asked for in a school with one medium", async () => {
    signIn("school_admin", []);
    const { calls } = openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(screen.queryByRole("region", { name: "Teaches in" })).not.toBeInTheDocument();
    expect(asked(calls)).toBe(false);
  });

  it("is not shown to a teacher looking at a colleague", async () => {
    signIn("teacher");
    const { calls } = openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(asked(calls)).toBe(false);
  });
});

describe("a teacher's page for a person the school allowed (Permissions)", () => {
  const reception = (permissions: string[]) => ({ role: "receptionist" as UserRole, permissions });

  it("a person who may only see teachers reads their details, classes and login, and has nothing to change", async () => {
    openPage(FULL, {}, reception(["teachers.view"]));
    expect(await screen.findByRole("heading", { name: FULL.name, level: 1 })).toBeInTheDocument();
    for (const name of ["Change", "Give classes", "Has left", "Assign class", "New password", "Change username", "Make a login", "Week"]) {
      expect(screen.queryByRole("button", { name }) ?? screen.queryByRole("link", { name }), name).toBeNull();
    }
  });

  it("allowed to change them, they get Change, Give classes or Has left, Assign class, and the login's buttons", async () => {
    openPage(FULL, {}, reception(["teachers.view", "teachers.edit"]));
    expect(await screen.findByRole("link", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign class" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New password" })).toBeInTheDocument();
    // The week is the timetable's page: its own permission.
    expect(screen.queryByRole("link", { name: "Week" })).not.toBeInTheDocument();
  });

  it("the week of the teacher is for the people who make timetables", async () => {
    openPage(FULL, {}, reception(["teachers.view", "timetable.edit"]));
    expect(await screen.findByRole("link", { name: "Week" })).toBeInTheDocument();
  });
});
