import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { fakeApi as pretendApi, type Call, type Handler } from "../../../test/fakeApi";
import TeacherFieldsPage from "../TeacherFields";

/** The school's own fields for its teachers (2026-11-07): the list, kept in a draft until Save (one request for the whole list). */
const PAN: CustomFieldDef = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };
const BLOOD: CustomFieldDef = { key: "c_blood001", label: "Blood Group", type: "choice", options: ["A+", "B+", "O+"], mode: "required" };
const HOUSE: CustomFieldDef = { key: "c_house001", label: "House Duty", type: "yesNo", options: [], mode: "optional" };

function fakeApi(initial: CustomFieldDef[], extra: Record<string, Handler> = {}) {
  let fields = initial;
  return pretendApi({
    "GET /staff/teachers/settings": () => ({ customFields: fields }),
    "PUT /staff/teachers/settings": (body) => {
      fields = (body as { customFields: CustomFieldDef[] }).customFields;
      return { customFields: fields };
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
const names = () => within(screen.getByRole("list", { name: "Your own fields" })).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Teachers: manage the school's own fields", () => {
  it("lists the fields in their order with their kind and whether they are needed; Save waits for a change", async () => {
    fakeApi([BLOOD, PAN, HOUSE]);
    openPage();
    expect(await screen.findByRole("heading", { name: "Teacher fields", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Teacher" })).toHaveAttribute("href", "/school/teachers");
    await waitFor(() => expect(names()).toEqual(["Blood Group", "PAN Number", "House Duty"]));
    const rows = within(screen.getByRole("list", { name: "Your own fields" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("List of 3");
    expect(rows[1]).toHaveTextContent("Text");
    expect(rows[2]).toHaveTextContent("Yes or no");
    expect(screen.getByRole("button", { name: /(^|\s)Blood Group asked$/ })).toHaveTextContent("Needed");
    expect(screen.getByRole("button", { name: /(^|\s)PAN Number asked$/ })).toHaveTextContent("Optional");
    expect(save()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("says so when the school has none yet, with the way to make one", async () => {
    fakeApi([]);
    openPage();
    expect(await screen.findByText("No fields of your own yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add a field" }).length).toBeGreaterThan(0);
  });

  it("opened from Teacher, goes back to Teacher", async () => {
    fakeApi([PAN]);
    openPage("/teachers/fields");
    expect(await screen.findByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
  });

  it("keeps everything in a draft: a new field, a changed one and the order are sent in ONE request when Save is pressed, then a window says so", async () => {
    const calls = fakeApi([BLOOD, PAN]);
    const { user } = openPage();
    await waitFor(() => expect(names()).toEqual(["Blood Group", "PAN Number"]));

    await user.click(screen.getAllByRole("button", { name: "Add a field" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    expect(dialog).toHaveTextContent("As Add teacher and the Excel show it");
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Hobby");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    await waitFor(() => expect(names()).toEqual(["Blood Group", "PAN Number", "Hobby"]));
    expect(puts(calls)).toHaveLength(0);
    expect(save()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Move Hobby up" }));
    expect(names()).toEqual(["Blood Group", "Hobby", "PAN Number"]);
    await user.click(screen.getByRole("button", { name: /(^|\s)Blood Group asked$/ }));
    await user.click(await screen.findByRole("option", { name: "Not asked" }));
    expect(puts(calls)).toHaveLength(0);

    await user.click(save());
    const done = await screen.findByRole("dialog", { name: "Fields saved" });
    expect(done).toHaveTextContent("Your teacher fields are saved.");
    expect(puts(calls)).toHaveLength(1);
    const sent = (puts(calls)[0].body as { customFields: CustomFieldDef[] }).customFields;
    expect(sent.map((f) => [f.label, f.mode])).toEqual([["Blood Group", "hidden"], ["Hobby", "optional"], ["PAN Number", "optional"]]);
    expect(sent[1].key).toMatch(/^c_[a-z0-9]{4,16}$/);
    await user.click(within(done).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(save()).toBeDisabled());
  });

  it("a yes / no field cannot be needed: its list offers Optional and Not asked only", async () => {
    fakeApi([HOUSE]);
    const { user } = openPage();
    await user.click(await screen.findByRole("button", { name: /(^|\s)House Duty asked$/ }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Optional", "Not asked"]);
  });

  it("changes a field's name and choices (its kind stays) and takes one away with the dialog's Delete, in the draft", async () => {
    const calls = fakeApi([BLOOD, PAN]);
    const { user } = openPage();
    await waitFor(() => expect(names()).toEqual(["Blood Group", "PAN Number"]));
    await user.click(screen.getByRole("button", { name: "Change Blood Group" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Blood Group" });
    await user.clear(within(dialog).getByLabelText(/^Name of the field/));
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Blood Type");
    await user.click(within(dialog).getByRole("button", { name: "Keep the change" }));
    await waitFor(() => expect(names()).toEqual(["Blood Type", "PAN Number"]));

    await user.click(screen.getByRole("button", { name: "Change PAN Number" }));
    const second = await screen.findByRole("dialog", { name: "Change PAN Number" });
    await user.click(within(second).getByRole("button", { name: "Delete" }));
    await user.click(within(second).getByRole("button", { name: "Delete the field" }));
    await waitFor(() => expect(names()).toEqual(["Blood Type"]));
    expect(puts(calls)).toHaveLength(0);
    await user.click(save());
    await screen.findByRole("dialog", { name: "Fields saved" });
    expect((puts(calls)[0].body as { customFields: CustomFieldDef[] }).customFields.map((f) => f.key)).toEqual(["c_blood001"]);
  });

  it("does not let a field take the name of a usual detail or of another field", async () => {
    fakeApi([PAN]);
    const { user } = openPage();
    await screen.findByText("PAN Number");
    await user.click(screen.getAllByRole("button", { name: "Add a field" })[0]);
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

  it("Cancel puts the list back as it was saved, and sends nothing", async () => {
    const calls = fakeApi([PAN]);
    const { user } = openPage();
    await screen.findByText("PAN Number");
    await user.click(screen.getByRole("button", { name: "Change PAN Number" }));
    const dialog = await screen.findByRole("dialog", { name: "Change PAN Number" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete the field" }));
    await screen.findByText("No fields of your own yet");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(names()).toEqual(["PAN Number"]));
    expect(puts(calls)).toHaveLength(0);
  });

  it("when the server refuses, a window says why and the draft is kept for another try", async () => {
    fakeApi([PAN], {
      "PUT /staff/teachers/settings": () => new Response(JSON.stringify({ success: false, message: "Up to 20 fields of your own" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = openPage();
    await screen.findByText("PAN Number");
    await user.click(screen.getByRole("button", { name: /(^|\s)PAN Number asked$/ }));
    await user.click(await screen.findByRole("option", { name: "Needed" }));
    await user.click(save());
    const failed = await screen.findByRole("dialog", { name: "Fields not saved" });
    expect(failed).toHaveTextContent("Up to 20 fields of your own");
    await user.click(within(failed).getByRole("button", { name: "OK" }));
    expect(screen.getByRole("button", { name: /(^|\s)PAN Number asked$/ })).toHaveTextContent("Needed");
    expect(save()).toBeEnabled();
  });

  it("asks before leaving with changes not saved; staying keeps them", async () => {
    fakeApi([PAN]);
    const { router, user } = openPage();
    await screen.findByText("PAN Number");
    await user.click(screen.getByRole("button", { name: /(^|\s)PAN Number asked$/ }));
    await user.click(await screen.findByRole("option", { name: "Needed" }));
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/teachers/fields");
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
  });
});
