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
    // With login access the teacher's email is their login, Pending, and the answer says where the invitation went.
    "POST /staff/teachers": (body) => {
      const sent = body as { giveLogin?: boolean; email?: string };
      return {
        ...MEENA,
        id: "new-teacher",
        ...sent,
        login: sent.giveLogin ? { username: null, email: sent.email, isActive: true, pending: true } : null,
        ...(sent.giveLogin ? { invite: { email: sent.email, inviteExpiresAt: "2026-11-29T10:00:00.000Z", emailSent: true } } : {}),
      };
    },
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

/** Personal info filled, and on to the last step (Teaching), where Add teacher is. */
async function toLastStep(user: User) {
  await fillPersonal(user);
  await next(user);
  await next(user);
  await screen.findByRole("button", { name: "Add teacher" });
}

describe("Add teacher: a photo (optional)", () => {
  const photo = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "me.png", { type: "image/png" });

  it("a chosen photo is saved for the new teacher, after they are added", async () => {
    const { calls, user } = openPage({ "PUT /staff/teachers/new-teacher/photo": () => ({ photo: "data:image/png;base64,aGk=" }) });
    await user.upload(screen.getByLabelText("Choose a photo"), photo());
    expect(await screen.findByRole("img", { name: /^Photo of/ })).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    await waitFor(() => expect(writes(calls).map((c) => c.path)).toEqual(["/staff/teachers", "/staff/teachers/new-teacher/photo"]));
  });

  it("a photo that could not be saved is said; the teacher is added all the same", async () => {
    const { user } = openPage({ "PUT /staff/teachers/new-teacher/photo": server(400, "The photo must be a PNG, JPG or WebP picture.", "PHOTO_NOT_IMAGE", []) });
    await user.upload(screen.getByLabelText("Choose a photo"), photo());
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    expect(await screen.findByText(/The photo was not saved/)).toBeInTheDocument();
  });
});

describe("Add teacher: a resume (optional)", () => {
  const cv = () => new File([new Uint8Array(40)], "meena-cv.pdf", { type: "application/pdf" });

  it("a chosen resume is saved for the new teacher, after they are added", async () => {
    const { calls, user } = openPage({ "PUT /staff/teachers/new-teacher/resume": () => ({ resume: { name: "meena-cv.pdf", size: 40, uploadedAt: "2026-11-27T00:00:00.000Z" } }) });
    await user.upload(screen.getByLabelText("Choose a resume"), cv());
    expect(screen.getByText("meena-cv.pdf")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    await waitFor(() => expect(writes(calls).map((c) => c.path)).toEqual(["/staff/teachers", "/staff/teachers/new-teacher/resume"]));
  });

  it("kept while moving between the steps, taken out again, and nothing asked without one", async () => {
    const { calls, user } = openPage();
    await user.upload(screen.getByLabelText("Choose a resume"), cv());
    await fillPersonal(user);
    await next(user);
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByText("meena-cv.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove the resume" }));
    expect(screen.queryByText("meena-cv.pdf")).not.toBeInTheDocument();
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    expect(calls.some((c) => c.path.endsWith("/resume"))).toBe(false);
  });

  it("a resume that could not be saved is said; the teacher is added all the same", async () => {
    const { user } = openPage({ "PUT /staff/teachers/new-teacher/resume": server(400, "The resume must be a PDF or Word file.", "RESUME_NOT_DOCUMENT", []) });
    await user.upload(screen.getByLabelText("Choose a resume"), cv());
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    expect(await screen.findByText(/The resume was not saved/)).toBeInTheDocument();
  });
});

describe("Add teacher: the steps", () => {
  it("opens on Personal info, with the three steps and no Back button (no Login step since 2026-11-26)", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Add teacher" })).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Steps" }));
    expect(steps.getAllByRole("listitem").map((li) => li.textContent?.replace(/^\d/, "").trim())).toEqual(["Personal info", "Job details", "Teaching"]);
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
    // Only the school's own fields (Teacher > Fields) are read with the page.
    expect(reads(calls).map((c) => c.path)).toEqual(["/staff/teachers/settings"]);
    await fillPersonal(user);
    await next(user);
    await next(user);
    expect(await screen.findByRole("button", { name: "Mathematics" })).toBeInTheDocument();
    expect(reads(calls).map((c) => c.path)).toEqual(["/staff/teachers/settings", "/subjects"]);
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

describe("Add teacher: login access (2026-11-26: the email and an invitation, no username or password)", () => {
  it("has a Give login access box, not ticked, and nowhere a username or a password", async () => {
    const { user } = openPage();
    await screen.findByLabelText(/^Name/);
    const box = screen.getByRole("checkbox", { name: "Give login access" });
    expect(box).not.toBeChecked();
    expect(screen.queryByLabelText(/^Username/)).not.toBeInTheDocument();
    await toLastStep(user);
    expect(screen.queryByLabelText(/^Username/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
  });

  it("not ticked: the teacher is added without a login, the email may be empty, and nothing about logins is sent", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).not.toHaveProperty("giveLogin");
    expect(writes(calls)[0].body).not.toHaveProperty("login");
    expect(await screen.findByRole("heading", { name: "Meena Singh is added" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Login invitation" })).not.toBeInTheDocument();
  });

  it("ticked: the email is needed before Next, even when the school does not ask the email", async () => {
    const { calls, user } = openPage({ "GET /staff/teachers/settings": () => ({ fields: { email: "hidden" }, customFields: [], exportColumns: [], exportIsDefault: true }) });
    await screen.findByLabelText(/^Name/);
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    await fillPersonal(user);
    await user.click(screen.getByRole("checkbox", { name: "Give login access" }));
    // The email box comes with the tick, needed.
    const email = await screen.findByLabelText(/^Email/);
    await next(user);
    expect(await screen.findByText("Enter the email: the login invitation is sent to it")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
    await user.type(email, "meena@school.example");
    await next(user);
    expect(await screen.findByLabelText(/^Employee code/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("makes the teacher in one request with everything filled in and login access; afterwards says where the invitation went and that it is Pending", async () => {
    const { calls, user } = openPage();
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Email/), "meena@school.example");
    await user.click(screen.getByRole("checkbox", { name: "Give login access" }));
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
      giveLogin: true,
    });
    const card = await screen.findByRole("region", { name: "Login invitation" });
    expect(within(card).getByText(/Invitation sent to/)).toHaveTextContent("Invitation sent to meena@school.example");
    expect(within(card).getByText(/Pending until they open the link/)).toBeInTheDocument();
  });

  it("says plainly when the invitation email could not be sent", async () => {
    const { user } = openPage({
      "POST /staff/teachers": (body) => ({ ...MEENA, id: "new-teacher", ...(body as object), login: { username: null, email: "meena@school.example", isActive: true, pending: true }, invite: { email: "meena@school.example", inviteExpiresAt: "2026-11-29T10:00:00.000Z", emailSent: false } }),
    });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Email/), "meena@school.example");
    await user.click(screen.getByRole("checkbox", { name: "Give login access" }));
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be sent");
  });
});

describe("Add teacher: after it is added", () => {
  async function addIt(user: User) {
    await screen.findByLabelText(/^Name/);
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
  }

  it("copies the invitation link on a development server that has no email service", async () => {
    const written: string[] = [];
    const link = "http://localhost:5173/set-password?token=abc";
    const { user } = openPage({
      "POST /staff/teachers": (body) => ({ ...MEENA, id: "new-teacher", ...(body as object), login: { username: null, email: "meena@school.example", isActive: true, pending: true }, invite: { email: "meena@school.example", inviteExpiresAt: "2026-11-29T10:00:00.000Z", emailSent: false, devInviteLink: link } }),
    });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => void written.push(text) }, configurable: true });
    await addIt(user);
    expect(await screen.findByText(link)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(written).toEqual([link]));
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
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
  }

  it("takes an email that already has a login back to Personal info, under the email box", async () => {
    const message = "This email already has a login. Use another email, or leave it empty";
    const { user } = openPage({ "POST /staff/teachers": server(409, message, "LOGIN_EMAIL_TAKEN", [{ path: "email", message }]) });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await user.type(screen.getByLabelText(/^Email/), "school@school.example");
    await user.click(screen.getByRole("checkbox", { name: "Give login access" }));
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(current()).toContain("Personal info");
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
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
