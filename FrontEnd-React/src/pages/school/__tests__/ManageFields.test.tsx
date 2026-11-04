import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { USUAL_STEPS, effectivePlacements, effectiveSteps, isUsualPlacements, isUsualSteps, type CustomFieldDef } from "../../../constants/studentFields";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentSettings } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import { defaultLayout } from "../../../utils/exportLayout";
import ManageFieldsPage from "../ManageFields";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const ROOM: CustomFieldDef = { key: "c_roomno1", label: "Hostel room", type: "text", options: [], mode: "optional" };
/** A school with fields of its own, asked and in the Excel. */
const withOwn = (...own: CustomFieldDef[]): StudentSettings => ({
  ...SETTINGS,
  customFields: own,
  exportColumns: [...defaultLayout(), ...own.map((f) => ({ key: f.key, heading: f.label }))],
  exportIsDefault: false,
  placements: effectivePlacements(null, own),
});

/** A new school's settings; PUT answers with them as the server would keep them (a mandatory detail's column is always in the file). */
function server(extra: Record<string, Handler> = {}, start: StudentSettings = SETTINGS) {
  let now: StudentSettings = { ...start, steps: start.steps ?? [...USUAL_STEPS] };
  return fakeApi({
    "GET /students/settings": () => now,
    // The preview reads the school's classes when it opens.
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/capacity": () => CAPACITY,
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

/** The page, reached from `from` (Add student's page is the one before it in the history) or opened directly (nothing before it). */
function open(from: "admit" | "students" | null = "admit") {
  const entries = from
    ? [{ pathname: from === "admit" ? "/school/students/new" : "/school/students" }, { pathname: "/school/students/fields", state: { from } }]
    : [{ pathname: "/school/students/fields" }];
  const router = createMemoryRouter(
    [
      { path: "/school/students/fields", element: <ManageFieldsPage /> },
      { path: "/school/students/new", element: <p>The Add student page</p> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { router, user: userEvent.setup() };
}
const puts = (calls: ReturnType<typeof fakeApi>) => calls.filter((c) => c.method === "PUT");
/** The two cards: what the form asks, and the Excel's columns. */
const formCard = () => screen.getByRole("region", { name: "Add student form" });
const excelCard = () => screen.getByRole("region", { name: "Excel columns" });
const ready = () => screen.findByRole("region", { name: "Excel columns" });
const step = (name: string) => within(formCard()).getByRole("group", { name: `${name} step` });
const formRow = (stepName: string, id: string) => step(stepName).querySelector(`li[data-detail="${id}"]`) as HTMLElement;
const inForm = (stepName: string) => [...step(stepName).querySelectorAll("li")].map((li) => li.getAttribute("data-detail"));
/** Opens the Move list of a detail (the app's dropdown) and picks a step. */
async function moveTo(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, label: string, to: string) {
  await user.click(within(row).getByRole("button", { name: new RegExp(`Move ${label}`) }));
  await user.click(await screen.findByRole("option", { name: to }));
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Manage fields: the form and the Excel, on a page of their own", () => {
  it("is a page, not a dialog: two cards, one for the Add student form and one for the Excel columns, and only the settings are read", async () => {
    const calls = server();
    open();
    expect(await screen.findByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await ready();
    expect(formCard()).toHaveTextContent("Add student form");
    expect(excelCard()).toHaveTextContent("Excel columns");
    expect(screen.getByText(/\d+ in the Excel · \d+ out/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide the columns" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // No students are needed (a new school has none): the Excel's preview is not asked for.
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /students/settings"]);
  });

  it("the explanation is behind an (i) beside the title: nothing of it on the page until it is pressed", async () => {
    server();
    const { user } = open();
    await ready();
    expect(screen.queryByText(/Two lists, each yours to arrange/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bulk upload is flexible/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "How the fields work" }));
    const dialog = await screen.findByRole("dialog", { name: "How the fields work" });
    // The form and the Excel are two lists; what is one setting for both.
    expect(within(dialog).getByText(/Two lists, each yours to arrange/)).toBeInTheDocument();
    expect(within(dialog).getByText(/It is one setting: change it on the form or in the Excel list and both follow/)).toBeInTheDocument();
    // The words that were confusing (a name in one column, or the first and last name): said once.
    expect(within(dialog).getByText(/is only the full name in one column of the Excel/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Add student always asks it, whatever you choose here/)).toBeInTheDocument();
    // The details every school keeps, said once (they have no switch).
    expect(within(dialog).getByText(/every school keeps these/i).closest("p")).toHaveTextContent(
      "Student Name, Gender, Date of Birth, Age, Category, Class and Section, both parents' names and mobile numbers, the Address (always needed) and the Previous School (needed from Class 1; Nursery, LKG and UKG may leave it empty). Section is asked when the class has sections"
    );
    // Add student is the strict one; a bulk upload is flexible (an old register seldom holds all of it).
    expect(within(dialog).getByText(/Bulk upload is flexible/).closest("p")).toHaveTextContent("Only the name, gender, date of birth, class and a parent's mobile number are needed");
    // The steps: what can be moved and what stays.
    expect(within(dialog).getByText(/Where each detail goes/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Got it" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("each card folds and opens again", async () => {
    server();
    const { user } = open();
    await ready();
    await user.click(screen.getByRole("button", { name: "Hide the columns" }));
    expect(screen.getByRole("button", { name: "Show the columns" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Show the columns" }));
    expect(screen.getByRole("button", { name: "Hide the columns" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Hide the form" }));
    expect(screen.getByRole("button", { name: "Show the form" })).toHaveAttribute("aria-expanded", "false");
  });

  it("what the form asks and what the Excel has are changed on their own: asking a detail does not add a column, a column does not make the form ask", async () => {
    const calls = server();
    const { user } = open();
    await ready();
    // The form asks the religion: no column comes in the Excel.
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    expect(within(excelCard()).getByRole("switch", { name: "Religion in the Excel" })).not.toBeChecked();
    // The Excel gets a column of the Samagra ID: the form does not ask it.
    await user.click(within(excelCard()).getByRole("switch", { name: "Samagra ID in the Excel" }));
    expect(within(formRow("More details", "samagraId")).getByRole("switch", { name: "Samagra ID asked" })).not.toBeChecked();
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved: Add student and the Excel follow it from now on")).toBeInTheDocument();
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { fields: Record<string, string>; exportColumns: { key: string }[] };
    expect(sent.fields).toEqual({ religion: "optional" });
    expect(sent.exportColumns.map((c) => c.key)).toContain("samagraId");
    expect(sent.exportColumns.map((c) => c.key)).not.toContain("religion");
    expect(screen.getByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
  });

  it("Mandatory is one setting: change it on the form and the Excel's list shows it, and the other way round", async () => {
    server();
    const { user } = open();
    await ready();
    const onForm = () => within(formRow("Academic", "aadhaarNumber")).getByRole("switch", { name: "Aadhaar number mandatory" });
    const inExcel = () => within(excelCard()).getByRole("switch", { name: "Aadhaar No. mandatory" });
    expect(onForm()).toBeChecked();
    expect(inExcel()).toBeChecked();
    await user.click(onForm());
    expect(onForm()).not.toBeChecked();
    expect(inExcel()).not.toBeChecked();
    await user.click(inExcel());
    expect(onForm()).toBeChecked();
    expect(inExcel()).toBeChecked();
  });

  it("a mandatory detail is in the Excel: its column cannot be taken out until it is optional", async () => {
    server();
    const { user } = open();
    await ready();
    const column = () => within(excelCard()).getByRole("switch", { name: "Aadhaar No. in the Excel" });
    expect(column()).toBeChecked();
    expect(column()).toBeDisabled();
    expect(column()).toHaveAttribute("title", expect.stringContaining("Mandatory"));
    await user.click(within(formRow("Academic", "aadhaarNumber")).getByRole("switch", { name: "Aadhaar number mandatory" }));
    expect(column()).toBeEnabled();
    await user.click(column());
    expect(column()).not.toBeChecked();
    // The form still asks it, as optional.
    expect(within(formRow("Academic", "aadhaarNumber")).getByRole("switch", { name: "Aadhaar number asked" })).toBeChecked();
  });

  it("making a detail mandatory on the form puts its column in the Excel; one Save sends both", async () => {
    const calls = server();
    const { user } = open();
    await ready();
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion mandatory" }));
    const column = within(excelCard()).getByRole("switch", { name: "Religion in the Excel" });
    expect(column).toBeChecked();
    expect(column).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    const sent = puts(calls)[0].body as { fields: Record<string, string>; exportColumns: { key: string }[] };
    expect(sent.fields).toEqual({ religion: "required" });
    expect(sent.exportColumns.at(-1)).toEqual({ key: "religion", heading: "Religion" });
  });

  it("Back goes to where the school came from (Add student), and the crumbs say so", async () => {
    server();
    const { router, user } = open("admit");
    await ready();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("StudentsAdd studentManage fields");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    expect(router.state.location.pathname).toBe("/school/students/new");
    expect(await screen.findByText("The Add student page")).toBeInTheDocument();
  });

  it("opened from the Students page, Back goes there; opened directly, Back goes to the Students page too", async () => {
    server();
    const first = open("students");
    await ready();
    await first.user.click(screen.getByRole("button", { name: "Back to Students" }));
    expect(first.router.state.location.pathname).toBe("/school/students");
    cleanup();
    const direct = open(null);
    await ready();
    await direct.user.click(screen.getByRole("button", { name: "Back to Students" }));
    expect(direct.router.state.location.pathname).toBe("/school/students");
  });

  it("leaving with changes not saved asks first: Cancel stays with the changes, Leave drops them (nothing is sent)", async () => {
    const calls = server();
    const { router, user } = open("admit");
    await ready();
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/students/fields");
    expect(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await user.click(await screen.findByRole("button", { name: "Leave" }));
    expect(router.state.location.pathname).toBe("/school/students/new");
    expect(puts(calls)).toHaveLength(0);
  });

  it("a save the server refuses says why and keeps the changes; an empty heading is refused on screen first", async () => {
    server({
      "PUT /students/settings": () => new Response(JSON.stringify({ success: false, message: "Could not save the fields. Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = open();
    await ready();
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the fields. Try again in a minute.")).toBeInTheDocument();
    expect(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Rename Gender in the Excel" }));
    await user.clear(screen.getByLabelText("Heading of Gender in the Excel"));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fix the headings marked in red first.")).toBeInTheDocument();
  });

  it("Back to the default asks first and puts the form and the Excel back as a new school has them; a field of its own can be added here", async () => {
    server();
    const { user } = open();
    await ready();
    expect(screen.queryByRole("button", { name: "Back to the default" })).not.toBeInTheDocument();
    await user.click(within(formRow("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    await moveTo(user, formRow("Academic", "aadhaarNumber"), "Aadhaar number", "Parents");
    expect(inForm("Parents")).toContain("aadhaarNumber");
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    await user.click(await screen.findByRole("button", { name: "Use the default" }));
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(inForm("Parents")).not.toContain("aadhaarNumber");
    expect(inForm("Academic")).toContain("aadhaarNumber");
    await user.click(within(formCard()).getByRole("button", { name: "Add your own field" }));
    expect(await screen.findByRole("dialog", { name: "Add your own field" })).toBeInTheDocument();
  });
});

describe("Manage fields: your own fields are made on the form and are columns of the Excel too", () => {
  it("Add your own field asks it in More details and gives it a column; both wait for Save, which sends the field and its column and nothing about places", async () => {
    const calls = server();
    const { user } = open();
    await ready();
    await user.click(within(formCard()).getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Hostel room");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(inForm("More details").some((id) => id?.startsWith("c_"))).toBe(true);
    expect(within(excelCard()).getByRole("switch", { name: "Hostel room in the Excel" })).toBeChecked();
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { customFields: { label: string }[]; exportColumns: { key: string }[]; placements?: unknown };
    expect(sent.customFields.map((f) => f.label)).toEqual(["Hostel room"]);
    expect(sent.exportColumns.length).toBeGreaterThan(defaultLayout().length);
    // More details is the usual place of an own field: nothing about places is sent.
    expect(sent.placements).toBeUndefined();
  });

  it("a field of its own is moved to another step with its Move list; Save sends the places and nothing else", async () => {
    const calls = server({}, withOwn(HOUSE, ROOM));
    const { user } = open();
    await ready();
    await moveTo(user, formRow("More details", "c_house1"), "House", "Academic");
    expect(inForm("Academic")).toContain("c_house1");
    expect(inForm("More details")).not.toContain("c_house1");
    expect(inForm("More details")).toContain("c_roomno1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { placements: { key: string; step: string }[]; customFields?: unknown; fields?: unknown; exportColumns?: unknown };
    expect(sent.customFields).toBeUndefined();
    expect(sent.fields).toBeUndefined();
    expect(sent.exportColumns).toBeUndefined();
    expect(sent.placements.find((p) => p.key === "c_house1")).toEqual({ key: "c_house1", step: "academic" });
  });

  it("an own field not asked on the form can stay a column of the Excel", async () => {
    const calls = server({}, withOwn(HOUSE));
    const { user } = open();
    await ready();
    await user.click(within(formRow("More details", "c_house1")).getByRole("switch", { name: "House asked" }));
    expect(within(excelCard()).getByRole("switch", { name: "House in the Excel" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    const sent = puts(calls)[0].body as { customFields: { key: string; mode: string }[]; exportColumns?: unknown };
    expect(sent.customFields).toEqual([expect.objectContaining({ key: "c_house1", mode: "hidden" })]);
    expect(sent.exportColumns).toBeUndefined();
  });

  it("a field deleted in its window leaves the form, the Excel and its step", async () => {
    server({}, withOwn(HOUSE));
    const { user } = open();
    await ready();
    await user.click(within(formRow("More details", "c_house1")).getByRole("button", { name: "Change or delete House" }));
    const dialog = await screen.findByRole("dialog", { name: "Change House" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete the field" }));
    expect(inForm("More details")).not.toContain("c_house1");
    expect(within(excelCard()).queryByRole("switch", { name: "House in the Excel" })).not.toBeInTheDocument();
  });
});

describe("Manage fields: the form's steps, the steps a school adds, and the preview", () => {
  it("shows the steps with the boxes of the form; the details a new school does not ask are shared out over the four steps", async () => {
    server();
    open();
    await ready();
    expect(inForm("Personal info")).toEqual(["firstName", "lastName", "gender", "dateOfBirth", "category", "addressLine1", "addressArea", "addressCity", "addressState", "addressPincode", "bloodGroup"]);
    expect(inForm("Academic")).toEqual(["classId", "rollNumber", "admissionDate", "previousSchoolName", "previousSchoolLastClass", "previousSchoolTcNumber", "previousSchoolTcDate", "aadhaarNumber", "srNumber", "pen"]);
    expect(inForm("Parents")).toEqual(["guardianName", "guardianRelation", "guardianMobile", "guardianAlternate", "guardianOccupation", "guardianEmail", "secondParent", "emergencyMobile", "rteSeat", "bpl"]);
    expect(inForm("More details")).toEqual(["religion", "samagraId", "apaarId", "nationality", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop"]);
  });

  it("the Preview is a button at the top of the form card, not a section of the page: it opens the page as Add student draws it", async () => {
    server();
    const { user } = open();
    await ready();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Academic" })).not.toBeInTheDocument();
    await user.click(within(formCard()).getByRole("button", { name: "Preview of Add student" }));
    const dialog = await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(await within(dialog).findByText("Academic year 2026-2027")).toBeInTheDocument();
    // What is not saved yet is in it: a detail moved to Personal info is a box of the Personal info step.
    await user.click(within(dialog).getByRole("button", { name: "Close the preview" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await moveTo(user, formRow("Academic", "aadhaarNumber"), "Aadhaar number", "Personal info");
    await user.click(within(formCard()).getByRole("button", { name: "Preview of Add student" }));
    const again = await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(await within(within(again).getByRole("group", { name: "Preview of Personal info" })).findByText(/^Aadhaar number/, { selector: "label" })).toBeInTheDocument();
    await user.click(within(within(again).getByRole("list", { name: "Steps" })).getByRole("button", { name: /Academic/ }));
    expect(within(within(again).getByRole("group", { name: "Preview of Academic" })).queryByText(/^Aadhaar number/, { selector: "label" })).not.toBeInTheDocument();
  });

  it("a step added here is saved with the places in it: one Save sends the steps and the places, and nothing else", async () => {
    const calls = server();
    const { user } = open();
    await ready();
    await user.click(within(formCard()).getByRole("button", { name: "Add a step" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a step" });
    await user.type(within(dialog).getByLabelText(/^Name of the step/), "Health");
    await user.click(within(dialog).getByRole("button", { name: "Add the step" }));
    expect(within(formCard()).getByRole("group", { name: "Health step" })).toBeInTheDocument();
    await moveTo(user, formRow("More details", "medicalNotes"), "Medical conditions", "Health");
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { steps: { key: string; name: string }[]; placements: { key: string; step: string }[]; fields?: unknown; exportColumns?: unknown };
    expect(sent.steps.map((x) => x.name)).toEqual(["More details", "Health"]);
    expect(sent.placements.find((p) => p.key === "medicalNotes")?.step).toBe(sent.steps[1].key);
    expect(sent.fields).toBeUndefined();
    expect(sent.exportColumns).toBeUndefined();
  });

  it("a step taken out is saved as gone, its details back in More details, and the usual steps are saved as none", async () => {
    const calls = server();
    const { user } = open();
    await ready();
    await user.click(within(formCard()).getByRole("button", { name: "Add a step" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a step" });
    await user.type(within(dialog).getByLabelText(/^Name of the step/), "Health");
    await user.click(within(dialog).getByRole("button", { name: "Add the step" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    await user.click(screen.getByRole("button", { name: "Delete Health" }));
    await user.click(await screen.findByRole("button", { name: "Delete the step" }));
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    expect(puts(calls)).toHaveLength(2);
    expect((puts(calls)[1].body as { steps: unknown }).steps).toBeNull();
  });

  it("Back to the default takes the steps the school added away too, to be saved with Save", async () => {
    server();
    const { user } = open();
    await ready();
    await user.click(within(formCard()).getByRole("button", { name: "Add a step" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a step" });
    await user.type(within(dialog).getByLabelText(/^Name of the step/), "Health");
    await user.click(within(dialog).getByRole("button", { name: "Add the step" }));
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    await user.click(await screen.findByRole("button", { name: "Use the default" }));
    expect(screen.queryByRole("group", { name: "Health step" })).not.toBeInTheDocument();
    expect(screen.getByText("All saved")).toBeInTheDocument();
  });
});
