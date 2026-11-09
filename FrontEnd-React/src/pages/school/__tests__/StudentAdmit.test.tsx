import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { STUDENT_FORM_FIELDS, effectivePlacements, effectiveSteps, isUsualPlacements, isUsualSteps, type FieldRules, type StepDef } from "../../../constants/studentFields";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentSettings } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import { placeIn } from "../../../utils/placement";
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
      const input = body as {
        fields?: object;
        customFields?: StudentSettings["customFields"];
        exportColumns?: StudentSettings["exportColumns"] | null;
        placements?: StudentSettings["placements"] | null;
        steps?: StudentSettings["steps"] | null;
      };
      const customFields = input.customFields ?? now.customFields;
      const steps = input.steps === undefined ? now.steps : effectiveSteps(input.steps);
      const placements = effectivePlacements(input.placements === null ? null : (input.placements ?? now.placements), customFields, steps);
      now = {
        ...now,
        fields: { ...now.fields, ...input.fields },
        customFields,
        exportColumns: input.exportColumns ?? now.exportColumns,
        exportIsDefault: input.exportColumns === null,
        placements,
        placementsAreDefault: isUsualPlacements(placements, customFields),
        steps,
        stepsAreDefault: isUsualSteps(steps),
      };
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

function openPage(entry = "/school/students/new") {
  const router = createMemoryRouter(
    [
      { path: "/school/students/new", element: <StudentAdmitPage /> },
      { path: "/school/students/fields", element: <ManageFieldsPage /> },
      { path: "/school/students/:id", element: <p>The student's page</p> },
      { path: "/school/students", element: <p>The students</p> },
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

/** Step 2, filled right: Class 1 (no sections) and where the child comes from. */
async function academic(user: User) {
  await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
  await user.type(box("previousSchool.name")!, "Little Flower School");
  await next(user);
}
/** Step 1, filled right. */
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
  await user.type(await boxWhenShown("guardians.0.name"), "Ravi Verma");
  await next(user);
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Add student is filled in steps, like the school's onboarding", () => {
  it("opens on Personal info: the steps are named, only the child, the address and the IDs are there, and the button is Next step", async () => {
    school({}, withRules(LENIENT_RULES));
    openPage();
    await addStudent();
    await boxWhenShown("firstName");
    expect(within(steps()).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d/g, "").trim())).toEqual(["Personal info", "Academic", "Parents", "More details"]);
    expect(current()).toContain("Personal info");
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    // This step's boxes, and nobody else's.
    expect(box("lastName")).not.toBeNull();
    expect(box("address.line1")).not.toBeNull();
    for (const other of ["rollNumber", "previousSchool.name", "guardians.0.mobile", "nationality"]) expect(box(other), other).toBeNull();
    expect(screen.queryByRole("radio", { name: /Class 1/ })).not.toBeInTheDocument();
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
    expect(await screen.findByText("Enter the first name")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
    // The next steps' boxes are not shown red before the person gets there.
    expect(screen.queryByText("Choose the class")).not.toBeInTheDocument();
    expect(box("previousSchool.name")).toBeNull();
  });

  it("Academic without a class says what is wrong and stays on the step", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    await next(user);
    expect(await screen.findByText("Choose the class")).toBeInTheDocument();
    expect(current()).toContain("Academic");
  });

  it("a class from Class 1 needs the school it comes from (the step says so), Nursery would not", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await next(user);
    expect(await screen.findByText("Enter the previous school's name")).toBeInTheDocument();
    expect(current()).toContain("Academic");
  });

  it("a step done moves on to the next, which shows its own boxes; Previous step comes back with what was typed kept", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(box("previousSchool.name")).not.toBeNull();
    expect(box("firstName")).toBeNull();
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
    // Personal info has its tick now.
    expect(within(steps()).getByRole("button", { name: /Personal info/ })).toHaveTextContent("done");

    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School");
    await user.click(screen.getByRole("button", { name: "Previous step" }));
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(box("firstName")).toHaveValue("Asha");
    await next(user);
    expect(await boxWhenShown("previousSchool.name")).toHaveValue("Little Flower School");
  });

  it("the stepper goes back to a step done, and cannot jump over the ones not reached", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(within(steps()).getByRole("button", { name: /Parents/ })).toBeDisabled();
    expect(within(steps()).getByRole("button", { name: /More details/ })).toBeDisabled();
    await user.click(within(steps()).getByRole("button", { name: /Personal info/ }));
    await waitFor(() => expect(current()).toContain("Personal info"));
    // Academic was reached, so it can be opened again from here.
    expect(within(steps()).getByRole("button", { name: /Academic/ })).toBeEnabled();
  });

  it("Enter in a box goes to the next step; it never admits before the last one", async () => {
    const calls = school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await user.click(await screen.findByRole("radio", { name: /Class 1/ }));
    await user.type(box("previousSchool.name")!, "Little Flower School{Enter}");
    await waitFor(() => expect(current()).toContain("Parents"));
    expect(posts(calls)).toHaveLength(0);
  });

  it("the last step has Admit student instead of Next step, and one POST sends what every step asked", async () => {
    const calls = school({ "POST /students": () => ADMITTED }, withRules(LENIENT_RULES));
    const { router, user } = openPage();
    await addStudent();
    await personal(user);
    await academic(user);
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
    await boxWhenShown("firstName");
    expect(within(steps()).getAllByRole("listitem")).toHaveLength(3);
    await personal(user);
    await academic(user);
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
    await personal(user);
    await academic(user);
    await parents(user);
    await waitFor(() => expect(current()).toContain("More details"));
    await user.click(admitButton());
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(await screen.findByText("Enter the first name")).toBeInTheDocument();
  });

  it("a child who is already in the school as an inactive student is not admitted twice: the question says they are inactive and points at their page", async () => {
    const answer = (inactive: boolean) => () =>
      new Response(
        JSON.stringify({
          success: false,
          message: "Asha Verma is already in your school",
          code: "DUPLICATE_STUDENT",
          details: [{ path: "confirmNotDuplicate", message: "x", student: { id: "s5", name: "Asha Verma", admissionNumber: "ADM-2026-0005", className: "Class 1", sectionName: null, inactive } }],
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    school({ "POST /students": answer(true) }, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await academic(user);
    await parents(user);
    await waitFor(() => expect(current()).toContain("More details"));
    await user.click(admitButton());
    const dialog = await screen.findByRole("dialog", { name: "This child is already in your school, as an inactive student" });
    expect(dialog).toHaveTextContent("Inactive");
    expect(within(dialog).getByRole("link", { name: /Asha Verma \(ADM-2026-0005\)/ })).toHaveAttribute("href", "/school/students/s5");
    expect(dialog).toHaveTextContent("Make active");
  });

  it("Clear all asks, then empties every box and goes back to the first step", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    await user.click(screen.getByRole("button", { name: /Clear all/ }));
    await user.click(await screen.findByRole("button", { name: "Clear all", hidden: false }).then((b) => b));
    await waitFor(() => expect(current()).toContain("Personal info"));
    expect(box("firstName")).toHaveValue("");
    expect(within(steps()).getByRole("button", { name: /Academic/ })).toBeDisabled();
  });
});

describe("Add student opened from a class", () => {
  const toAcademic = async (entry: string) => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage(entry);
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
  };

  it("has the class already chosen (and the previous school asked, as for any Class 1), the child still to fill in", async () => {
    await toAcademic("/school/students/new?class=c1");
    expect(await screen.findByRole("radio", { name: /Class 1/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Class 6/ })).not.toBeChecked();
    expect(box("previousSchool.name")).not.toBeNull();
  });

  it("has the section chosen too, when the link names one of that class", async () => {
    await toAcademic("/school/students/new?class=c6&section=c6-A");
    expect(await screen.findByRole("radio", { name: /Class 6/ })).toBeChecked();
    expect(await screen.findByRole("radio", { name: /^A/ })).toBeChecked();
  });

  it("ignores a class that is not the school's, a section of another class, and a section without a class", async () => {
    await toAcademic("/school/students/new?class=nope&section=c6-A");
    expect(await screen.findByRole("radio", { name: /Class 1/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Class 6/ })).not.toBeChecked();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    await toAcademic("/school/students/new?class=c1&section=c6-A");
    expect(await screen.findByRole("radio", { name: /Class 1/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /^A/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("switch", { name: "Religion asked" }));
    await user.click(screen.getByRole("switch", { name: "Blood group mandatory" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await addStudent();

    // The blood group is a box of the child's own step, now needed; the religion (placed in More details) brings that step.
    await waitFor(() => expect(box("bloodGroup")).not.toBeNull());
    expect(labelOf("bloodGroup")).not.toContain("(optional)");
    expect(within(steps()).getByRole("button", { name: /More details/ })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/students")).toHaveLength(0);
  });

  it("a field made mandatory is asked by the form's own check: the step does not go on without it", async () => {
    school();
    const { user } = openPage();
    await addStudent();
    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    await user.click(await screen.findByRole("switch", { name: "Blood group mandatory" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await addStudent();

    await user.type(await boxWhenShown("firstName"), "Asha");
    await next(user);
    expect(await screen.findByText("Choose the blood group")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
  });

  it("with something typed, it asks before leaving (what was typed would be lost): Cancel stays with it, the other button goes", async () => {
    const calls = school();
    const { router, user } = openPage();
    await addStudent();
    await user.type(await boxWhenShown("firstName"), "Asha");
    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    const ask = await screen.findByRole("dialog", { name: "Leave this form?" });
    expect(ask).toHaveTextContent("Everything you typed is cleared");
    expect(router.state.location.pathname).toBe("/school/students/new");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(box("firstName")).toHaveValue("Asha");
    expect(router.state.location.pathname).toBe("/school/students/new");

    await user.click(screen.getByRole("link", { name: "Manage fields" }));
    await user.click(await screen.findByRole("button", { name: "Go to Manage fields" }));
    expect(await screen.findByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" || c.method === "PUT")).toHaveLength(0);
  });
});

/** Steps 1 to 3 filled right, ending on the last step. */
async function toLastStep(user: User) {
  await personal(user);
  await waitFor(() => expect(current()).toContain("Academic"));
  await academic(user);
  await waitFor(() => expect(current()).toContain("Parents"));
  await parents(user);
}

describe("Add student asks each detail in the step the school placed it in", () => {
  const moved = (key: string, step: "personal" | "academic" | "parents" | "more", rules: FieldRules = LENIENT_RULES): StudentSettings => {
    const placements = placeIn(effectivePlacements(null, []), key, step);
    return { ...SETTINGS, fields: rules, placements, placementsAreDefault: false };
  };

  it("a detail moved to Academic is asked there and no longer in Personal info", async () => {
    school({}, moved("bloodGroup", "academic"));
    const { user } = openPage();
    await addStudent();
    await boxWhenShown("firstName");
    expect(box("bloodGroup")).toBeNull();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(await boxWhenShown("bloodGroup")).toBeInTheDocument();
    expect(box("previousSchool.name")).not.toBeNull();
  });

  it("a school that moved nothing is asked the blood group in Personal info and the Aadhaar number with the class", async () => {
    school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    expect(await boxWhenShown("bloodGroup")).toBeInTheDocument();
    expect(box("aadhaarNumber")).toBeNull();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(await boxWhenShown("aadhaarNumber")).toBeInTheDocument();
  });

  it("a detail moved to Parents is asked under the parents", async () => {
    school({}, moved("bloodGroup", "parents"));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    await academic(user);
    await waitFor(() => expect(current()).toContain("Parents"));
    expect(box("guardians.0.mobile")).not.toBeNull();
    expect(await boxWhenShown("bloodGroup")).toBeInTheDocument();
  });

  it("More details is not a step when everything it held was moved away", async () => {
    // A school that asks the nationality only, with it moved into Academic: no More details, Admit is on Parents.
    const rules = { ...PLAIN_RULES, nationality: "optional" } as FieldRules;
    school({}, moved("nationality", "academic", rules));
    const { user } = openPage();
    await addStudent();
    await boxWhenShown("firstName");
    expect(within(steps()).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d/g, "").trim())).toEqual(["Personal info", "Academic", "Parents"]);
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    expect(await boxWhenShown("nationality")).toBeInTheDocument();
  });

  it("a needed detail that is moved is checked on the step it was moved to: Next stays there and says what is missing", async () => {
    const rules = { ...LENIENT_RULES, aadhaarNumber: "required" } as FieldRules;
    school({}, moved("aadhaarNumber", "parents", rules));
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await waitFor(() => expect(current()).toContain("Academic"));
    await academic(user);
    await waitFor(() => expect(current()).toContain("Parents"));
    await user.type(await boxWhenShown("guardians.0.mobile"), "9876543210");
    await user.type(await boxWhenShown("guardians.0.name"), "Ravi Verma");
    await next(user);
    expect(await screen.findByText("Enter the Aadhaar number")).toBeInTheDocument();
    expect(current()).toContain("Parents");
  });
});

describe("Add your own field, on the last step of Add student", () => {
  const OWN = { key: "c_hostel1", label: "Hostel room", type: "text" as const, options: [], mode: "optional" as const };

  it("saves the field in the school's own settings at once, asks it right there, and keeps what was typed", async () => {
    const calls = school({}, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await user.type(await boxWhenShown("nationality"), "Indian");
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), OWN.label);
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));

    // The box is asked on the same step, and nothing typed was lost.
    expect(await screen.findByLabelText(/^Hostel room/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(box("nationality")).toHaveValue("Indian");

    // One request: the field, in the Excel's list too. Its step is More details, the usual one for a field of its own.
    const puts = calls.filter((c) => c.method === "PUT" && c.path === "/students/settings");
    expect(puts).toHaveLength(1);
    const sent = puts[0].body as { customFields: { key: string; label: string; type: string; mode: string }[]; exportColumns: { key: string }[] | null; placements?: unknown };
    expect(sent.customFields).toEqual([expect.objectContaining({ label: "Hostel room", type: "text", mode: "optional", key: expect.stringMatching(/^c_[a-z0-9]{4,16}$/) })]);
    expect(sent.exportColumns?.some((c) => c.key === sent.customFields[0].key)).toBe(true);
    expect(sent.placements ?? null).toBeNull();
    // The settings were read once for the page and are not read again: the answer of the save is the new copy.
    expect(calls.filter((c) => c.path === "/students/settings" && c.method === "GET")).toHaveLength(1);
  });

  it("the new field goes with the admission: its answer is sent with the student", async () => {
    const calls = school({ "POST /students": () => ADMITTED }, withRules(LENIENT_RULES));
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), OWN.label);
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    await user.type(await screen.findByLabelText(/^Hostel room/), "B-12");
    await user.click(admitButton());
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    const sent = posts(calls)[0].body as { custom?: Record<string, string> };
    expect(Object.values(sent.custom ?? {})).toEqual(["B-12"]);
  });

  it("a name the school already uses is said in the dialog and nothing is sent", async () => {
    const calls = school({}, { ...withRules(LENIENT_RULES), customFields: [OWN], placements: effectivePlacements(null, [OWN]) });
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "hostel room");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await within(dialog).findByText("Two fields cannot have the same name")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("when the server cannot keep the field the dialog stays open and says why", async () => {
    school(
      { "PUT /students/settings": () => new Response(JSON.stringify({ success: false, message: "The school cannot have more fields" }), { status: 409, headers: { "Content-Type": "application/json" } }) },
      withRules(LENIENT_RULES)
    );
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Bus pass no.");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await within(dialog).findByText(/The school cannot have more fields/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add your own field" })).toBeInTheDocument();
  });
});

describe("Add student with a step the school added", () => {
  const HEALTH: StepDef = { key: "s_health1", name: "Health" };
  const withHealth = (): StudentSettings => {
    const steps = [{ key: "more", name: "More details" }, HEALTH];
    return { ...withRules(LENIENT_RULES), steps, stepsAreDefault: false, placements: placeIn(effectivePlacements(null, [], steps), "medicalNotes", "s_health1"), placementsAreDefault: false };
  };

  it("is a step of its name after the others, with the card of its details; the step before it still has its own", async () => {
    school({}, withHealth());
    const { user } = openPage();
    await addStudent();
    await boxWhenShown("firstName");
    expect(within(steps()).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d/g, "").trim())).toEqual(["Personal info", "Academic", "Parents", "More details", "Health"]);
    await toLastStep(user);
    expect(current()).toContain("More details");
    expect(box("medicalNotes")).toBeNull();
    await next(user);
    await waitFor(() => expect(current()).toContain("Health"));
    expect(screen.getByRole("heading", { name: "Health" })).toBeInTheDocument();
    expect(await boxWhenShown("medicalNotes")).toBeInTheDocument();
    // It is the last step now: Admit is here.
    expect(admitButton()).toBeInTheDocument();
  });

  it("a message about a detail in that step opens that step", async () => {
    const calls = school({ "POST /students": () => new Response(JSON.stringify({ success: false, message: "Invalid request data", details: [{ path: "medicalNotes", message: "Enter the medical conditions (or None)" }] }), { status: 400, headers: { "Content-Type": "application/json" } }) }, withHealth());
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await next(user);
    await waitFor(() => expect(current()).toContain("Health"));
    await user.type(await boxWhenShown("medicalNotes"), "Asthma");
    await user.click(admitButton());
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(await screen.findByText("Enter the medical conditions (or None)")).toBeInTheDocument();
    expect(current()).toContain("Health");
  });

  it("Add your own field on that step asks the new field there: one PUT with the field, its column and its place", async () => {
    const calls = school({}, withHealth());
    const { user } = openPage();
    await addStudent();
    await toLastStep(user);
    await next(user);
    await waitFor(() => expect(current()).toContain("Health"));
    await user.click(await screen.findByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Doctor's name");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await screen.findByLabelText(/^Doctor's name/)).toBeInTheDocument();
    const puts = calls.filter((c) => c.method === "PUT" && c.path === "/students/settings");
    expect(puts).toHaveLength(1);
    const sent = puts[0].body as { customFields: { key: string }[]; placements: { key: string; step: string }[] };
    expect(sent.placements.find((p) => p.key === sent.customFields[0].key)).toEqual({ key: sent.customFields[0].key, step: "s_health1" });
    expect(current()).toContain("Health");
  });
});

describe("Add student: the parent's login (2026-11-04)", () => {
  /** The admitted child as the server answers, with the primary parent and no login yet. */
  const WITH_PARENT = {
    ...ADMITTED,
    guardians: [{ id: "g9", name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9876543210", mobileVerified: false, alternateMobile: null, email: null, occupation: null, login: null }],
  };
  const loginPosts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/students/guardians/g9/login");

  it("is an option under the parents (off unless ticked): ticked, it makes the primary parent's login right after the admission and the student's page shows it once", async () => {
    const calls = school(
      {
        "POST /students": () => WITH_PARENT,
        "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
        "POST /students/guardians/g9/login": (body) => ({ guardianId: "g9", login: { username: (body as { username: string }).username, isActive: true } }),
      },
      withRules(LENIENT_RULES)
    );
    const { router, user } = openPage();
    await addStudent();
    await personal(user);
    await academic(user);
    await user.type(await boxWhenShown("guardians.0.mobile"), "9876543210");
    await user.type(await boxWhenShown("guardians.0.name"), "Ravi Verma");
    const card = screen.getByRole("region", { name: "Parent login" });
    const tick = within(card).getByRole("checkbox", { name: "Make a login for Ravi Verma" });
    expect(tick).not.toBeChecked();
    await user.click(tick);
    const username = within(card).getByLabelText(/^Username/) as HTMLInputElement;
    expect(username.value).toMatch(/^ravi\.verma_\d{2}$/);
    await next(user);
    await waitFor(() => expect(current()).toContain("More details"));
    await user.click(admitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(posts(calls)).toHaveLength(1);
    expect(loginPosts(calls)).toHaveLength(1);
    const sent = loginPosts(calls)[0].body as { username: string; password: string };
    expect(sent.username).toBe(username.value);
    expect(router.state.location.state).toMatchObject({ admitted: true, parentLogin: { name: "Ravi Verma", username: username.value, password: sent.password } });
  });

  it("left unticked, the admission is as before: no login is made", async () => {
    const calls = school({ "POST /students": () => WITH_PARENT }, withRules(LENIENT_RULES));
    const { router, user } = openPage();
    await addStudent();
    await personal(user);
    await academic(user);
    await parents(user);
    await waitFor(() => expect(current()).toContain("More details"));
    await user.click(admitButton());
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/students/s9"));
    expect(loginPosts(calls)).toHaveLength(0);
  });

  it("a parent already in the school with a login: the card says so, and the new child joins that login", async () => {
    school(
      {
        "POST /students/guardians/lookup": () => ({
          guardian: { id: "g1", name: "Ravi Verma", mobile: "9876543210", alternateMobile: null, email: null, occupation: null, login: { username: "ravi.verma_12", isActive: true }, children: [] },
        }),
      },
      withRules(LENIENT_RULES)
    );
    const { user } = openPage();
    await addStudent();
    await personal(user);
    await academic(user);
    await user.type(await boxWhenShown("guardians.0.mobile"), "9876543210");
    const card = await screen.findByRole("region", { name: "Parent login" });
    await waitFor(() => expect(card).toHaveTextContent("Ravi Verma already signs in as ravi.verma_12"));
    expect(within(card).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
