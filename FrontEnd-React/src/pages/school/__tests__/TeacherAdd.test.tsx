import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Subject } from "../../../types";
import { todayInIndia } from "../../../utils/students";
import TeacherAddPage from "../TeacherAdd";

function openPage(extra: Record<string, Handler> = {}, path = "/school/teachers/new") {
  // The school's subjects: one typed under "Other" is added to them.
  const subjects: Subject[] = [MATHS, ENGLISH];
  const calls = fakeApi({
    "GET /subjects": () => ({ items: subjects }),
    "POST /subjects": (body) => {
      const name = (body as { name: string }).name;
      const made: Subject = { ...MATHS, id: name.toLowerCase(), name, code: null, sections: 0 };
      subjects.push(made);
      return made;
    },
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    "POST /staff/teachers": (body) => ({ ...MEENA, id: "new-teacher", ...(body as object), login: { username: "meena.singh", isActive: true } }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/teachers/new", element: <TeacherAddPage /> },
      { path: "/school/teachers", element: <p>The teachers</p> },
      { path: "/school/teachers/:id", element: <p>One teacher</p> },
      { path: "/teachers/new", element: <TeacherAddPage /> },
      { path: "/teachers", element: <p>All teachers</p> },
      { path: "/teachers/:id", element: <p>One teacher</p> },
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
  return { calls, user: userEvent.setup(), router };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const reads = (calls: Call[]) => calls.filter((c) => c.method === "GET");
const server = (status: number, message: string, code: string, details: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

type User = ReturnType<typeof userEvent.setup>;
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next step" }));
const current = () => document.querySelector('[aria-current="step"]')?.textContent ?? "";

async function fillPersonal(user: User) {
  await user.type(screen.getByLabelText(/^Name/), "Meena Singh");
  await user.click(screen.getByRole("radio", { name: "Female" }));
  await user.type(screen.getByLabelText(/^Mobile number/), "9876543210");
}

async function toLoginStep(user: User) {
  await fillPersonal(user);
  await next(user);
  await next(user);
  await next(user);
  await screen.findByLabelText(/^Username/);
}

describe("Add teacher: the steps", () => {
  it("opens on Personal info, with the four steps and no Back button", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Add teacher" })).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Steps" }));
    expect(steps.getAllByRole("listitem").map((li) => li.textContent?.replace(/^\d/, "").trim())).toEqual(["Personal info", "Job details", "Teaching", "Login"]);
    expect(current()).toContain("Personal info");
    expect(screen.queryByRole("button", { name: "Previous step" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
  });

  it("will not leave a step with a box wrong, marks it in words, and sends nothing", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await next(user);
    expect(await screen.findByText("Enter the teacher's name")).toBeInTheDocument();
    expect(screen.getByText("Choose the gender")).toBeInTheDocument();
    expect(screen.getByText("Enter a 10-digit mobile number starting with 6, 7, 8 or 9")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
    expect(writes(calls)).toHaveLength(0);
  });

  it("moves on when the step is right, and back again with everything still there", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Email/), "meena@school.example");
    await next(user);
    expect(await screen.findByLabelText(/^Employee code/)).toBeInTheDocument();
    expect(current()).toContain("Job details");
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("Meena Singh");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("meena@school.example");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
  });

  it("checks the optional boxes only when something is typed in them", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^PIN code/), "123");
    await next(user);
    expect(await screen.findByText("PIN code is 6 digits")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
  });

  it("goes to the next step on Enter in a box", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Mobile number/), "{Enter}");
    expect(await screen.findByLabelText(/^Employee code/)).toBeInTheDocument();
  });

  it("asks for the subjects only on the Teaching step, once", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    expect(reads(calls)).toHaveLength(0);
    await fillPersonal(user);
    await next(user);
    await next(user);
    expect(await screen.findByRole("button", { name: "Mathematics" })).toBeInTheDocument();
    expect(reads(calls).map((c) => c.path)).toEqual(["/subjects"]);
  });
});

describe("Add teacher: the boxes", () => {
  it("keeps only the 10 digits of a mobile number, typed or pasted with +91", async () => {
    const { user } = openPage();
    const mobile = await screen.findByLabelText(/^Mobile number/);
    await user.type(mobile, "98765abc432109");
    expect(mobile).toHaveValue("9876543210");
    await user.clear(mobile);
    await user.click(mobile);
    await user.paste("+91 98765 43210");
    expect(mobile).toHaveValue("9876543210");
  });

  it("keeps only digits in the PIN code, the experience and the period boxes", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^PIN code/), "46a20019");
    expect(screen.getByLabelText(/^PIN code/)).toHaveValue("462001");
    await next(user);
    await user.type(await screen.findByLabelText(/^Experience/), "1e5");
    expect(screen.getByLabelText(/^Experience/)).toHaveValue("15");
    await next(user);
    await user.type(await screen.findByLabelText(/^Most periods a day/), "6x");
    expect(screen.getByLabelText(/^Most periods a day/)).toHaveValue("6");
    await user.type(screen.getByLabelText(/^Most periods a week/), "300");
    expect(screen.getByLabelText(/^Most periods a week/)).toHaveValue("30");
  });

  it("sets the joining date in one click, and sends it", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    const today = todayInIndia();
    await user.click(await screen.findByRole("button", { name: "Today" }));
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    const [year, month, day] = today.split("-");
    const box = screen.getByRole("group", { name: /^Joining date/ });
    expect(within(box).getAllByRole("spinbutton").map((s) => s.textContent)).toEqual([day, month, year]);
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ joiningDate: today });
  });

  it("has the calendar too: a day picked in it is the joining date", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await screen.findByRole("button", { name: "Today" });
    await user.click(within(screen.getByRole("group", { name: /^Joining date/ })).getByRole("button", { name: /calendar/i }));
    const grid = await screen.findByRole("grid");
    await user.click(within(grid).getAllByRole("button", { name: /\b1[0-9]?\b/ }).find((b) => b.textContent === "15") as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    const [year, month] = todayInIndia().split("-");
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ joiningDate: `${year}-${month}-15` });
  });

  it("adds a subject the list does not have, under Other, and picks it (Enter does not leave the step)", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Other" }));
    await user.type(screen.getByRole("textbox", { name: "New subject" }), "  Robotics {Enter}");
    expect(await screen.findByRole("button", { name: "Robotics" })).toHaveAttribute("aria-pressed", "true");
    expect(writes(calls)).toEqual([expect.objectContaining({ method: "POST", path: "/subjects", body: { name: "Robotics" } })]);
    expect(current()).toContain("Teaching");
    expect(screen.queryByRole("textbox", { name: "New subject" })).not.toBeInTheDocument();
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1].body).toMatchObject({ subjectIds: ["robotics"] });
  });

  it("picks a subject the school already has instead of making it again", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Other" }));
    await user.type(screen.getByRole("textbox", { name: "New subject" }), "mathematics{Enter}");
    expect(await screen.findByRole("button", { name: "Mathematics" })).toHaveAttribute("aria-pressed", "true");
    expect(writes(calls)).toHaveLength(0);
  });

  it("says why a subject could not be added, and keeps what was typed", async () => {
    const message = "Your school already has a subject called Robotics.";
    const { user } = openPage({ "POST /subjects": server(409, message, "SUBJECT_EXISTS", [{ path: "name", message: "Your school already has a subject called Robotics" }]) });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Other" }));
    await user.type(screen.getByRole("textbox", { name: "New subject" }), "Robotics{Enter}");
    expect(await screen.findByText("Your school already has a subject called Robotics")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New subject" })).toHaveValue("Robotics");
  });

  it("closes the new subject box on Escape without adding anything", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Other" }));
    await user.type(screen.getByRole("textbox", { name: "New subject" }), "Robo{Escape}");
    expect(screen.queryByRole("textbox", { name: "New subject" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });
});

describe("Add teacher: the login", () => {
  it("puts the name with a number in the username box, checks it is free, and makes a first password that passes the rules", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    const username = (screen.getByLabelText(/^Username/) as HTMLInputElement).value;
    expect(username).toMatch(/^meena\.singh_\d{2}$/);
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(reads(calls).filter((c) => c.path === "/staff/usernames/check").map((c) => c.query)).toEqual([`?username=${encodeURIComponent(username)}`]);
    const password = (screen.getByLabelText(/^Password/) as HTMLInputElement).value;
    expect(password).toHaveLength(10);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[^\w\s]/);
    await user.click(screen.getByRole("button", { name: "Make another password" }));
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).not.toBe(password);
  });

  it("keeps the same username when the Login step is opened again", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    const first = (screen.getByLabelText(/^Username/) as HTMLInputElement).value;
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await next(user);
    expect(await screen.findByLabelText(/^Username/)).toHaveValue(first);
  });

  it("a username made from the name that is already somebody's (in any school) is swapped at once for a free one (2026-11-04)", async () => {
    const { user } = openPage({
      "GET /staff/usernames/check": (_body, query) =>
        query.get("username") === "meena.singh_41" ? { available: true, suggestions: [] } : { available: false, suggestions: ["meena.singh_41", "meena.singh_73"] },
    });
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveValue("meena.singh_41"));
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(screen.queryByText("This username is taken. Try another")).not.toBeInTheDocument();
  });

  it("one the person types that is taken (in any school) is said so, with free ones, and one click takes one", async () => {
    const { user } = openPage({
      "GET /staff/usernames/check": (_body, query) =>
        query.get("username") === "meena.singh_41" ? { available: true, suggestions: [] } : { available: false, suggestions: ["meena.singh_41", "meena.singh_73"] },
    });
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveValue("meena.singh_41"));
    await user.clear(screen.getByLabelText(/^Username/));
    await user.type(screen.getByLabelText(/^Username/), "meena.singh_30");
    expect(await screen.findByText("This username is taken. Try another")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/)).toHaveAttribute("aria-invalid", "true");
    // A typed one stays as typed: nothing is swapped behind the person's back.
    expect(screen.getByLabelText(/^Username/)).toHaveValue("meena.singh_30");
    await user.click(screen.getByRole("button", { name: "meena.singh_41" }));
    expect(screen.getByLabelText(/^Username/)).toHaveValue("meena.singh_41");
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("will not add the teacher while the username is taken", async () => {
    const { calls, user } = openPage({ "GET /staff/usernames/check": () => ({ available: false, suggestions: ["meena.singh_41"] }) });
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    // The one made from the name is swapped for the offered one; here that one is taken too (it was taken a moment ago).
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveValue("meena.singh_41"));
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toHaveAttribute("aria-invalid", "true"));
    await screen.findByText("This username is taken. Try another");
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    expect(writes(calls)).toHaveLength(0);
    expect(screen.getByLabelText(/^Username/)).toHaveFocus();
  });

  it("keeps a username the person typed, even when the name is changed afterwards", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await user.clear(screen.getByLabelText(/^Username/));
    await user.type(screen.getByLabelText(/^Username/), "meena_s");
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await user.type(screen.getByLabelText(/^Name/), " Rathore");
    await next(user);
    await next(user);
    await next(user);
    expect(await screen.findByLabelText(/^Username/)).toHaveValue("meena_s");
  });

  it("will not add with a username or password that is wrong, and says so under the box", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await user.clear(screen.getByLabelText(/^Username/));
    await user.type(screen.getByLabelText(/^Username/), "9x");
    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), "weak");
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    expect(await screen.findByText(/A username is 3 to 30/)).toBeInTheDocument();
    expect(screen.getByText(/Password must be 8-72 characters/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("makes the teacher and the login in one request, with everything that was filled in", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Email/), "meena@school.example");
    await user.type(screen.getByLabelText(/^PIN code/), "462001");
    await next(user);
    await user.type(screen.getByLabelText(/^Employee code/), "t-14");
    await user.type(screen.getByLabelText(/^Qualification/), "M.Sc., B.Ed.");
    await user.type(screen.getByLabelText(/^Experience/), "9");
    await user.click(screen.getByRole("radio", { name: "Full time" }));
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Mathematics" }));
    await user.type(screen.getByLabelText(/^Most periods a day/), "6");
    await user.click(screen.getByRole("button", { name: "Saturday" }));
    await next(user);
    await user.clear(await screen.findByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), "Sch00l@Teach1");
    await user.click(screen.getByRole("button", { name: "Add teacher" }));

    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/staff/teachers" });
    expect(writes(calls)[0].body).toEqual({
      name: "Meena Singh",
      gender: "Female",
      dateOfBirth: null,
      mobile: "9876543210",
      email: "meena@school.example",
      address: { line1: null, city: null, state: null, pincode: "462001" },
      employeeCode: "t-14",
      designation: null,
      qualification: "M.Sc., B.Ed.",
      experienceYears: 9,
      joiningDate: null,
      employmentType: "full_time",
      subjectIds: ["maths"],
      maxPeriodsPerDay: 6,
      maxPeriodsPerWeek: null,
      offDays: [6],
      login: { username: expect.stringMatching(/^meena\.singh_\d{2}$/), password: "Sch00l@Teach1" },
    });
  });
});

describe("Add teacher: after it is added", () => {
  async function addIt(user: User) {
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), "Sch00l@Teach1");
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
  }

  it("shows the username and the password once, so they can be given to the teacher", async () => {
    const { user } = openPage();
    await addIt(user);
    expect(await screen.findByRole("heading", { name: "Meena Singh is added" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Login details" });
    expect(within(card).getByText("meena.singh")).toBeInTheDocument();
    expect(within(card).getByText("Sch00l@Teach1")).toBeInTheDocument();
  });

  it("copies the sign-in details as a message the school can send", async () => {
    const written: string[] = [];
    const { user } = openPage();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => void written.push(text) }, configurable: true });
    await addIt(user);
    await user.click(await screen.findByRole("button", { name: "Copy login details" }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain("Meena Singh");
    expect(written[0]).toContain("Username: meena.singh");
    expect(written[0]).toContain("Password: Sch00l@Teach1");
    expect(written[0]).toContain("/login");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("opens the teacher's page, or starts the next teacher from a clean form", async () => {
    const { user, router } = openPage();
    await addIt(user);
    expect(await screen.findByRole("link", { name: "View teacher" })).toHaveAttribute("href", "/school/teachers/new-teacher");
    await user.click(screen.getByRole("button", { name: "Add another teacher" }));
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("");
    expect(current()).toContain("Personal info");
    expect(router.state.location.pathname).toBe("/school/teachers/new");
  });

  it("stays under Manage Teacher when opened there, and under Teacher when opened from the Teacher list", async () => {
    openPage();
    expect(await screen.findByRole("link", { name: "Manage Teacher" })).toHaveAttribute("href", "/school/teachers");
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());

    const { user } = openPage({}, "/teachers/new");
    expect(await screen.findByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
    await addIt(user);
    expect(await screen.findByRole("link", { name: "View teacher" })).toHaveAttribute("href", "/teachers/new-teacher");
  });
});

describe("Add teacher: what the server says", () => {
  async function submit(user: User) {
    await screen.findByLabelText(/^Name/);
    await toLoginStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
  }

  it("takes a username that is taken back to the Login step with the suggestion under the box", async () => {
    const message = "This username is taken. Try meena.singh2";
    const { user } = openPage({ "POST /staff/teachers": server(409, message, "USERNAME_TAKEN", [{ path: "login.username", message }]) });
    await submit(user);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(current()).toContain("Login");
    expect(screen.getByLabelText(/^Username/)).toHaveAttribute("aria-invalid", "true");
  });

  it("opens the step that a refused box is on", async () => {
    const message = "Dev Patel already has this mobile number";
    const { user } = openPage({ "POST /staff/teachers": server(409, message, "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message }]) });
    await submit(user);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(current()).toContain("Personal info");
    // Typing in the box takes the server's message away.
    await user.type(screen.getByLabelText(/^Mobile number/), "1");
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
  });

  it("says in words when the whole thing failed", async () => {
    const { user } = openPage({ "POST /staff/teachers": server(500, "Something went wrong", "SERVER_ERROR", []) });
    await submit(user);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /is added/ })).not.toBeInTheDocument();
  });
});
