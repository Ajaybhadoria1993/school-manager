import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS } from "../../../test/timetableFixtures";
import type { StaffMember } from "../../../types";
import { ageText } from "../../../utils/students";
import StaffEditPage from "../StaffEdit";

const ASHA: StaffMember = {
  id: "asha",
  name: "Asha Rao",
  role: "receptionist",
  roleLabel: "Receptionist",
  roleOther: null,
  alsoTeacher: false,
  isTeacher: false,
  subjectIds: [],
  email: "asha@school.example",
  mobile: "9876543210",
  gender: "Female",
  dateOfBirth: null,
  address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  designation: "Front desk",
  employeeCode: "S-1",
  joiningDate: null,
  status: "active",
  login: { username: "asha.rao_41", isActive: true },
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/members/asha": () => ASHA,
    "PATCH /staff/members/asha": (body) => ({ ...ASHA, ...(body as object) }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/staff/:id/edit", element: <StaffEditPage /> },
      { path: "/staff", element: <p>All staff</p> },
    ],
    { initialEntries: ["/staff/asha/edit"] }
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
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const server = (status: number, message: string, code: string, details: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

describe("Change staff", () => {
  it("opens with the person's details (the email a box like the others, no login boxes), and Save changes off until something changes", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Change staff" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Asha Rao");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("asha@school.example");
    expect(screen.getByLabelText(/^Email/)).toBeEnabled();
    // The username and the password are changed from the Staff list, not here.
    expect(screen.queryByLabelText(/^Username/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Mobile number/)).toHaveValue("9876543210");
    expect(screen.getByLabelText(/^Designation/)).toHaveValue("Front desk");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /staff/members/asha"]);
  });

  it("saves in one request without any login, goes back to Staff, and says it is saved", async () => {
    const { calls, router, user } = openPage();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Asha R. Rao");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(router.state.location.pathname).toBe("/staff");
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/members/asha", body: { name: "Asha R. Rao", role: "receptionist" } });
    expect(writes(calls)[0].body).not.toHaveProperty("login");
    expect(await screen.findByText("Asha R. Rao is saved")).toBeInTheDocument();
  });

  it("the email can be changed, or emptied (it is only a contact: an empty box is sent as null)", async () => {
    const { calls, user } = openPage();
    const email = await screen.findByLabelText(/^Email/);
    await user.clear(email);
    await user.type(email, "Asha.New@School.Example");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(writes(calls)[0].body).toMatchObject({ email: "asha.new@school.example" });
  });

  it("a person with no email shows an empty box, and saves without inventing one", async () => {
    const { calls, user } = openPage({ "GET /staff/members/asha": () => ({ ...ASHA, email: null }) });
    const name = await screen.findByLabelText(/^Name/);
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
    await user.type(name, " Devi");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(writes(calls)[0].body).toMatchObject({ name: "Asha Rao Devi", email: null });
  });

  it("puts a refused email under its box", async () => {
    const { user } = openPage({
      "PATCH /staff/members/asha": server(409, "This email already has a login. Use another email, or leave it empty", "LOGIN_EMAIL_TAKEN", [{ path: "email", message: "This email already has a login. Use another email, or leave it empty" }]),
    });
    const email = await screen.findByLabelText(/^Email/);
    await user.clear(email);
    await user.type(email, "taken@school.example");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("This email already has a login. Use another email, or leave it empty")).toBeInTheDocument();
  });

  it("will not save with the name emptied, and says so under the box", async () => {
    const { calls, user } = openPage();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the name")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("puts a refused employee code under its box", async () => {
    const { user } = openPage({
      "PATCH /staff/members/asha": server(409, "Another staff member already has this employee code.", "STAFF_CODE_EXISTS", [{ path: "employeeCode", message: "Another staff member already has this employee code" }]),
    });
    const code = await screen.findByLabelText(/^Employee code/);
    await user.clear(code);
    await user.type(code, "S-2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Another staff member already has this employee code")).toBeInTheDocument();
  });

  it("says so, with the way back, when the person cannot be found", async () => {
    openPage({ "GET /staff/members/asha": server(404, "Staff member not found", "NOT_FOUND", []) });
    expect(await screen.findByText("Staff member not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All staff" })).toHaveAttribute("href", "/staff");
  });
});

describe("Change staff: the role's name and teaching (2026-11-08)", () => {
  const LATA: StaffMember = { ...ASHA, role: "other", roleLabel: "Lab technician", roleOther: "Lab technician" };
  const subjects = { "GET /subjects": () => ({ items: [MATHS, ENGLISH] }) };

  it("opens an Other person with the role name they were given, and saves a changed one", async () => {
    const { calls, user } = openPage({ "GET /staff/members/asha": () => LATA });
    const box = await screen.findByLabelText(/^Role name/);
    expect(box).toHaveValue("Lab technician");
    await user.clear(box);
    await user.type(box, "Sports coach");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(writes(calls)[0].body).toMatchObject({ role: "other", roleOther: "Sports coach" });
  });

  it("shows the age beside the date of birth", async () => {
    openPage({ "GET /staff/members/asha": () => ({ ...ASHA, dateOfBirth: "1990-02-01" }) });
    await screen.findByRole("heading", { name: "Change staff" });
    expect(screen.getByText(ageText("1990-02-01"))).toBeInTheDocument();
  });

  it("a person who does not teach yet can be switched on from here, with their subjects", async () => {
    const { calls, user } = openPage(subjects);
    const also = await screen.findByRole("switch", { name: "Also a teacher" });
    expect(also).toHaveAttribute("aria-checked", "false");
    await user.click(also);
    await user.click(await screen.findByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(writes(calls)[0].body).toMatchObject({ alsoTeacher: true, subjectIds: ["english"] });
  });

  it("a person who teaches here already has the switch on and locked (they stop as a teacher on the Teacher page), with their subjects", async () => {
    openPage({ ...subjects, "GET /staff/members/asha": () => ({ ...ASHA, alsoTeacher: true, isTeacher: true, subjectIds: ["maths"] }) });
    const also = await screen.findByRole("switch", { name: "Also a teacher" });
    expect(also).toHaveAttribute("aria-checked", "true");
    expect(also).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Mathematics" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });

  it("a person who is to teach but is not a teacher yet (no login yet) can still be switched off", async () => {
    openPage({ ...subjects, "GET /staff/members/asha": () => ({ ...ASHA, status: "invited", login: null, alsoTeacher: true, isTeacher: false }) });
    const also = await screen.findByRole("switch", { name: "Also a teacher" });
    expect(also).toBeEnabled();
  });
});
