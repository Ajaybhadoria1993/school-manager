import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { STUDENT_FORM_FIELDS, type FieldRules } from "../../../constants/studentFields";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { AcademicStructure, StudentCapacity, StudentSettings } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import StudentAdmitPage from "../StudentAdmit";

vi.setConfig({ testTimeout: 60_000 });

/**
 * A class that is full (Class 1: 40 seats, 40 students, no sections) and a section that is full (Class 6 - A: 30 of 30). The page asks what
 * to do: add seats, or (for a class with no sections) make sections. It never puts a student over the seats without raising them.
 */

const LENIENT_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, "optional"])) as FieldRules;
const SETTINGS_LENIENT: StudentSettings = { ...SETTINGS, fields: LENIENT_RULES };

const FULL_STRUCTURE: AcademicStructure = {
  ...STRUCTURE,
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, capacity: 40, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, capacity: 100, sections: [{ id: "c6-A", classId: "c6", name: "A", capacity: 30, room: "6A" }] },
  ],
};
const FULL_CAPACITY: StudentCapacity = {
  ...CAPACITY,
  sections: [{ sectionId: "c6-A", classId: "c6", capacity: 30, enrolled: 30, seatsLeft: 0, nextRollNumber: 31 }],
  classes: [
    { classId: "c1", enrolled: 40, nextRollNumber: 41 },
    { classId: "c6", enrolled: 30, nextRollNumber: null },
  ],
  totals: { students: 70, seats: 30, seatsLeft: 0, fullSections: 1 },
};
const ADMITTED = {
  id: "s9",
  name: "Asha Verma",
  admissionNumber: "ADM-2026-0001",
  place: { enrolmentId: "e9", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: null },
  siblings: [],
};

function school(extra: Record<string, Handler> = {}, structure = FULL_STRUCTURE, capacity = FULL_CAPACITY) {
  return fakeApi({
    "GET /academics/structure": () => structure,
    "GET /students/capacity": () => capacity,
    "GET /students/settings": () => SETTINGS_LENIENT,
    "POST /students/guardians/lookup": () => ({ guardian: null }),
    ...extra,
  });
}

function openPage(role: "school_admin" | "teacher" = "school_admin", permissions?: string[], entry = "/school/students/new") {
  signInAs(role, permissions);
  const router = createMemoryRouter(
    [
      { path: "/school/students/new", element: <StudentAdmitPage /> },
      { path: "/school/students/:id", element: <p>The student&apos;s page</p> },
    ],
    { initialEntries: [entry] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { router, user: userEvent.setup({ delay: null }) };
}
type User = ReturnType<typeof userEvent.setup>;

const idOf = (path: string) => `student-${path.replace(/\./g, "-")}`;
const box = (path: string) => document.getElementById(idOf(path)) as HTMLInputElement | null;
const boxWhenShown = (path: string) =>
  waitFor(() => {
    const el = box(path);
    if (!el) throw new Error(`The box ${path} is not on screen yet`);
    return el;
  });
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next step" }));
const pick = async (user: User, trigger: string, option: string) => {
  await user.click(box(trigger)!);
  await user.click(await screen.findByRole("option", { name: option }));
};
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/students");

async function personal(user: User) {
  await user.type(await boxWhenShown("firstName"), "Asha");
  await user.type(box("lastName")!, "Verma");
  await pick(user, "gender", "Female");
  await user.type(box("dateOfBirth")!, "2016-05-14");
  await user.type(box("address.line1")!, "12 MG Road");
  await user.type(box("address.city")!, "Bhopal");
  await pick(user, "address.state", "Madhya Pradesh");
  await user.type(box("address.pincode")!, "462001");
  await next(user);
}
/** Step 2 with a class picked (its section too, when it has some) and where the child comes from. */
async function academic(user: User, className: RegExp, section?: string) {
  await user.click(await screen.findByRole("radio", { name: className }));
  if (section) await user.click(await screen.findByRole("radio", { name: new RegExp(`^${section}`) }));
  await user.type(box("previousSchool.name")!, "Little Flower School");
  await next(user);
}
async function parents(user: User) {
  await user.type(await boxWhenShown("guardians.0.mobile"), "9876543210");
  await user.type(await boxWhenShown("guardians.0.name"), "Ravi Verma");
  await next(user);
}

afterEach(() => {
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("a class with no sections that is full, when it is picked", () => {
  it("says so in the class box, with the numbers, and offers what to do", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    expect(await screen.findByText("Class 1 is full: 40 of 40 seats are taken.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add seats or make sections" })).toBeInTheDocument();
  });

  it("a class that still has room says how many seats are taken, and offers nothing", async () => {
    school({}, FULL_STRUCTURE, { ...FULL_CAPACITY, classes: [{ classId: "c1", enrolled: 12, nextRollNumber: 13 }, ...FULL_CAPACITY.classes.slice(1)] });
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    expect(await screen.findByText(/12 of 40 seats taken/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add seats or make sections" })).toBeNull();
  });

  it("a class whose seats are not set has no limit: no warning", async () => {
    school({}, { ...FULL_STRUCTURE, classes: [{ ...FULL_STRUCTURE.classes[0], capacity: null }, FULL_STRUCTURE.classes[1]] });
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    expect(await screen.findByText(/has no sections this year: the student joins the whole class/)).toBeInTheDocument();
    expect(screen.queryByText(/is full/)).toBeNull();
  });
});

describe("adding seats to a full class", () => {
  it("is chosen on the page and sent with the admission: nothing changes until the student is admitted", async () => {
    const calls = school({ "POST /students": () => ADMITTED });
    const { router, user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/40 of 40 seats/)).toBeInTheDocument();
    // Both answers are on the screen at once.
    expect(within(dialog).getByRole("radio", { name: /Add seats/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Make sections/ })).toBeInTheDocument();
    const seats = within(dialog).getByRole("textbox", { name: "New seats of Class 1" });
    expect(seats).toHaveValue("41");
    expect(within(dialog).getByText("Class 1 will have 41 seats, 1 more than now.")).toBeInTheDocument();

    await user.clear(seats);
    await user.type(seats, "45");
    await user.click(within(dialog).getByRole("button", { name: "Add seats" }));
    expect(posts(calls)).toHaveLength(0);
    expect(calls.filter((c) => c.method !== "GET" && c.path.startsWith("/academics"))).toHaveLength(0);
    expect(await screen.findByText(/Its seats become 45 when you admit/)).toBeInTheDocument();

    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(1);
    expect(posts(calls)[0].body).toMatchObject({ classId: "c1", raiseSeatsTo: 45 });
    expect((posts(calls)[0].body as { allowOverCapacity: boolean }).allowOverCapacity).toBe(false);
  });

  it("will not take a number that leaves no seat for the student, and says what is needed", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));
    const dialog = await screen.findByRole("dialog");
    const seats = within(dialog).getByRole("textbox", { name: "New seats of Class 1" });
    await user.clear(seats);
    await user.type(seats, "40");
    expect(within(dialog).getByText("Class 1 has 40 students: it needs at least 41 seats.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add seats" }));
    // The window stays: nothing was chosen.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/Its seats become/)).toBeNull();
  });
});

describe("a class that fills up while the form is open", () => {
  it("is told so when Admit is pressed (CLASS_FULL), with the numbers, and Add seats and admit sends the admission again with the seats", async () => {
    // The page was told there is room (12 of 40), but somebody else took the seats: the server says it is full.
    let attempts = 0;
    const calls = school(
      {
        "POST /students": () => {
          attempts += 1;
          if (attempts === 1) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Class 1 is full: 40 of 40 seats are taken.",
                code: "CLASS_FULL",
                details: [{ path: "classId", message: "Class 1 is full (40 of 40 seats taken)", capacity: 40, enrolled: 40, seatsLeft: 0, classId: "c1", sectionId: null }],
              }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }
          return ADMITTED;
        },
      },
      FULL_STRUCTURE,
      { ...FULL_CAPACITY, classes: [{ classId: "c1", enrolled: 12, nextRollNumber: 13 }, ...FULL_CAPACITY.classes.slice(1)] }
    );
    const { router, user } = openPage();
    await personal(user);
    await academic(user, /Class 1/);
    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Class 1 is full")).toBeInTheDocument();
    expect(within(dialog).getByText(/40 of 40 seats/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add seats and admit" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(2);
    expect(posts(calls)[0].body).not.toHaveProperty("raiseSeatsTo");
    expect(posts(calls)[1].body).toMatchObject({ classId: "c1", raiseSeatsTo: 41 });
  });
});

describe("making sections from the full-class window", () => {
  const CLASS_1_DIVIDED = {
    class: { ...FULL_STRUCTURE.classes[0], sections: [] },
    sections: [
      { id: "c1-A", name: "A", capacity: 25, room: null, students: 20 },
      { id: "c1-B", name: "B", capacity: 25, room: null, students: 20 },
    ],
    moved: 40,
    classSeats: { from: 40, to: 50 },
  };

  it("shows how the students would be shared out before anything is done, with seats for the new student", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Make sections/ }));

    expect(within(dialog).getByText("A: 20 students · B: 20 students")).toBeInTheDocument();
    expect(within(dialog).getByText(/The new student goes to section A/)).toBeInTheDocument();
    // 20 students and the new one need 21; rounded up to 25 so there is a little room.
    expect(within(dialog).getByRole("textbox", { name: "Seats in each section" })).toHaveValue("25");
    expect(within(dialog).getByText(/Class 1 then has 50 seats/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: "3 sections" }));
    expect(within(dialog).getByText("A: 14 students · B: 13 students · C: 13 students")).toBeInTheDocument();
    expect(within(dialog).getByText(/The new student goes to section B/)).toBeInTheDocument();
  });

  it("will not take seats too few for the section that gets the new student", async () => {
    const calls = school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Make sections/ }));
    const each = within(dialog).getByRole("textbox", { name: "Seats in each section" });
    await user.clear(each);
    await user.type(each, "20");
    expect(within(dialog).getByText(/At least 21 seats each/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Make sections" }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("divides the class, picks the section for the new student and carries on with the admission (one divide, one admission)", async () => {
    let divided = false;
    const calls = school(
      {
        "POST /academics/classes/c1/divide": () => {
          divided = true;
          return CLASS_1_DIVIDED;
        },
        "POST /students": () => ADMITTED,
      },
      FULL_STRUCTURE,
      // The page is told there is room (12 of 40); the server says the class is full when the student is admitted.
      { ...FULL_CAPACITY, classes: [{ classId: "c1", enrolled: 12, nextRollNumber: 13 }, ...FULL_CAPACITY.classes.slice(1)] }
    );
    const { router, user } = openPage();
    await personal(user);
    await academic(user, /Class 1/);
    await parents(user);
    // The capacity said there is room, but it filled up: the server's CLASS_FULL on the first admission opens the window.
    calls.length = 0;
    let first = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname.replace("/api/v1", "");
      const body = request.method === "GET" ? undefined : await request.json().catch(() => undefined);
      calls.push({ method: request.method, path, body, query: new URL(request.url).search });
      const json = (status: number, payload: object) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
      if (request.method === "POST" && path === "/students") {
        if (first) {
          first = false;
          return json(409, { success: false, message: "Class 1 is full: 40 of 40 seats are taken.", code: "CLASS_FULL", details: [{ path: "classId", message: "full", capacity: 40, enrolled: 40, seatsLeft: 0, classId: "c1", sectionId: null }] });
        }
        return json(200, { success: true, data: ADMITTED });
      }
      if (path === "/academics/classes/c1/divide") return json(200, { success: true, data: CLASS_1_DIVIDED });
      if (path === "/academics/structure") return json(200, { success: true, data: divided ? { ...FULL_STRUCTURE, classes: [{ ...FULL_STRUCTURE.classes[0], sections: [{ id: "c1-A", classId: "c1", name: "A", capacity: 25, room: null }] }, FULL_STRUCTURE.classes[1]] } : FULL_STRUCTURE });
      if (path === "/students/capacity") return json(200, { success: true, data: FULL_CAPACITY });
      if (path === "/students/settings") return json(200, { success: true, data: SETTINGS_LENIENT });
      return json(404, { success: false, message: "Not found" });
    });

    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Make sections/ }));
    await user.click(within(dialog).getByRole("button", { name: "Make sections and admit" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    const divides = calls.filter((c) => c.method === "POST" && c.path === "/academics/classes/c1/divide");
    expect(divides).toHaveLength(1);
    expect(divides[0].body).toEqual({ count: 2, capacity: 25 });
    const admissions = posts(calls);
    expect(admissions).toHaveLength(2);
    // The second admission goes to the section the new student was given, and asks for no more seats.
    expect(admissions[1].body).toMatchObject({ classId: "c1", sectionId: "c1-A" });
    expect(admissions[1].body).not.toHaveProperty("raiseSeatsTo");
  });

  it("is not offered to someone who may not manage classes: they can only add seats", async () => {
    school();
    // A receptionist-like person: may add students, may not manage classes.
    const { user } = openPage("teacher", ["students.add", "students.view", "classes.view"]);
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("radio", { name: /Make sections/ })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "New seats of Class 1" })).toBeInTheDocument();
  });
});

describe("a section that is full", () => {
  /** Class 6 has one section (A, full), picked with the class; the previous school is typed and Next opens the window. */
  async function pickAndNext(user: User) {
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    return screen.findByRole("dialog");
  }

  it("offers more seats (or a new section; the other answer is Cancel and another section), and says how the class grows when its sections no longer fit", async () => {
    // Class 6 has 100 seats and one section of 30; adding seats to A does not make the class grow.
    school();
    const { user } = openPage();
    const dialog = await pickAndNext(user);
    expect(within(dialog).getByText(/30 of 30 seats/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: /Make sections/ })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "New seats of Class 6 - A" })).toHaveValue("31");
    expect(within(dialog).getByText("Class 6 - A will have 31 seats, 1 more than now.")).toBeInTheDocument();
    // Cancel: the section stays picked (it is the only one), the step is the same, and nothing was decided.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("radio", { name: /^A/ })).toBeChecked();
    expect(box("guardians.0.mobile")).toBeNull();
  });

  it("says the class's seats grow too when the section's new seats no longer fit in the class", async () => {
    school({}, { ...FULL_STRUCTURE, classes: [FULL_STRUCTURE.classes[0], { ...FULL_STRUCTURE.classes[1], capacity: 30 }] });
    const { user } = openPage();
    const dialog = await pickAndNext(user);
    expect(within(dialog).getByText(/Class 6 has 30 seats and its sections share them, so its seats grow to 31/)).toBeInTheDocument();
  });

  it("is carried on once seats are added, and the admission carries the new seats", async () => {
    const calls = school({ "POST /students": () => ADMITTED });
    const { router, user } = openPage();
    const dialog = await pickAndNext(user);
    await user.click(within(dialog).getByRole("button", { name: "Add seats" }));
    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)[0].body).toMatchObject({ classId: "c6", sectionId: "c6-A", raiseSeatsTo: 31 });
  });
});

// ---- A full place the page was opened on (a link from a class's page chose it): asked in the Academic step, not at the end --------

/** The place a link chose is already picked when the Academic step opens; the previous school is all that is left to type there. */
async function atAcademicOf(user: User) {
  await personal(user);
  await user.type(await boxWhenShown("previousSchool.name"), "Little Flower School");
}
const onParents = () => boxWhenShown("guardians.0.mobile");

describe("a full place the page was opened on is asked about in the Academic step", () => {
  it("a full section: Next on the Academic step asks, and stays there until it is answered (nothing is sent)", async () => {
    const calls = school({ "POST /students": () => ADMITTED });
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c6&section=c6-A");
    await atAcademicOf(user);
    expect(screen.getByRole("radio", { name: /^A/ })).toBeChecked();
    expect(screen.queryByRole("dialog")).toBeNull();

    await next(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Class 6 - A is full")).toBeInTheDocument();
    expect(within(dialog).getByText(/30 of 30 seats/)).toBeInTheDocument();
    // It is still the Academic step: nothing moved on, nothing was sent.
    expect(box("previousSchool.name")).not.toBeNull();
    expect(box("guardians.0.mobile")).toBeNull();
    expect(posts(calls)).toHaveLength(0);

    // Cancel: the same step; Next asks again (nothing was decided).
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(box("previousSchool.name")).not.toBeNull();
    await next(user);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("Add seats: the form goes on to the next step at once, and the admission carries the seats without asking again at the end", async () => {
    const calls = school({ "POST /students": () => ADMITTED });
    const { router, user } = openPage("school_admin", undefined, "/school/students/new?class=c6&section=c6-A");
    await atAcademicOf(user);
    await next(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add seats" }));
    await onParents();
    expect(screen.queryByRole("dialog")).toBeNull();

    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(1);
    expect(posts(calls)[0].body).toMatchObject({ classId: "c6", sectionId: "c6-A", raiseSeatsTo: 31 });
  });

  it("a full class with no sections: the same window (Add seats or Make sections), in the Academic step", async () => {
    school();
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c1");
    await atAcademicOf(user);
    await next(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Class 1 is full")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Add seats/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Make sections/ })).toBeInTheDocument();
    expect(box("guardians.0.mobile")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Add seats" }));
    await onParents();
  });

  it("Make sections: the class is divided, the new student gets a section, and the form goes on", async () => {
    const calls = school({
      "POST /academics/classes/c1/divide": () => ({
        class: { id: "c1", name: "Class 1" },
        sections: [
          { id: "c1-A", name: "A", students: 20, capacity: 25 },
          { id: "c1-B", name: "B", students: 20, capacity: 25 },
        ],
        moved: 40,
      }),
      "POST /students": () => ADMITTED,
    });
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c1");
    await atAcademicOf(user);
    await next(user);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Make sections/ }));
    await user.click(within(dialog).getByRole("button", { name: "Make sections" }));
    await onParents();
    expect(calls.filter((c) => c.method === "POST" && c.path === "/academics/classes/c1/divide")).toHaveLength(1);
    expect(posts(calls)).toHaveLength(0);
  });

  it("a place that has room goes on without a question", async () => {
    school({}, FULL_STRUCTURE, { ...FULL_CAPACITY, sections: [{ sectionId: "c6-A", classId: "c6", capacity: 30, enrolled: 12, seatsLeft: 18, nextRollNumber: 13 }] });
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c6&section=c6-A");
    await atAcademicOf(user);
    await next(user);
    await onParents();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a class whose seats are not set has no limit: it goes on without a question", async () => {
    school({}, { ...FULL_STRUCTURE, classes: [{ ...FULL_STRUCTURE.classes[0], capacity: null }, FULL_STRUCTURE.classes[1]] });
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c1");
    await atAcademicOf(user);
    await next(user);
    await onParents();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a place already answered is not asked again: going back to the Academic step and on does not open the window", async () => {
    school({ "POST /students": () => ADMITTED });
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add seats" }));
    await onParents();
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await next(user);
    await onParents();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another full section picked after the answer is asked again (the answer was for the first one)", async () => {
    const two = {
      ...FULL_STRUCTURE,
      classes: [FULL_STRUCTURE.classes[0], { ...FULL_STRUCTURE.classes[1], sections: [FULL_STRUCTURE.classes[1].sections[0], { id: "c6-B", classId: "c6", name: "B", capacity: 30, room: "6B" }] }],
    };
    const cap = { ...FULL_CAPACITY, sections: [...FULL_CAPACITY.sections, { sectionId: "c6-B", classId: "c6", capacity: 30, enrolled: 30, seatsLeft: 0, nextRollNumber: 31 }] };
    school({}, two, cap);
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c6&section=c6-A");
    await atAcademicOf(user);
    await next(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add seats" }));
    await onParents();
    // Back to Academic and on to B, which is full too: asked again, at Next or at the pick.
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await user.click(await screen.findByRole("radio", { name: /^B/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Class 6 - B is full")).toBeInTheDocument();
  });
});

// ---- A class with one section has it picked at once; the seats added show on the page; a full section can get a new section --------

const TWO_SECTIONS = {
  ...FULL_STRUCTURE,
  classes: [FULL_STRUCTURE.classes[0], { ...FULL_STRUCTURE.classes[1], sections: [FULL_STRUCTURE.classes[1].sections[0], { id: "c6-B", classId: "c6", name: "B", capacity: 30, room: "6B" }] }],
};
const TWO_SECTIONS_CAPACITY = { ...FULL_CAPACITY, sections: [...FULL_CAPACITY.sections, { sectionId: "c6-B", classId: "c6", capacity: 30, enrolled: 10, seatsLeft: 20, nextRollNumber: 11 }] };

describe("a class with one section has it picked at once", () => {
  it("picking the class picks its only section, a full one too: nothing is asked until Next is pressed", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    expect(screen.getByRole("radio", { name: /^A/ })).toBeChecked();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Class 6 - A is full")).toBeInTheDocument();
    expect(box("guardians.0.mobile")).toBeNull();
  });

  it("a link that names only the class picks its only section too", async () => {
    school();
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c6");
    await personal(user);
    expect(await screen.findByRole("radio", { name: /^A/ })).toBeChecked();
  });

  it("a class with several sections is not picked for the person: they choose", async () => {
    school({}, TWO_SECTIONS, TWO_SECTIONS_CAPACITY);
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    expect(screen.getByRole("radio", { name: /^A/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^B/ })).not.toBeChecked();
    expect(screen.getByText("2 sections this year. Pick one.")).toBeInTheDocument();
    cleanup();
  });

  it("a class with several sections opened by a link that names only the class asks for the section", async () => {
    school({}, TWO_SECTIONS, TWO_SECTIONS_CAPACITY);
    const { user } = openPage("school_admin", undefined, "/school/students/new?class=c6");
    await personal(user);
    await screen.findByRole("radio", { name: /^A/ });
    expect(screen.getByRole("radio", { name: /^A/ })).not.toBeChecked();
  });
});

describe("the seats added show on the page", () => {
  it("a section: its card says the new seats, it is no longer Full, and the note says its seats become that many when the student is admitted", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    expect(screen.getByText("30 of 30 seats filled")).toBeInTheDocument();
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Add seats" }));
    await onParents();
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(await screen.findByText("30 of 31 seats filled")).toBeInTheDocument();
    expect(screen.queryByText("30 of 30 seats filled")).toBeNull();
    expect(screen.getByText("Class 6 - A: 30 of 31 seats taken, 1 left. Its seats become 31 when you admit.")).toBeInTheDocument();
  });

  it("a class with no sections: the box says the new seats too", async () => {
    school();
    const { user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(await screen.findByRole("button", { name: "Add seats or make sections" }));
    const dialog = await screen.findByRole("dialog");
    const seats = within(dialog).getByRole("textbox", { name: "New seats of Class 1" });
    await user.clear(seats);
    await user.type(seats, "45");
    await user.click(within(dialog).getByRole("button", { name: "Add seats" }));
    expect(await screen.findByText("Class 1 has 40 of 45 seats taken. Its seats become 45 when you admit.")).toBeInTheDocument();
  });
});

describe("a full section can also get a new section", () => {
  const NEW_SECTION = { id: "c6-B", classId: "c6", name: "B", capacity: 30, room: null };

  async function fullSectionDialog(user: User, role: "school_admin" | "teacher" = "school_admin") {
    void role;
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    return screen.findByRole("dialog");
  }

  it("offers Add seats and Add a section; Add seats is the first", async () => {
    school();
    const { user } = openPage();
    const dialog = await fullSectionDialog(user);
    expect(within(dialog).getByRole("radio", { name: /Add seats/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Add a section/ })).not.toBeChecked();
    // A full section is never divided: that is for a class that has no sections.
    expect(within(dialog).queryByRole("radio", { name: /Make sections/ })).toBeNull();
  });

  it("is not offered to someone who may not manage classes: they can only add seats", async () => {
    school();
    const { user } = openPage("teacher", ["students.add", "students.view", "classes.view"]);
    const dialog = await fullSectionDialog(user);
    expect(within(dialog).queryByRole("radio")).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "New seats of Class 6 - A" })).toBeInTheDocument();
  });

  it("asks for the name (the next letter), the seats (the full section's) and says how the class's seats grow", async () => {
    school();
    const { user } = openPage();
    const dialog = await fullSectionDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Add a section/ }));
    expect(within(dialog).getByRole("textbox", { name: "Name of the new section" })).toHaveValue("B");
    expect(within(dialog).getByRole("textbox", { name: "Seats of the new section" })).toHaveValue("30");
    // Class 6 has 100 seats and section A holds 30: 30 more fit, so the class does not grow.
    expect(within(dialog).queryByText(/seats grow to/)).toBeNull();
    await user.clear(within(dialog).getByRole("textbox", { name: "Seats of the new section" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Seats of the new section" }), "90");
    expect(within(dialog).getByText(/Class 6 has 100 seats and its sections share them, so its seats grow to 120/)).toBeInTheDocument();
  });

  it("makes the section (the class's seats may grow), picks it for the student and goes on to the next step; the admission has no more seats to add", async () => {
    const calls = school({ "POST /academics/classes/c6/sections": () => NEW_SECTION, "POST /students": () => ADMITTED });
    const { router, user } = openPage();
    const dialog = await fullSectionDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Add a section/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    await onParents();
    const made = calls.filter((c) => c.method === "POST" && c.path === "/academics/classes/c6/sections");
    expect(made).toHaveLength(1);
    expect(made[0].body).toEqual({ name: "B", capacity: 30, room: null, raiseClassSeats: true });

    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(1);
    expect(posts(calls)[0].body).toMatchObject({ classId: "c6", sectionId: "c6-B" });
    expect(posts(calls)[0].body).not.toHaveProperty("raiseSeatsTo");
  });

  it("will not take an empty name or seats that are not a number; nothing is sent", async () => {
    const calls = school();
    const { user } = openPage();
    const dialog = await fullSectionDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Add a section/ }));
    await user.clear(within(dialog).getByRole("textbox", { name: "Name of the new section" }));
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    expect(within(dialog).getByText("Enter the section name.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Name of the new section" }), "B");
    await user.clear(within(dialog).getByRole("textbox", { name: "Seats of the new section" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Seats of the new section" }), "0");
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    expect(within(dialog).getByText(/Seats must be a whole number from 1 to 200/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("when the server refuses (the name is taken) the window stays and says so under the name", async () => {
    school({
      "POST /academics/classes/c6/sections": () =>
        new Response(JSON.stringify({ success: false, message: 'This class already has a section called "B".', code: "SECTION_EXISTS" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = openPage();
    const dialog = await fullSectionDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Add a section/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    expect(await within(dialog).findByText('This class already has a section called "B".')).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(box("guardians.0.mobile")).toBeNull();
  });

  it("is also asked when the server says the section is full at Admit (a section that filled up meanwhile): Add section and admit", async () => {
    let attempts = 0;
    const calls = school(
      {
        "POST /academics/classes/c6/sections": () => NEW_SECTION,
        "POST /students": () => {
          attempts += 1;
          if (attempts === 1) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Class 6 - A is full",
                code: "SECTION_FULL",
                details: [{ path: "sectionId", message: "full", capacity: 30, enrolled: 30, seatsLeft: 0, classId: "c6", sectionId: "c6-A" }],
              }),
              { status: 409, headers: { "Content-Type": "application/json" } }
            );
          }
          return ADMITTED;
        },
      },
      FULL_STRUCTURE,
      { ...FULL_CAPACITY, sections: [{ sectionId: "c6-A", classId: "c6", capacity: 30, enrolled: 12, seatsLeft: 18, nextRollNumber: 13 }] }
    );
    const { router, user } = openPage();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 6/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await next(user);
    await parents(user);
    await user.click(await screen.findByRole("button", { name: "Admit the student" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Add a section/ }));
    await user.click(within(dialog).getByRole("button", { name: "Add section and admit" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(2);
    expect(posts(calls)[1].body).toMatchObject({ classId: "c6", sectionId: "c6-B" });
  });
});
