import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { DEFAULT_FIELD_RULES, USUAL_STEPS, effectivePlacements, type StepDef } from "../../../../constants/studentFields";
import { allApiSlices } from "../../../../redux/api/apiRoot";
import store from "../../../../redux/store";
import type { StudentSettings } from "../../../../types";
import { fakeApi } from "../../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../../test/fixtures";
import { draftOf, setAsked, setPlacements, type FieldsDraft } from "../../../../utils/exportLayout";
import { placeIn } from "../../../../utils/placement";
import { AddStudentPreview } from "../AddStudentPreview";

const HEALTH: StepDef = { key: "s_health1", name: "Health" };
const settings = (steps: StepDef[] = [...USUAL_STEPS]): StudentSettings => ({ ...SETTINGS, steps, stepsAreDefault: steps.length === 1, placements: effectivePlacements(null, [], steps) });

function show(draft: FieldsDraft) {
  fakeApi({ "GET /academics/structure": () => STRUCTURE, "GET /students/capacity": () => CAPACITY });
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <AddStudentPreview draft={draft} onClose={onClose} />
    </Provider>
  );
  return { onClose, user: userEvent.setup() };
}
const stepNames = () => within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d/g, "").replace(/done$/, "").trim());

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("the preview of Add student", () => {
  it("is the page: its title, the school's year, and the steps in a stepper; a step with nothing asked in it is not there", async () => {
    show(draftOf(settings()));
    const dialog = await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(within(dialog).getByRole("heading", { name: "Add student" })).toBeInTheDocument();
    expect(await within(dialog).findByText("Academic year 2026-2027")).toBeInTheDocument();
    // A new school asks nothing in More details: the step is not there, as on the page.
    expect(stepNames()).toEqual(["Personal info", "Academic", "Parents"]);
    expect(within(dialog).queryByText(/Nothing is asked in this step/)).not.toBeInTheDocument();
  });

  it("the first step is drawn by the page's own cards: the student, the address and the details placed in Personal info", async () => {
    show(draftOf(settings()));
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(screen.getByRole("heading", { name: "Student" })).toBeInTheDocument();
    for (const label of ["First name", "Last name", "Gender", "Date of birth"]) expect(screen.getByText(label, { selector: "label" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Address" })).toBeInTheDocument();
    expect(screen.getByText("House and street", { selector: "label" })).toBeInTheDocument();
    // The blood group, where a new school has it, in the card of the details placed here (the Aadhaar number is in Academic).
    const other = screen.getByRole("heading", { name: "Other details" }).closest("div[class*='stagger-item']") as HTMLElement;
    expect(within(other).getByText(/^Blood group/, { selector: "label" })).toBeInTheDocument();
    expect(within(other).queryByText(/^Aadhaar number/, { selector: "label" })).not.toBeInTheDocument();
  });

  it("the other steps open from the stepper, each as the page draws it: the classes of the school in Academic, the parent's boxes in the form's order in Parents", async () => {
    const { user } = show(draftOf(settings()));
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    await user.click(within(screen.getByRole("list", { name: "Steps" })).getByRole("button", { name: /Academic/ }));
    expect(await screen.findByRole("radiogroup", { name: "Class" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Class 1/ })).toBeInTheDocument();
    // The details a new school does not ask are not boxes: of what is placed in Academic only the Aadhaar number is asked.
    const other = screen.getByRole("heading", { name: "Other details" }).closest("div[class*='stagger-item']") as HTMLElement;
    expect(within(other).getByText(/^Aadhaar number/, { selector: "label" })).toBeInTheDocument();
    expect(within(other).queryByText(/^PEN/, { selector: "label" })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole("list", { name: "Steps" })).getByRole("button", { name: /Parents/ }));
    const labels = ["Full name", "Relation", "Mobile number", "Another number", "Occupation", "Email"].map((l) => screen.getAllByText(new RegExp(`^${l}`), { selector: "label" })[0]);
    for (let i = 1; i < labels.length; i++) expect(labels[i - 1].compareDocumentPosition(labels[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no side column, like the page", async () => {
    show(draftOf(settings()));
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(screen.queryByText("Form completion")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick tips")).not.toBeInTheDocument();
  });
  it("a step the school adds is a step of its name once something asked is placed in it; More details, with nothing asked in it, is not there", async () => {
    const steps = [{ key: "more", name: "More details" }, HEALTH];
    let draft = draftOf(settings(steps));
    draft = setPlacements(draft, placeIn(draft.placements, "medicalNotes", "s_health1"));
    // Placed but not asked yet: no step.
    show(draft);
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(stepNames()).toEqual(["Personal info", "Academic", "Parents"]);
    cleanup();
    // Asked: the step is there under its name, and More details (nothing asked in it) still is not.
    show(setAsked(draft, { kind: "rule", rule: "medicalNotes" }, true));
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(stepNames()).toEqual(["Personal info", "Academic", "Parents", "Health"]);
  });

  it("More details is a step when something is asked in it, and its box is there", async () => {
    const draft = setAsked(draftOf(settings()), { kind: "rule", rule: "nationality" }, true);
    const { user } = show(draft);
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(stepNames()).toEqual(["Personal info", "Academic", "Parents", "More details"]);
    await user.click(within(screen.getByRole("list", { name: "Steps" })).getByRole("button", { name: /More details/ }));
    expect(await screen.findByText(/^Nationality/, { selector: "label" })).toBeInTheDocument();
  });

  it("the boxes are for looking at (nothing can be typed in them), and the preview closes", async () => {
    const { user, onClose } = show(draftOf(settings()));
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    expect(screen.getByRole("group", { name: "Preview of Personal info" })).toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "Close the preview" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("without the school's classes (none set up yet) the class card is a note, not an error", async () => {
    fakeApi({});
    render(
      <Provider store={store}>
        <AddStudentPreview draft={draftOf(settings())} onClose={vi.fn()} />
      </Provider>
    );
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "Preview of Add student" });
    await user.click(within(screen.getByRole("list", { name: "Steps" })).getByRole("button", { name: /Academic/ }));
    expect(await screen.findByText(/shown here once they are set up/)).toBeInTheDocument();
    expect(DEFAULT_FIELD_RULES.nationality).toBe("hidden");
  });
});
