import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { DEFAULT_TEACHER_RULES, type TeacherFieldRules } from "../../../constants/teacherFields";
import { fakeApi as pretendApi, type Call, type Handler } from "../../../test/fakeApi";
import type { ExportColumn, UpdateTeacherSettingsInput } from "../../../types";
import { defaultTeacherLayout } from "../../../utils/teacherLayout";
import TeacherFieldsPage from "../TeacherFields";

/**
 * Teacher > Manage fields (2026-11-13), the way the students' page works: the Add teacher form (every usual detail Asked and Mandatory, the
 * school's own fields) and the Excel's columns (in the file or not, heading, place), one Mandatory for both, kept in a draft until one Save that
 * sends only what changed.
 */
const PAN: CustomFieldDef = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };
const BLOOD: CustomFieldDef = { key: "c_blood001", label: "Blood Group", type: "choice", options: ["A+", "B+", "O+"], mode: "required" };
const HOUSE: CustomFieldDef = { key: "c_house001", label: "House Duty", type: "yesNo", options: [], mode: "optional" };

/** A school's settings as the server keeps them: what is sent is merged in, a null layout is the usual one. */
function fakeApi(initial: { fields?: Partial<TeacherFieldRules>; custom?: CustomFieldDef[]; columns?: ExportColumn[] | null } = {}, extra: Record<string, Handler> = {}) {
  let fields: TeacherFieldRules = { ...DEFAULT_TEACHER_RULES, ...initial.fields };
  let custom = initial.custom ?? [];
  let columns: ExportColumn[] | null = initial.columns ?? null;
  const answer = () => ({ fields, customFields: custom, exportColumns: columns ?? defaultTeacherLayout(custom), exportIsDefault: columns === null });
  return pretendApi({
    "GET /staff/teachers/settings": () => answer(),
    "PUT /staff/teachers/settings": (body) => {
      const sent = body as UpdateTeacherSettingsInput;
      if (sent.fields) fields = { ...fields, ...sent.fields } as TeacherFieldRules;
      if (sent.customFields) custom = sent.customFields;
      if (sent.exportColumns !== undefined) columns = sent.exportColumns;
      return answer();
    },
    ...extra,
  });
}

function openPage(path = "/school/teachers/fields") {
  const router = createMemoryRouter(
    [
      { path: "/school/teachers/fields", element: <TeacherFieldsPage /> },
      { path: "/teachers/fields", element: <TeacherFieldsPage /> },
      { path: "/school/teachers", element: <p>The Manage Teacher list</p> },
      { path: "/teachers", element: <p>All the teachers</p> },
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
  return { router, user: userEvent.setup() };
}

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
const save = () => screen.getByRole("button", { name: "Save" });
const formCard = async () => within(await screen.findByRole("region", { name: "Add teacher form" }));
const excelCard = async () => within(await screen.findByRole("region", { name: "Excel columns" }));
const columnTitles = async () => (await excelCard()).getAllByRole("button", { name: /^Rename / }).map((b) => b.textContent);

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Teacher > Manage fields", () => {
  it("has two cards, the Add teacher form and the Excel columns, and nothing to save until something changes", async () => {
    fakeApi();
    openPage();
    expect(await screen.findByRole("heading", { name: "Manage fields", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Teacher" })).toHaveAttribute("href", "/school/teachers");
    const form = await formCard();
    // The usual details are asked and optional; the person and the login are always asked.
    expect(form.getByText("13 asked · 0 mandatory")).toBeInTheDocument();
    expect(form.getAllByText("Always").length).toBe(4);
    const excel = await excelCard();
    expect(excel.getByText("20 in the Excel · 0 out")).toBeInTheDocument();
    expect(await columnTitles()).toContain("Qualification");
    expect(save()).toBeDisabled();
    expect(screen.getByText("All saved")).toBeInTheDocument();
  });

  it("opened from Teacher, goes back to Teacher", async () => {
    fakeApi();
    openPage("/teachers/fields");
    expect(await screen.findByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
  });

  it("makes a detail mandatory for the form and the Excel at once: its column cannot leave the file, and one request carries only that", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    const form = await formCard();
    await user.click(form.getByRole("switch", { name: "Date of Birth mandatory" }));
    expect(form.getByText("13 asked · 1 mandatory")).toBeInTheDocument();
    const excel = await excelCard();
    expect(excel.getByRole("switch", { name: "Date of Birth mandatory" })).toBeChecked();
    expect(excel.getByRole("switch", { name: "Date of Birth in the Excel" })).toBeDisabled();
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(save());
    expect(await screen.findByText("Saved: Add teacher and the Excel follow it from now on")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    expect(puts(calls)[0].body).toEqual({ fields: { dateOfBirth: "required" } });
    await waitFor(() => expect(screen.getByText("All saved")).toBeInTheDocument());
  });

  it("does not ask a detail the school switches off, and a detail not asked cannot be made mandatory", async () => {
    const calls = fakeApi({ fields: { qualification: "required" } });
    const { user } = openPage();
    const form = await formCard();
    await user.click(form.getByRole("switch", { name: "Qualification asked" }));
    expect(form.getByRole("switch", { name: "Qualification asked" })).not.toBeChecked();
    // Not asked is not mandatory either: the Excel's list shows a dash where the switch was.
    expect((await excelCard()).queryByRole("switch", { name: "Qualification mandatory" })).not.toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({ fields: { qualification: "hidden" } });
  });

  it("takes a column out of the Excel and types a heading, without touching what the form asks; the name and the mobile number always stay", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    const excel = await excelCard();
    expect(excel.getByRole("switch", { name: "Name in the Excel" })).toBeDisabled();
    expect(excel.getByRole("switch", { name: "Mobile in the Excel" })).toBeDisabled();

    await user.click(excel.getByRole("switch", { name: "Qualification in the Excel" }));
    await user.click(excel.getByRole("button", { name: "Rename Subjects in the Excel" }));
    const heading = await excel.findByLabelText("Heading of Subjects in the Excel");
    await user.clear(heading);
    await user.type(heading, "Teaches{Enter}");
    expect(await columnTitles()).toContain("Teaches");

    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const sent = puts(calls)[0].body as UpdateTeacherSettingsInput;
    expect(sent.fields).toBeUndefined();
    expect(sent.exportColumns?.map((c) => c.key)).not.toContain("qualification");
    expect(sent.exportColumns?.find((c) => c.key === "subjects")).toEqual({ key: "subjects", heading: "Teaches" });
  });

  it("moves a column one place with the arrows", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    const excel = await excelCard();
    await user.click(excel.getByRole("button", { name: "Move Gender down" }));
    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const keys = (puts(calls)[0].body as UpdateTeacherSettingsInput).exportColumns!.map((c) => c.key);
    expect(keys.slice(2, 4)).toEqual(["dateOfBirth", "gender"]);
  });

  it("adds a field of the school's own: asked on the form and a column of the file (the usual layout, so no layout of its own is saved), changes it, and deletes it", async () => {
    const calls = fakeApi({ custom: [BLOOD, HOUSE] });
    const { user } = openPage();
    const form = await formCard();
    expect(form.getByText("Your own field · List of choices (3)")).toBeInTheDocument();
    expect(form.getByText("Your own field · Yes / No")).toBeInTheDocument();

    await user.click(form.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    expect(dialog).toHaveTextContent("As Add teacher and the Excel show it");
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Hobby");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    await waitFor(() => expect(form.getByText("Hobby")).toBeInTheDocument());
    expect(await columnTitles()).toContain("Hobby");

    await user.click(form.getByRole("button", { name: "Change Blood Group" }));
    const change = await screen.findByRole("dialog", { name: "Change Blood Group" });
    await user.clear(within(change).getByLabelText(/^Name of the field/));
    await user.type(within(change).getByLabelText(/^Name of the field/), "Blood Type");
    await user.click(within(change).getByRole("button", { name: "Keep the change" }));
    await waitFor(() => expect(form.getByText("Blood Type")).toBeInTheDocument());

    await user.click(form.getByRole("button", { name: "Change House Duty" }));
    const gone = await screen.findByRole("dialog", { name: "Change House Duty" });
    await user.click(within(gone).getByRole("button", { name: "Delete" }));
    await user.click(within(gone).getByRole("button", { name: "Delete the field" }));
    await waitFor(() => expect(form.queryByText("House Duty")).not.toBeInTheDocument());
    expect(puts(calls)).toHaveLength(0);

    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const sent = puts(calls)[0].body as UpdateTeacherSettingsInput;
    expect(sent.customFields?.map((f) => [f.label, f.mode])).toEqual([["Blood Type", "required"], ["Hobby", "optional"]]);
    expect(sent.customFields?.[1].key).toMatch(/^c_[a-z0-9]{4,16}$/);
    expect(sent.exportColumns).toBeNull();
  });

  it("does not let a field take the name of a usual detail or of another field", async () => {
    fakeApi({ custom: [PAN] });
    const { user } = openPage();
    const form = await formCard();
    await user.click(form.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    const name = within(dialog).getByLabelText(/^Name of the field/);
    await user.type(name, "Designation");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await within(dialog).findByText("There is already a field called Designation")).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "pan number");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await within(dialog).findByText("Two fields cannot have the same name")).toBeInTheDocument();
  });

  it("a yes / no field is never mandatory", async () => {
    fakeApi({ custom: [HOUSE] });
    openPage();
    const form = await formCard();
    expect(form.queryByRole("switch", { name: "House Duty mandatory" })).not.toBeInTheDocument();
  });

  it("goes back to a new school's details and columns after asking, and sends nothing until Save", async () => {
    const calls = fakeApi({ fields: { email: "required", city: "hidden" }, custom: [PAN] });
    const { user } = openPage();
    const form = await formCard();
    expect(form.getByText("13 asked · 1 mandatory")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    const ask = await screen.findByRole("dialog", { name: "Back to the default?" });
    await user.click(within(ask).getByRole("button", { name: "Use the default" }));
    await waitFor(() => expect(form.getByText("13 asked · 0 mandatory")).toBeInTheDocument());
    expect(puts(calls)).toHaveLength(0);
    // The own field stays, switched off.
    expect(form.getByRole("switch", { name: "PAN Number asked" })).not.toBeChecked();
    expect(save()).toBeEnabled();
  });

  it("when the server refuses, says why and keeps the draft for another try", async () => {
    fakeApi({}, {
      "PUT /staff/teachers/settings": () => new Response(JSON.stringify({ success: false, message: "Validation failed" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = openPage();
    const form = await formCard();
    await user.click(form.getByRole("switch", { name: "Email mandatory" }));
    await user.click(save());
    expect(await screen.findByText(/Validation failed/)).toBeInTheDocument();
    expect(form.getByRole("switch", { name: "Email mandatory" })).toBeChecked();
    expect(save()).toBeEnabled();
  });

  it("asks before leaving with changes not saved; staying keeps them", async () => {
    fakeApi();
    const { router, user } = openPage();
    const form = await formCard();
    await user.click(form.getByRole("switch", { name: "Email mandatory" }));
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/teachers/fields");
    expect(form.getByRole("switch", { name: "Email mandatory" })).toBeChecked();
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
  });
});
