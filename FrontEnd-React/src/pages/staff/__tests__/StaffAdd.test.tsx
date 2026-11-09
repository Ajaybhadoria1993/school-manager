import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS } from "../../../test/timetableFixtures";
import type { StaffMember } from "../../../types";
import StaffAddPage from "../StaffAdd";

const MADE: StaffMember = {
  id: "new-staff",
  name: "Asha Rao",
  role: "receptionist",
  roleLabel: "Receptionist",
  roleOther: null,
  alsoTeacher: false,
  isTeacher: false,
  subjectIds: [],
  email: null,
  mobile: null,
  gender: null,
  dateOfBirth: null,
  address: { line1: null, city: null, state: null, pincode: null },
  designation: null,
  employeeCode: null,
  joiningDate: null,
  status: "active",
  login: { username: "asha.rao_41", isActive: true },
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    "POST /staff/members": (body) => ({ ...MADE, ...(body as object), login: { username: (body as { login: { username: string } }).login.username, isActive: true } }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/staff/new", element: <StaffAddPage /> },
      { path: "/staff", element: <p>All staff</p> },
    ],
    { initialEntries: ["/staff/new"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const send = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Add staff" }));
const server = (status: number, message: string, code: string, details: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;

async function chooseRole(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: /Role/ }));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function typeUsername(user: ReturnType<typeof userEvent.setup>, username: string) {
  await user.clear(screen.getByLabelText(/^Username/));
  await user.type(screen.getByLabelText(/^Username/), username);
}

/** The role and the name (the username and the password are made from it); the username is then a known one. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await chooseRole(user, "Receptionist");
  await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
  await typeUsername(user, "asha.rao_41");
}

describe("Add staff", () => {
  it("opens as one page of boxes with a Login (username and a password already made) and the Add staff button, and asks the server for nothing", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Add staff" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mobile number/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveValue("");
    const password = value(/^Password/);
    expect(password).toHaveLength(10);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[^\w\s]/);
    expect(screen.getByRole("button", { name: "Add staff" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send invitation" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("makes the username from the name with a number, checks it is free, and keeps it once it is typed", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
    await waitFor(() => expect(value(/^Username/)).toMatch(/^asha\.rao_\d{2}$/));
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/staff/usernames/check").length).toBeGreaterThan(0);
    // Once the person types their own, the name no longer changes it.
    await typeUsername(user, "front.desk");
    await user.type(screen.getByLabelText(/^Name/), " Devi");
    expect(value(/^Username/)).toBe("front.desk");
  });

  it("makes another password with the button inside the box", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    const password = value(/^Password/);
    await user.click(screen.getByRole("button", { name: "Make another password" }));
    expect(value(/^Password/)).not.toBe(password);
  });

  it("a username made from the name that is already somebody's (in any school) is swapped for a free one", async () => {
    const { user } = openPage({
      "GET /staff/usernames/check": (_body, query) => (query.get("username") === "asha.rao_41" ? { available: true, suggestions: [] } : { available: false, suggestions: ["asha.rao_41", "asha.rao_73"] }),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveValue("asha.rao_41"));
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("one the person types that is taken is said so with free ones to click, and nothing is added while it is", async () => {
    const { calls, user } = openPage({
      "GET /staff/usernames/check": (_body, query) => (query.get("username") === "asha.rao_41" ? { available: true, suggestions: [] } : { available: false, suggestions: ["asha.rao_41", "asha.rao_73"] }),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await chooseRole(user, "Receptionist");
    await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
    await typeUsername(user, "asha.rao_30");
    expect(await screen.findByText("This username is taken. Try another")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveAttribute("aria-invalid", "true");
    expect(value(/^Username/)).toBe("asha.rao_30");
    await send(user);
    expect(writes(calls)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "asha.rao_41" }));
    expect(value(/^Username/)).toBe("asha.rao_41");
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("says what each role can do once it is chosen", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await chooseRole(user, "Management");
    expect(await screen.findByText(/who looks at how the school is doing/)).toBeInTheDocument();
  });

  it("will not add with the role, the name, the username or the password missing, marks each in words, and sends nothing", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await user.clear(screen.getByLabelText(/^Password/));
    await send(user);
    // "Choose the role" is also the Select's placeholder: the message is the one in the alert under the box.
    expect(await screen.findByText("Enter the name")).toBeInTheDocument();
    expect(document.getElementById("staff-role-error")).toHaveTextContent("Choose the role");
    expect(document.getElementById("staff-name-error")).toHaveTextContent("Enter the name");
    expect(document.getElementById("staff-username-error")).toHaveTextContent("A username is 3 to 30 letters, digits, dots or underscores, starting with a letter");
    expect(document.getElementById("staff-password-error")).toHaveTextContent("Password must be 8-72 characters");
    // The email is only a contact: it is not asked.
    expect(document.getElementById("staff-email-error")).toBeNull();
    expect(writes(calls)).toHaveLength(0);
  });

  it("holds a password that is too weak, an email that is not one, and a mobile that is not 10 digits, until they are right", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), "weak");
    await user.type(screen.getByLabelText(/^Email/), "not-an-email");
    await user.type(screen.getByLabelText(/^Mobile number/), "12345");
    await send(user);
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter a 10-digit mobile number starting with 6, 7, 8 or 9")).toBeInTheDocument();
    expect(document.getElementById("staff-password-error")).toHaveTextContent("Password must be 8-72 characters");
    expect(writes(calls)).toHaveLength(0);
  });

  it("adds the person in one request with the login the school made (no email needed, empty boxes as null), and shows the username and the password once", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    const password = value(/^Password/);
    await send(user);
    expect(await screen.findByRole("heading", { name: "Asha Rao is added" })).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/staff/members",
      body: {
        name: "Asha Rao",
        role: "receptionist",
        email: null,
        login: { username: "asha.rao_41", password },
        mobile: null,
        designation: null,
        address: { line1: null, city: null, state: null, pincode: null },
      },
    });
    const card = screen.getByRole("region", { name: "Login details" });
    expect(within(card).getByText("asha.rao_41")).toBeInTheDocument();
    expect(within(card).getByText(password)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy login details" })).toBeInTheDocument();
    expect(screen.queryByText(/invitation/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to staff" })).toHaveAttribute("href", "/staff");
  });

  it("sends the email in lower case when one is given (a contact and a second way to sign in)", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await user.type(screen.getByLabelText(/^Email/), "Asha@School.Example");
    await send(user);
    await screen.findByRole("heading", { name: "Asha Rao is added" });
    expect(writes(calls)[0].body).toMatchObject({ email: "asha@school.example" });
  });

  it("starts a clean form with a new password from Add another", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    const first = value(/^Password/);
    await send(user);
    await user.click(await screen.findByRole("button", { name: "Add another" }));
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Username/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
    expect(value(/^Password/)).not.toBe(first);
    expect(value(/^Password/)).toHaveLength(10);
  });

  it("puts the server's refusal of a username under the username box (a taken one the check could not see)", async () => {
    const { user } = openPage({
      "POST /staff/members": server(409, "This username is taken. Try another, for example asha.rao_52", "USERNAME_TAKEN", [{ path: "login.username", message: "This username is taken. Try another, for example asha.rao_52" }]),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByText("This username is taken. Try another, for example asha.rao_52")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveFocus());
    // Typing in the box clears the refusal.
    await user.type(screen.getByLabelText(/^Username/), "x");
    expect(screen.queryByText("This username is taken. Try another, for example asha.rao_52")).not.toBeInTheDocument();
  });

  it("puts the server's refusal of an email that already has a login under the email box", async () => {
    const { user } = openPage({
      "POST /staff/members": server(409, "This email already has a login. Use another email, or leave it empty", "LOGIN_EMAIL_TAKEN", [{ path: "email", message: "This email already has a login. Use another email, or leave it empty" }]),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await user.type(screen.getByLabelText(/^Email/), "asha@school.example");
    await send(user);
    expect(await screen.findByText("This email already has a login. Use another email, or leave it empty")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Email/)).toHaveFocus());
  });

  it("shows the server's words when the refusal names no box", async () => {
    const { user } = openPage({ "POST /staff/members": server(409, "A school can have up to 200 staff members.", "LIMIT_REACHED", []) });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByText("A school can have up to 200 staff members.")).toBeInTheDocument();
  });
});

describe("Add staff: the order of the boxes, the roles, Other, and a person who also teaches (2026-11-08)", () => {
  const openWithSubjects = (extra: Record<string, Handler> = {}) => openPage({ "GET /subjects": () => ({ items: [MATHS, ENGLISH] }), ...extra });

  it("asks the person first (name, date of birth, gender, mobile, email), then the address, then the role, the designation and the employee code, and the login last", async () => {
    openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    const ids = ["name", "dateOfBirth", "gender", "mobile", "email", "addressLine1", "role", "designation", "employeeCode", "joiningDate", "username", "password"].map((key) => `staff-${key}-label`);
    const labels = ids.map((id) => document.getElementById(id));
    labels.forEach((label, i) => expect(label, ids[i]).not.toBeNull());
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1]!.compareDocumentPosition(labels[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${ids[i - 1]} before ${ids[i]}`).toBeTruthy();
    }
  });

  it("the Role dropdown lists every kind of staff a school has besides teachers, with Other last", async () => {
    const { user } = openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    await user.click(screen.getByRole("button", { name: /Role/ }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent?.trim());
    expect(options).toEqual([
      "Principal",
      "Vice principal",
      "Accountant",
      "Receptionist",
      "Management",
      "Coordinator",
      "Clerk / office staff",
      "Librarian",
      "Lab assistant",
      "Counsellor",
      "Nurse",
      "IT / computer support",
      "Transport in-charge",
      "Driver",
      "Security guard",
      "Peon / attendant",
      "Housekeeping",
      "Hostel warden",
      "Other",
    ]);
    expect(options).not.toContain("Teacher");
  });

  it("Other asks for a role name of the school's own (in a box that only appears for it), and sends it", async () => {
    const { calls, user } = openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    expect(screen.queryByLabelText(/^Role name/)).not.toBeInTheDocument();
    await chooseRole(user, "Other");
    const box = await screen.findByLabelText(/^Role name/);
    await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
    await typeUsername(user, "asha.rao_41");
    await send(user);
    expect(document.getElementById("staff-roleOther-error")).toHaveTextContent("Enter the role's name");
    expect(writes(calls)).toHaveLength(0);
    await user.type(box, "Lab technician");
    await send(user);
    expect(await screen.findByRole("heading", { name: "Asha Rao is added" })).toBeInTheDocument();
    expect(writes(calls)[0].body).toMatchObject({ role: "other", roleOther: "Lab technician", alsoTeacher: false, subjectIds: [] });
  });

  it("Also a teacher is off to start with; switched on it asks the subjects they teach, and sends both", async () => {
    const { calls, user } = openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    const also = screen.getByRole("switch", { name: "Also a teacher" });
    expect(also).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("group", { name: "Subjects they can teach" })).not.toBeInTheDocument();
    await fillRequired(user);
    await user.click(also);
    expect(also).toHaveAttribute("aria-checked", "true");
    const subjects = await screen.findByRole("group", { name: "Subjects they can teach" });
    await user.click(await within(subjects).findByRole("button", { name: "Mathematics" }));
    await send(user);
    expect(await screen.findByRole("heading", { name: "Asha Rao is added" })).toBeInTheDocument();
    expect(writes(calls)[0].body).toMatchObject({ role: "receptionist", alsoTeacher: true, subjectIds: ["maths"] });
  });

  it("switching it off again forgets the subjects", async () => {
    const { calls, user } = openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await user.click(screen.getByRole("switch", { name: "Also a teacher" }));
    await user.click(await screen.findByRole("button", { name: "Mathematics" }));
    await user.click(screen.getByRole("switch", { name: "Also a teacher" }));
    await send(user);
    await screen.findByRole("heading", { name: "Asha Rao is added" });
    expect(writes(calls)[0].body).toMatchObject({ alsoTeacher: false, subjectIds: [] });
  });

  it("a Principal who also teaches is told they keep the Principal login; another role is told nothing of the sort", async () => {
    const { user } = openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    await user.click(screen.getByRole("switch", { name: "Also a teacher" }));
    await chooseRole(user, "Principal");
    expect(await screen.findByText(/keeps the Principal login/)).toBeInTheDocument();
    await chooseRole(user, "Management");
    expect(screen.queryByText(/keeps the .* login/)).not.toBeInTheDocument();
  });

  it("keeps the joining date, after the employee code", async () => {
    openWithSubjects();
    await screen.findByRole("heading", { name: "Add staff" });
    const code = document.getElementById("staff-employeeCode-label")!;
    const joining = document.getElementById("staff-joiningDate-label")!;
    expect(code.compareDocumentPosition(joining) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
