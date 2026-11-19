import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_FIELD_RULES, effectivePlacements, type AdmitStepKey, type CustomFieldDef, type FieldRules, type Placement } from "../../../../constants/studentFields";
import { useStudentForm } from "../../../../hooks/useStudentForm";
import { emptyStudentForm } from "../../../../utils/students";
import { placeIn } from "../../../../utils/placement";
import { PlacedFields } from "../PlacedFields";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "required" };
const ROOM: CustomFieldDef = { key: "c_roomno1", label: "Room number", type: "number", options: [], mode: "optional" };
const JOINED: CustomFieldDef = { key: "c_joined1", label: "Joined on", type: "date", options: [], mode: "optional" };
const HOSTEL: CustomFieldDef = { key: "c_hostel1", label: "Hostel", type: "yesNo", options: [], mode: "optional" };
const OFF: CustomFieldDef = { key: "c_unused1", label: "Not asked", type: "text", options: [], mode: "hidden" };

/** A school that asks the given details (the rest as a new school has them). */
const asking = (...keys: (keyof FieldRules)[]): FieldRules => ({ ...DEFAULT_FIELD_RULES, ...Object.fromEntries(keys.map((k) => [k, "optional"])) });

/** One step's card of "other details" with a real form behind it. */
function Step({ step, rules, custom = [], placements, onAddField }: { step: AdmitStepKey; rules: FieldRules; custom?: CustomFieldDef[]; placements?: Placement[]; onAddField?: () => void }) {
  const form = useStudentForm(emptyStudentForm(rules), { mode: "admit", classHasSections: () => false, rules, custom });
  return <PlacedFields form={form} step={step} placements={placements ?? effectivePlacements(null, custom)} onAddField={onAddField} />;
}

const idsInOrder = () => [...document.querySelectorAll<HTMLElement>("[id^='student-']")].map((e) => e.id).filter((id) => !id.endsWith("-label") && !id.endsWith("-error"));

describe("the details placed in a step of Add student", () => {
  it("shows the details the school asks that are placed in this step, in the order they were placed", () => {
    const rules = asking("pen", "srNumber", "bloodGroup", "aadhaarNumber");
    // The Aadhaar number (a new school has it in Academic), the pen and the SR number brought to Personal info, the SR number first.
    const placements = placeIn(placeIn(placeIn(effectivePlacements(null, []), "aadhaarNumber", "personal"), "pen", "personal"), "srNumber", "personal", "bloodGroup");
    render(<Step step="personal" rules={rules} placements={placements} />);
    expect(idsInOrder()).toEqual(["student-srNumber", "student-bloodGroup", "student-aadhaarNumber", "student-pen"]);
  });

  it("does not show a detail the school does not ask, or one placed in another step", () => {
    const rules = asking("pen", "nationality");
    const placements = placeIn(effectivePlacements(null, []), "pen", "academic");
    const { unmount } = render(<Step step="personal" rules={rules} placements={placements} />);
    // The blood group is asked by a new school; the nationality is not asked here and the pen went to Academic.
    expect(idsInOrder()).toEqual(["student-bloodGroup"]);
    unmount();
    render(<Step step="academic" rules={rules} placements={placements} />);
    // The Aadhaar number is asked by a new school, and a new school has it in Academic.
    expect(idsInOrder()).toEqual(["student-aadhaarNumber", "student-pen"]);
  });

  it("is no card at all when nothing the school asks is placed in the step", () => {
    const { container } = render(<Step step="parents" rules={asking("pen")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the card for the step: More details, or Other details", () => {
    const { unmount } = render(<Step step="more" rules={asking("nationality")} />);
    expect(screen.getByRole("heading", { name: "More details" })).toBeInTheDocument();
    unmount();
    render(<Step step="personal" rules={asking("pen")} />);
    expect(screen.getByRole("heading", { name: "Other details" })).toBeInTheDocument();
  });

  it("each detail is its own kind of box: a list, a number, a phone number, a tick", async () => {
    const user = userEvent.setup();
    // The emergency number, the RTE seat and the BPL are with the parents by default: brought here.
    const placements = ["emergencyMobile", "rteSeat", "bpl"].reduce((p, k) => placeIn(p, k, "more"), effectivePlacements(null, []));
    render(<Step step="more" rules={asking("nationality", "emergencyMobile", "disability", "rteSeat", "bpl")} placements={placements} />);
    await user.type(screen.getByLabelText(/^Nationality/), "Indian");
    expect(screen.getByLabelText(/^Nationality/)).toHaveValue("Indian");
    // Digits only.
    await user.type(screen.getByLabelText(/^Emergency/), "98a76-543210");
    expect(screen.getByLabelText(/^Emergency/)).toHaveValue("9876543210");
    expect(screen.getByRole("button", { name: /Disability/ })).toBeInTheDocument();
    // A tick is a switch.
    const rte = screen.getByRole("switch", { name: /RTE seat/ });
    expect(rte).toHaveAttribute("aria-checked", "false");
    await user.click(rte);
    expect(screen.getByRole("switch", { name: /RTE seat/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /BPL family/ })).toBeInTheDocument();
  });

  it("a mandatory detail carries the star and an optional one says so", () => {
    const placements = ["pen", "srNumber"].reduce((p, k) => placeIn(p, k, "personal"), effectivePlacements(null, []));
    render(<Step step="personal" rules={{ ...asking("pen"), srNumber: "required" }} placements={placements} />);
    expect(screen.getByText("SR / Scholar number").parentElement).toHaveTextContent("*");
    expect(screen.getByText("PEN (UDISE+)").parentElement).toHaveTextContent("(optional)");
  });

  it("the school's own fields are boxes of their kind, in the place they were given, and the ones not asked are left out", async () => {
    const user = userEvent.setup();
    const custom = [HOUSE, ROOM, JOINED, HOSTEL, OFF];
    render(<Step step="more" rules={DEFAULT_FIELD_RULES} custom={custom} />);
    expect(screen.getByRole("button", { name: /House/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Room number/), "12");
    expect(screen.getByLabelText(/^Room number/)).toHaveValue("12");
    expect(screen.getByLabelText(/^Joined on/)).toHaveAttribute("type", "date");
    expect(screen.getByRole("switch", { name: /Hostel/ })).toBeInTheDocument();
    expect(screen.queryByText(/Not asked/)).not.toBeInTheDocument();
    expect(screen.getByText("House").parentElement).toHaveTextContent("*");
  });

  it("an own field for Class 11 and 12 only is asked once such a class is picked, and not before or for any other class", async () => {
    const user = userEvent.setup();
    const GROUP: CustomFieldDef = { key: "c_group1", label: "Subject group", type: "text", options: [], mode: "required", classNumbers: [11, 12] };
    const names: Record<string, string> = { lkg: "LKG", five: "Class 5", eleven: "Class 11 Science" };
    function Scoped() {
      const form = useStudentForm(emptyStudentForm(DEFAULT_FIELD_RULES), { mode: "admit", classHasSections: () => false, rules: DEFAULT_FIELD_RULES, custom: [GROUP], classNameOf: (id) => names[id] });
      return (
        <>
          {Object.keys(names).map((id) => (
            <button key={id} type="button" onClick={() => form.set("classId", id)}>
              {names[id]}
            </button>
          ))}
          <p>{form.problems["custom.c_group1"] ?? "no problem"}</p>
          <PlacedFields form={form} step="more" placements={effectivePlacements(null, [GROUP])} />
        </>
      );
    }
    render(<Scoped />);
    // No class yet: not asked, and nothing is missing.
    expect(screen.queryByLabelText(/^Subject group/)).not.toBeInTheDocument();
    expect(screen.getByText("no problem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Class 11 Science" }));
    expect(screen.getByLabelText(/^Subject group/)).toBeInTheDocument();
    expect(screen.getByText("Enter the Subject group")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "LKG" }));
    expect(screen.queryByLabelText(/^Subject group/)).not.toBeInTheDocument();
    expect(screen.getByText("no problem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Class 5" }));
    expect(screen.queryByLabelText(/^Subject group/)).not.toBeInTheDocument();
  });

  it("an own field placed in Academic is asked there and not in More details", () => {
    const placements = placeIn(effectivePlacements(null, [ROOM]), "c_roomno1", "academic");
    const { unmount } = render(<Step step="more" rules={DEFAULT_FIELD_RULES} custom={[ROOM]} placements={placements} />);
    expect(idsInOrder()).toEqual([]);
    unmount();
    render(<Step step="academic" rules={DEFAULT_FIELD_RULES} custom={[ROOM]} placements={placements} />);
    expect(idsInOrder()).toEqual(["student-aadhaarNumber", "student-custom-c_roomno1"]);
  });

  it("the ticks come after the boxes, in one row, whatever their place among them", () => {
    const placements = placeIn(effectivePlacements(null, []), "rteSeat", "more", "nationality");
    render(<Step step="more" rules={asking("nationality", "rteSeat", "transportRoute")} placements={placements} />);
    const ids = idsInOrder();
    expect(ids.indexOf("student-nationality")).toBeLessThan(ids.indexOf("student-transportRoute"));
    const tick = screen.getByRole("switch", { name: /RTE seat/ });
    expect(screen.getByLabelText(/^Transport route/).compareDocumentPosition(tick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the Aadhaar box takes digits only and never more than 12 (a number pasted with its spaces keeps every digit)", async () => {
    const user = userEvent.setup();
    render(<Step step="academic" rules={DEFAULT_FIELD_RULES} />);
    const box = screen.getByLabelText(/^Aadhaar number/) as HTMLInputElement;
    await user.type(box, "2345 6789-0124 99ab");
    expect(box.value).toBe("234567890124");
    await user.clear(box);
    await user.click(box);
    await user.paste("2345 6789 0124");
    expect(box.value).toBe("234567890124");
    await user.clear(box);
    await user.paste("1234567890123456");
    expect(box.value).toBe("123456789012");
  });

  it("the Samagra, APAAR and PEN boxes stop at their own length too", async () => {
    const user = userEvent.setup();
    const rules = asking("samagraId", "apaarId", "pen");
    const { unmount } = render(<Step step="academic" rules={rules} />);
    await user.type(screen.getByLabelText(/^PEN/), "1234567890123");
    expect((screen.getByLabelText(/^PEN/) as HTMLInputElement).value).toBe("12345678901");
    unmount();
    render(<Step step="more" rules={rules} />);
    await user.type(screen.getByLabelText(/^Samagra ID/), "1234567890123");
    await user.type(screen.getByLabelText(/^APAAR ID/), "1234567890123456");
    expect((screen.getByLabelText(/^Samagra ID/) as HTMLInputElement).value).toBe("123456789");
    expect((screen.getByLabelText(/^APAAR ID/) as HTMLInputElement).value).toBe("123456789012");
  });

  it("offers Add your own field when the page gives a way, and not otherwise", async () => {
    const add = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Step step="more" rules={asking("nationality")} onAddField={add} />);
    await user.click(screen.getByRole("button", { name: "Add your own field" }));
    expect(add).toHaveBeenCalledTimes(1);
    unmount();
    render(<Step step="more" rules={asking("nationality")} />);
    expect(screen.queryByRole("button", { name: "Add your own field" })).not.toBeInTheDocument();
  });
});
