import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Provider } from "react-redux";
import { DEFAULT_FIELD_RULES, USUAL_STEPS, effectivePlacements, type CustomFieldDef } from "../../../../constants/studentFields";
import { allApiSlices } from "../../../../redux/api/apiRoot";
import store from "../../../../redux/store";
import type { StudentSettings } from "../../../../types";
import { fakeApi } from "../../../../test/fakeApi";
import { CAPACITY, STRUCTURE } from "../../../../test/fixtures";
import { defaultLayout, draftOf, type FieldsDraft } from "../../../../utils/exportLayout";
import { FormFieldsCard } from "../FormFieldsCard";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };

const settings = (own: CustomFieldDef[] = []): StudentSettings => ({
  fields: DEFAULT_FIELD_RULES,
  customFields: own,
  exportColumns: [...defaultLayout(), ...own.map((f) => ({ key: f.key, heading: f.label }))],
  exportIsDefault: own.length === 0,
  placements: effectivePlacements(null, own),
  placementsAreDefault: true,
  steps: [...USUAL_STEPS],
  stepsAreDefault: true,
  updatedAt: null,
});

/** The card with a draft behind it (what the page keeps); `latest` is what the draft holds after the last change. */
function Host({ start, latest }: { start: FieldsDraft; latest: { current: FieldsDraft } }) {
  const [draft, setDraft] = useState(start);
  latest.current = draft;
  return <FormFieldsCard draft={draft} onChange={setDraft} />;
}
function open(own: CustomFieldDef[] = []) {
  const latest = { current: draftOf(settings(own)) };
  render(
    <Provider store={store}>
      <Host start={latest.current} latest={latest} />
    </Provider>
  );
  return { latest, user: userEvent.setup() };
}

beforeEach(() => {
  // The preview reads the school's classes when it opens.
  fakeApi({ "GET /academics/structure": () => STRUCTURE, "GET /students/capacity": () => CAPACITY });
});
afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const block = (step: string) => screen.getByRole("group", { name: `${step} step` });
/** The details of a step that the form shows (the boxes it always has first), by their id. */
const ids = (step: string) => [...(within(block(step)).queryByRole("list", { name: `Details in ${step}` })?.querySelectorAll("li") ?? [])].map((li) => li.getAttribute("data-detail"));
const notAsked = (step: string) => [...within(block(step)).queryAllByRole("list", { name: `Not asked in ${step}` }).flatMap((ul) => [...ul.querySelectorAll("li")])].map((li) => li.getAttribute("data-detail"));
const rowOf = (step: string, id: string) => block(step).querySelector(`li[data-detail="${id}"]`) as HTMLElement;
/** Opens the Move list of a detail and picks a step (the app's dropdown). */
async function moveTo(user: ReturnType<typeof userEvent.setup>, row: HTMLElement, label: string, step: string) {
  await user.click(within(row).getByRole("button", { name: new RegExp(`Move ${label}`) }));
  await user.click(await screen.findByRole("option", { name: step }));
}

describe("the Add student form, as Manage fields shows it", () => {
  it("shows the steps in the form's order, each with the boxes the form has; what is not asked is shared out, so the steps are about as long", () => {
    open();
    expect(screen.getByRole("region", { name: "Add student form" })).toBeInTheDocument();
    expect(ids("Personal info")).toEqual(["firstName", "lastName", "gender", "dateOfBirth", "category", "addressLine1", "addressArea", "addressCity", "addressState", "addressPincode", "bloodGroup"]);
    // The Aadhaar number (asked by a new school, like the blood group) is with the class, so the steps are about as tall as each other.
    expect(ids("Academic")).toEqual(["classId", "rollNumber", "admissionDate", "previousSchoolName", "previousSchoolLastClass", "previousSchoolTcNumber", "previousSchoolTcDate", "aadhaarNumber"]);
    expect(ids("Parents")).toEqual(["guardianName", "guardianRelation", "guardianMobile", "guardianAlternate", "guardianOccupation", "guardianEmail", "secondParent"]);
    expect(ids("More details")).toEqual([]);
    // What a school may ask and does not, under each step, dimmed: a few in every step.
    expect(notAsked("Personal info")).toEqual([]);
    expect(notAsked("Academic")).toEqual(["srNumber", "pen"]);
    expect(notAsked("Parents")).toEqual(["emergencyMobile", "rteSeat", "bpl"]);
    expect(notAsked("More details")).toEqual(["religion", "samagraId", "apaarId", "nationality", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop"]);
    const count = (step: string) => ids(step).length + notAsked(step).length;
    expect([count("Personal info"), count("Academic"), count("Parents"), count("More details")]).toEqual([11, 10, 10, 9]);
    expect(within(block("Personal info")).getByText("First name")).toBeInTheDocument();
  });

  it("says in words what the school cannot change: the boxes the form always asks have no switch", () => {
    open();
    const first = rowOf("Personal info", "firstName");
    expect(within(first).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(first).getByText("Always")).toBeInTheDocument();
    expect(within(rowOf("Academic", "rollNumber")).getByText("Optional")).toBeInTheDocument();
    // The address: always asked and mandatory.
    expect(within(rowOf("Personal info", "addressLine1")).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(rowOf("Personal info", "addressLine1")).getByText("Mandatory")).toBeInTheDocument();
    expect(within(rowOf("Academic", "previousSchoolName")).getByText("Mandatory from Class 1")).toBeInTheDocument();
    // The category is always asked: only its Mandatory is a switch.
    const category = rowOf("Personal info", "category");
    expect(within(category).queryByRole("switch", { name: "Category asked" })).not.toBeInTheDocument();
    expect(within(category).getByRole("switch", { name: "Category mandatory" })).toBeChecked();
    // Both parents: only Mandatory.
    expect(within(rowOf("Parents", "secondParent")).getByRole("switch", { name: /Both parents.* mandatory/ })).toBeChecked();
  });

  it("has an Asked and a Mandatory switch where the school decides, each in the state the school has", () => {
    open();
    const aadhaar = rowOf("Academic", "aadhaarNumber");
    expect(within(aadhaar).getByRole("switch", { name: "Aadhaar number asked" })).toBeChecked();
    expect(within(aadhaar).getByRole("switch", { name: "Aadhaar number mandatory" })).toBeChecked();
    const blood = rowOf("Personal info", "bloodGroup");
    expect(within(blood).getByRole("switch", { name: "Blood group asked" })).toBeChecked();
    expect(within(blood).getByRole("switch", { name: "Blood group mandatory" })).not.toBeChecked();
    const religion = rowOf("More details", "religion");
    expect(within(religion).getByRole("switch", { name: "Religion asked" })).not.toBeChecked();
    // Not asked: nothing to make mandatory.
    expect(within(religion).queryByRole("switch", { name: "Religion mandatory" })).not.toBeInTheDocument();
  });

  it("Mandatory is optional again with one press, for the form and the Excel alike (the column stays)", async () => {
    const { latest, user } = open();
    await user.click(within(rowOf("Academic", "aadhaarNumber")).getByRole("switch", { name: "Aadhaar number mandatory" }));
    expect(latest.current.rules.aadhaarNumber).toBe("optional");
    expect(latest.current.rows.find((r) => r.key === "aadhaarNumber")?.on).toBe(true);
    await user.click(within(rowOf("Personal info", "bloodGroup")).getByRole("switch", { name: "Blood group mandatory" }));
    expect(latest.current.rules.bloodGroup).toBe("required");
  });

  it("a mandatory detail brings its column into the Excel", async () => {
    const { latest, user } = open();
    expect(latest.current.rows.find((r) => r.key === "religion")?.on).toBe(false);
    await user.click(within(rowOf("More details", "religion")).getByRole("switch", { name: "Religion asked" }));
    expect(latest.current.rules.religion).toBe("optional");
    // It now stands among the asked ones of the step, with a Mandatory switch.
    await user.click(within(rowOf("More details", "religion")).getByRole("switch", { name: "Religion mandatory" }));
    expect(latest.current.rules.religion).toBe("required");
    expect(latest.current.rows.find((r) => r.key === "religion")?.on).toBe(true);
  });

  it("asking a detail moves it from 'Not asked' to the step's list; not asking it moves it back and clears Mandatory; the Excel is not touched", async () => {
    const { latest, user } = open();
    await user.click(within(rowOf("More details", "samagraId")).getByRole("switch", { name: "Samagra ID asked" }));
    expect(ids("More details")).toContain("samagraId");
    expect(notAsked("More details")).not.toContain("samagraId");
    expect(latest.current.rows.find((r) => r.key === "samagraId")?.on).toBe(false);
    await user.click(within(rowOf("Academic", "aadhaarNumber")).getByRole("switch", { name: "Aadhaar number asked" }));
    expect(notAsked("Academic")).toContain("aadhaarNumber");
    expect(latest.current.rules.aadhaarNumber).toBe("hidden");
    expect(latest.current.rows.find((r) => r.key === "aadhaarNumber")?.on).toBe(true);
  });

  it("the Move list is the app's dropdown and names only the other steps; picking one sends the detail to the end of it", async () => {
    const { latest, user } = open();
    await user.click(within(rowOf("Academic", "aadhaarNumber")).getByRole("button", { name: /Move Aadhaar number/ }));
    const list = await screen.findByRole("listbox");
    // The steps it can go to: no 'up' or 'down', no step it is already in, nothing that cannot be picked.
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Personal info", "Parents", "More details"]);
    expect(within(list).queryByRole("option", { name: /one place/i })).not.toBeInTheDocument();
    await user.click(within(list).getByRole("option", { name: "Personal info" }));
    expect(ids("Personal info").at(-1)).toBe("aadhaarNumber");
    expect(ids("Academic")).not.toContain("aadhaarNumber");
    expect(latest.current.placements.find((p) => p.key === "aadhaarNumber")?.step).toBe("personal");
  });

  it("only what can move has a Move list: a box the form always has, and a detail fixed in its card, do not", () => {
    open();
    expect(screen.queryByRole("button", { name: /Move First name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Area or landmark/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Admission date/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Move Aadhaar number/ })).toBeInTheDocument();
  });

  it("a detail dragged onto another step goes to its end; dropped on a detail it takes that one's place", () => {
    const { latest } = open();
    const aadhaar = rowOf("Academic", "aadhaarNumber");
    fireEvent.dragStart(aadhaar);
    fireEvent.dragOver(block("Parents"));
    fireEvent.drop(block("Parents"));
    expect(ids("Parents").at(-1)).toBe("aadhaarNumber");
    const blood = rowOf("Personal info", "bloodGroup");
    fireEvent.dragStart(blood);
    fireEvent.drop(rowOf("Parents", "aadhaarNumber"));
    expect(ids("Parents").slice(-2)).toEqual(["bloodGroup", "aadhaarNumber"]);
    expect(latest.current.placements.find((p) => p.key === "bloodGroup")?.step).toBe("parents");
    // A drop that did not start from a detail changes nothing.
    fireEvent.drop(block("Academic"));
    expect(ids("Academic")).toHaveLength(7);
    // A box the form always has is not draggable.
    expect(rowOf("Personal info", "firstName")).not.toHaveAttribute("draggable", "true");
  });

  it("Add your own field asks it in More details, as a column too; it can then be moved, asked or not, changed or deleted", async () => {
    const { latest, user } = open();
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Hostel room");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    const key = latest.current.custom[0].key;
    expect(ids("More details")).toEqual([key]);
    expect(latest.current.rows.find((r) => r.key === key)?.on).toBe(true);
    const row = rowOf("More details", key);
    expect(within(row).getByText("Your own")).toBeInTheDocument();

    await moveTo(user, row, "Hostel room", "Academic");
    expect(ids("Academic").at(-1)).toBe(key);
    await user.click(within(rowOf("Academic", key)).getByRole("switch", { name: "Hostel room mandatory" }));
    expect(latest.current.custom[0].mode).toBe("required");
    await user.click(within(rowOf("Academic", key)).getByRole("switch", { name: "Hostel room asked" }));
    expect(latest.current.custom[0].mode).toBe("hidden");
    expect(notAsked("Academic")).toContain(key);

    await user.click(within(rowOf("Academic", key)).getByRole("button", { name: "Change or delete Hostel room" }));
    const change = await screen.findByRole("dialog", { name: "Change Hostel room" });
    await user.click(within(change).getByRole("button", { name: "Delete" }));
    await user.click(within(change).getByRole("button", { name: "Delete the field" }));
    expect(latest.current.custom).toEqual([]);
    expect(block("Academic").querySelector(`li[data-detail="${key}"]`)).toBeNull();
  });

  it("an own Yes / No field has no Mandatory switch; an own field is asked where the school put it", () => {
    const tick: CustomFieldDef = { key: "c_hostel1", label: "Hostel", type: "yesNo", options: [], mode: "optional" };
    open([HOUSE, tick]);
    expect(ids("More details")).toEqual(["c_house1", "c_hostel1"]);
    expect(within(rowOf("More details", "c_hostel1")).queryByRole("switch", { name: "Hostel mandatory" })).not.toBeInTheDocument();
    expect(within(rowOf("More details", "c_hostel1")).getByRole("switch", { name: "Hostel asked" })).toBeChecked();
    expect(within(rowOf("More details", "c_house1")).getByRole("switch", { name: "House mandatory" })).not.toBeChecked();
  });

  it("the card folds", async () => {
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Hide the form" }));
    expect(screen.getByRole("button", { name: "Show the form" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("the steps a school adds", () => {
  async function addAStep(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole("button", { name: "Add a step" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a step" });
    await user.type(within(dialog).getByLabelText(/^Name of the step/), name);
    await user.click(within(dialog).getByRole("button", { name: "Add the step" }));
  }

  it("Add a step makes a step of the school's own, after More details, empty and ready to take details", async () => {
    const { latest, user } = open();
    await addAStep(user, "Health");
    expect(latest.current.steps.map((s) => s.name)).toEqual(["More details", "Health"]);
    expect(block("Health")).toBeInTheDocument();
    expect(within(block("Health")).getByText(/Nothing is placed in this step/)).toBeInTheDocument();
    // The details can be sent to it from every other step.
    await user.click(within(rowOf("More details", "medicalNotes")).getByRole("button", { name: /Move Medical conditions/ }));
    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Personal info", "Academic", "Parents", "Health"]);
    await user.click(within(list).getByRole("option", { name: "Health" }));
    expect(notAsked("Health")).toEqual(["medicalNotes"]);
    expect(notAsked("More details")).not.toContain("medicalNotes");
  });

  it("the name is checked with the server's words: too short, a built-in step's name, one already used", async () => {
    const { user } = open();
    await addAStep(user, "Health");
    await user.click(screen.getByRole("button", { name: "Add a step" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a step" });
    const box = within(dialog).getByLabelText(/^Name of the step/);
    for (const [typed, message] of [
      ["x", "The name of a step is 2 to 30 characters"],
      ["academic", "There is already a step called Academic"],
      ["HEALTH", "There is already a step called Health"],
    ] as const) {
      await user.clear(box);
      await user.type(box, typed);
      await user.click(within(dialog).getByRole("button", { name: "Add the step" }));
      expect(await within(dialog).findByText(message)).toBeInTheDocument();
    }
  });

  it("a school can have 4 steps of its own: the button is out of reach after that", async () => {
    const { latest, user } = open();
    for (const name of ["Step one", "Step two", "Step three", "Step four"]) await addAStep(user, name);
    expect(latest.current.steps).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Add a step" })).toBeDisabled();
  });

  it("a step is renamed, put earlier or later (More details too), and deleted: its details go to More details", async () => {
    const { latest, user } = open();
    await addAStep(user, "Health");
    await addAStep(user, "Documents");
    await moveTo(user, rowOf("More details", "medicalNotes"), "Medical conditions", "Health");
    expect(notAsked("Health")).toEqual(["medicalNotes"]);

    await user.click(screen.getByRole("button", { name: "Rename Health" }));
    const rename = await screen.findByRole("dialog", { name: "Rename Health" });
    const box = within(rename).getByLabelText(/^Name of the step/);
    await user.clear(box);
    await user.type(box, "Medical");
    await user.click(within(rename).getByRole("button", { name: "Keep the name" }));
    expect(latest.current.steps.map((s) => s.name)).toEqual(["More details", "Medical", "Documents"]);
    expect(block("Medical")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move Documents earlier" }));
    expect(latest.current.steps.map((s) => s.name)).toEqual(["More details", "Documents", "Medical"]);
    await user.click(screen.getByRole("button", { name: "Move More details later" }));
    expect(latest.current.steps.map((s) => s.name)).toEqual(["Documents", "More details", "Medical"]);
    expect(screen.getByRole("button", { name: "Move Documents earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Medical later" })).toBeDisabled();
    // More details cannot be renamed or deleted.
    expect(screen.queryByRole("button", { name: "Rename More details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete More details" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Medical" }));
    const ask = await screen.findByRole("dialog", { name: "Delete Medical?" });
    expect(within(ask).getByText(/Its 1 detail goes to More details/)).toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Delete the step" }));
    expect(latest.current.steps.map((s) => s.name)).toEqual(["Documents", "More details"]);
    expect(notAsked("More details")).toContain("medicalNotes");
    expect(screen.queryByRole("group", { name: "Medical step" })).not.toBeInTheDocument();
  });
});

describe("the preview of Add student", () => {
  it("is a button at the top, not a section of the page: it opens the page as Add student draws it, and closes", async () => {
    const { user } = open();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview of Add student" }));
    const dialog = await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(within(dialog).getByRole("heading", { name: "Add student" })).toBeInTheDocument();
    expect(within(dialog).getByRole("list", { name: "Steps" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close the preview" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
