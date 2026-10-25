import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { STUDENT_FORM_FIELDS, type FieldRules } from "../../../constants/studentFields";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentSettings } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import ManageFieldsPage from "../ManageFields";
import StudentAdmitPage from "../StudentAdmit";

// A test here fills in whole steps box by box; with the other test files running beside it, that takes a while.
vi.setConfig({ testTimeout: 60_000 });

/** Every detail the school may decide about is asked and may be left empty (the address and the previous school stay needed). */
const LENIENT_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, "optional"])) as FieldRules;
/** A school that asks nothing besides the fixed details and the parents: no health, fees or bus, so no last step. */
const PLAIN_RULES = Object.fromEntries(STUDENT_FORM_FIELDS.map((f) => [f.key, ["religion", "nationality", "emergencyMobile", "disability", "medicalNotes", "rteSeat", "bpl", "feeConcession", "transportRoute", "transportStop", "admissionDate", "samagraId", "apaarId", "pen", "srNumber"].includes(f.key) ? "hidden" : "optional"])) as FieldRules;

/** The school's reads of these pages; PUT keeps the settings the way the server would. */
function school(extra: Record<string, Handler> = {}, start: StudentSettings = SETTINGS) {
  let now: StudentSettings = start;
  return fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/capacity": () => CAPACITY,
    "GET /students/settings": () => now,
    "POST /students/guardians/lookup": () => ({ guardian: null }),
    "PUT /students/settings": (body) => {
      const input = body as { fields?: object; customFields?: StudentSettings["customFields"]; exportColumns?: StudentSettings["exportColumns"] | null };
      now = { ...now, fields: { ...now.fields, ...input.fields }, customFields: input.customFields ?? now.customFields, exportColumns: input.exportColumns ?? now.exportColumns, exportIsDefault: input.exportColumns === null };
      return now;
    },
    ...extra,
  });
}
/** What the server answers to an admission: the student, as the page of a student reads it. */
const ADMITTED = {
  id: "s9",
  name: "Asha Verma",
  admissionNumber: "ADM-2026-0001",
  place: { enrolmentId: "e9", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: null },
  siblings: [],
};
const withRules = (fields: FieldRules): StudentSettings => ({ ...SETTINGS, fields });

function openPage() {
  const router = createMemoryRouter(
    [
      { path: "/school/students/new", element: <StudentAdmitPage /> },
      { path: "/school/students/fields", element: <ManageFieldsPage /> },
      { path: "/school/students/:id", element: <p>The student's page</p> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: ["/school/students/new"] }
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
/** A box of the step that is opening: waits until it is there (a box that is not there yet is not an error to `waitFor`). */
const boxWhenShown = (path: string) =>
  waitFor(() => {
    const el = box(path);
    if (!el) throw new Error(`The box ${path} is not on screen yet`);
    return el;
  });
const labelOf = (path: string) => document.querySelector(`label[for="${idOf(path)}"]`)?.textContent ?? "";
const addStudent = () => screen.findByRole("heading", { name: "Add student" });
const steps = () => screen.getByRole("list", { name: "Steps" });
const current = () => within(steps()).getByRole("button", { current: "step" }).textContent;
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next step" }));
const admitButton = () => screen.getByRole("button", { name: "Admit the student" });
const pick = async (user: User, trigger: string, option: string) => {
  await user.click(box(trigger)!);
  await user.click(await screen.findByRole("option", { name: option }));
};
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/students");

/** Step 1, filled right: Class 1 (no sections) and where the child comes from. */
async function academic(user: User) {
  await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
  await user.type(box("previousSchool.name")!, "Little Flower School");
  await next(user);
}
/** Step 2, filled right. */
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
/** Step 3, filled right. */
async function parents(user: User) {
  await user.type(await boxWhenShown("guardians.0.mobile"), "9876543210");
  // The name box opens once the lookup of the number has answered ("New to your school").
  await user.type(await boxWhenShown("guardians.0.name"), "Ravi Verma");
  await next(user);
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Add student is filled in steps, like the school's onboarding", () => {
  it("opens on Academic: the steps are named, only the class and section and the previous school are there, and the button is Next step", async () => {
    school({}, withRules(LENIENT_RULES));
    openPage();
    await addStudent();
    await screen.findByRole("radio", { name: /Class 1/ });
    expect(within(steps()).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d/g, "").trim())).toEqual(["Academic", "Personal info", "Parents", "More details"]);
    expect(current()).toContain("Academic");
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    // This step's boxes, and nobody else's.
    expect(box("rollNumber")).not.toBeNull();
    expect(box("previousSchool.name")).not.toBeNull();
    for (const other of ["firstName", "lastName", "guardians.0.mobile", "address.line1", "nationality"]) expect(box(other), other).toBeNull();
    // Next step, not Admit; nothing to go back to.
    expect(screen.getByRole("button", { name: "Next step" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Admit the student" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous step" })).not.toBeInTheDocument();
  });

  it("Next step with a box wrong says what is wrong, in red under it, and stays on the step", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await next(user);
    expect(await screen.findByText("Choose the class")).toBeInTheDocument();
    expect(current()).toContain("Academic");
    // The next steps' boxes are not shown red before the person gets there.
    expect(box("firstName")).toBeNull();
  });

  it("a class from Class 1 needs the school it comes from (the step says so), Nursery would not", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await next(user);
    expect(await screen.findByText("Enter the previous school's name")).toBeInTheDocument();
    expect(current()).toContain("Academic");
  });

  it("a step done moves on to the next, which shows its own boxes; Previous step comes back with what was typed kept", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await academic(user);
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(box("firstName")).not.toBeNull();
    expect(box("previousSchool.name")).toBeNull();
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
    // Academic has its tick now.
    expect(within(steps()).getByRole("button", { name: /Academic/ })).toHaveTextContent("done");

    await user.type(box("firstName")!, "Asha");
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(box("previousSchool.name")).toHaveValue("Little Flower School");
    await next(user);
    expect(await boxWhenShown("firstName")).toHaveValue("Asha");
  });

  it("the stepper goes back to a step done, and cannot jump over the ones not reached", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await academic(user);
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(within(steps()).getByRole("button", { name: /Parents/ })).toBeDisabled();
    expect(within(steps()).getByRole("button", { name: /More details/ })).toBeDisabled();
    await user.click(within(steps()).getByRole("button", { name: /Academic/ }));
    await waitFor(() => expect(current()).toContain("Academic"));
    // Personal info was reached, so it can be opened again from here.
    expect(within(steps()).getByRole("button", { name: /Personal info/ })).toBeEnabled();
  });

  it("Enter in a box goes to the next step; it never admits before the last one", async () => {
    const calls = school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School{Enter}");
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(posts(calls)).toHaveLength(0);
  });

  it("the last step has Admit student instead of Next step, and one POST sends what every step asked", async () => {
    const calls = school({ "POST /students": () => ADMITTED }, withRules(LENIENT_RULES));
    const { router, user } = openPage();
    await addStudent();
    await academic(user);
    await personal(user);
    await parents(user);
    await waitFor(() => expect(current()).toContain("More details"));
    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);

    await user.click(admitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(1);
    expect(posts(calls)[0].body).toMatchObject({
      firstName: "Asha",
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2016-05-14",
      classId: "c1",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      guardians: [{ name: "Ravi Verma", mobile: "9876543210", relation: "Father", isPrimary: true }],
    });
  });

  it("a school that asks nothing of health, fees or the bus has three steps, and Admit is on Parents", async () => {
    school({ "POST /students": () => ADMITTED }, withRules(PLAIN_RULES));
    const { user } = openPage();
    await addStudent();
    await screen.findByRole("radio", { name: /Class 1/ });
    expect(within(steps()).getAllByRole("listitem")).toHaveLength(3);
    await academic(user);
    await personal(user);
    await waitFor(() => expect(box("guardians.0.mobile")).not.toBeNull());
    expect(current()).toContain("Parents");
    expect(screen.queryByRole("button", { name: "Next step" })).not.toBeInTheDocument();
    expect(admitButton()).toBeInTheDocument();
  });

  it("a refusal of the server about a box of an earlier step opens that step, with the message under the box", async () => {
    const refuse = () =>
      new Response(JSON.stringify({ success: false, message: "Invalid request data", code: "VALIDATION_ERROR", details: [{ path: "firstName", message: "Enter the first name" }] }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    school({ "POST /students": refuse }, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await academic(user);
    await personal(user);
    await parents(user);
    await waitFor(() => expect(current()).toContain("More details"));
    await user.click(admitButton());
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(await screen.findByText("Enter the first name")).toBeInTheDocument();
  });

  it("Clear all asks, then empties every box and goes back to the first step", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await academic(user);
    await waitFor(() => expect(current()).toContain("Personal info"));
    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    await user.click(await screen.findByRole("button", { name: "Clear all", hidden: false }).then((b) => b));
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(box("previousSchool.name")).toHaveValue("");
    expect(within(steps()).getByRole("button", { name: /Personal info/ })).toBeDisabled();
  });
});

describe("Add student: the school's fields are managed from a page of their own", () => {
  it("has a Manage fields link in its header; with nothing typed it just goes there (no dialog), and Back comes back to the form", async () => {
    school();
    const { router, user } = openPage();
    await addStudent();
    const link = screen.getByRole("link", { name: "Manage fields" });
    expect(link).toHaveAttribute("href", "/school/students/fields");
    await user.click(link);
    expect(await screen.findByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school/students/fields");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Back to Add student" }));
    await addStudent();
    expect(router.state.location.pathname).toBe("/school/students/new");
  });

  it("a field turned on and another made mandatory on that page are what Add student asks when the person is back", async () => {
    const calls = school();
    const { user } = openPage();
    await addStudent();

    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    await user.click(await screen.findByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("switch", { name: "Blood Group mandatory" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await addStudent();

    // The religion and the blood group are boxes of the child's own step.
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await user.type(box("previousSchool.lastClass")!, "UKG");
    await user.type(box("previousSchool.tcNumber")!, "TC-7");
    await next(user);
    await waitFor(() => expect(box("religion")).not.toBeNull());
    expect(labelOf("religion")).toContain("(optional)");
    expect(labelOf("bloodGroup")).not.toContain("(optional)");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/students")).toHaveLength(0);
  });

  it("a field made mandatory is asked by the form's own check: the step does not go on without it", async () => {
    school();
    const { user } = openPage();
    await addStudent();
    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    await user.click(await screen.findByRole("switch", { name: "Blood Group mandatory" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await addStudent();

    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await user.type(box("previousSchool.lastClass")!, "UKG");
    await user.type(box("previousSchool.tcNumber")!, "TC-7");
    await next(user);
    await user.type(await boxWhenShown("firstName"), "Asha");
    await next(user);
    expect(await screen.findByText("Choose the blood group")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
  });

  it("with something typed, it asks before leaving (what was typed would be lost): Cancel stays with it, the other button goes", async () => {
    const calls = school();
    const { router, user } = openPage();
    await addStudent();
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    const ask = await screen.findByRole("dialog", { name: "Leave this form?" });
    expect(ask).toHaveTextContent("Everything you typed is cleared");
    expect(router.state.location.pathname).toBe("/school/students/new");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("radio", { name: /Class 1/ })).toBeChecked();
    expect(router.state.location.pathname).toBe("/school/students/new");

    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    await user.click(await screen.findByRole("button", { name: "Go to Manage fields" }));
    expect(await screen.findByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" || c.method === "PUT")).toHaveLength(0);
  });
});
