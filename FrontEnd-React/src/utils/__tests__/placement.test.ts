import { describe, expect, it } from "vitest";
import { MOVABLE_FIELDS, effectivePlacements, isUsualPlacements, type CustomFieldDef, type StepDef } from "../../constants/studentFields";
import { allSteps, keysIn, labelOfPlaced, placeIn, stepName, stepOf } from "../placement";

const HOUSE: CustomFieldDef = { key: "c_house1", label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" };
const BUS: CustomFieldDef = { key: "c_buspass", label: "Bus pass", type: "text", options: [], mode: "optional" };
const HEALTH: StepDef = { key: "s_health1", name: "Health" };
const usual = (custom: CustomFieldDef[] = []) => effectivePlacements(null, custom);

describe("where the details go on Add student", () => {
  it("a school that moved nothing has the details it does not ask shared out over the four steps, and its own fields at the end of More details", () => {
    const list = usual([HOUSE, BUS]);
    expect(list).toHaveLength(MOVABLE_FIELDS.length + 2);
    // The blood group and the Aadhaar number are the only two a new school asks: different steps, so the four steps are about as tall.
    expect(keysIn(list, "personal")).toEqual(["bloodGroup"]);
    expect(keysIn(list, "academic")).toEqual(["srNumber", "pen", "aadhaarNumber"]);
    expect(keysIn(list, "parents")).toEqual(["emergencyMobile", "rteSeat", "bpl"]);
    expect(keysIn(list, "more").slice(0, 3)).toEqual(["religion", "samagraId", "apaarId"]);
    expect([keysIn(list, "personal").length, keysIn(list, "academic").length, keysIn(list, "parents").length, keysIn(list, "more").length - 2]).toEqual([1, 3, 3, 9]);
    expect(keysIn(list, "more").slice(-3)).toEqual(["transportStop", "c_house1", "c_buspass"]);
    expect(isUsualPlacements(list, [HOUSE, BUS])).toBe(true);
  });

  it("a list with a missing detail, an unknown one or a repeat is put right: the missing at the end of its usual step", () => {
    const list = effectivePlacements([{ key: "pen", step: "parents" }, { key: "gone", step: "more" }, { key: "pen", step: "personal" }], []);
    expect(list[0]).toEqual({ key: "pen", step: "parents" });
    expect(list.filter((p) => p.key === "pen")).toHaveLength(1);
    expect(list.some((p) => p.key === "gone")).toBe(false);
    expect(list).toHaveLength(MOVABLE_FIELDS.length);
    expect(stepOf(list, "religion")).toBe("more");
  });

  it("a detail placed in a step the school no longer has goes to More details; one in a step it has stays", () => {
    const list = effectivePlacements([{ key: "pen", step: "s_gone0001" }, { key: "apaarId", step: "s_health1" }], [], [{ key: "more" }, HEALTH]);
    expect(stepOf(list, "pen")).toBe("more");
    expect(stepOf(list, "apaarId")).toBe("s_health1");
  });

  it("names the steps as the stepper does, and a step of the school's own by the name it gave", () => {
    expect(stepName("personal")).toBe("Personal info");
    expect(stepName("academic")).toBe("Academic");
    expect(stepName("parents")).toBe("Parents");
    expect(stepName("more")).toBe("More details");
    expect(stepName("s_health1", [{ key: "more", name: "More details" }, HEALTH])).toBe("Health");
    expect(allSteps([{ key: "more", name: "More details" }, HEALTH]).map((s) => s.name)).toEqual(["Personal info", "Academic", "Parents", "More details", "Health"]);
  });

  it("a detail dropped on a step goes to its end; dropped before another it takes that one's place", () => {
    const list = usual();
    const toAcademic = placeIn(list, "bloodGroup", "academic");
    expect(stepOf(toAcademic, "bloodGroup")).toBe("academic");
    expect(keysIn(toAcademic, "academic")).toEqual(["srNumber", "pen", "aadhaarNumber", "bloodGroup"]);
    expect(keysIn(toAcademic, "personal")).toEqual([]);
    // Before another one of that step.
    const before = placeIn(toAcademic, "aadhaarNumber", "academic", "srNumber");
    expect(keysIn(before, "academic")).toEqual(["aadhaarNumber", "srNumber", "pen", "bloodGroup"]);
    // Within its own step.
    const reordered = placeIn(list, "aadhaarNumber", "academic", "srNumber");
    expect(keysIn(reordered, "academic")).toEqual(["aadhaarNumber", "srNumber", "pen"]);
    // Dropped before itself: nothing moves.
    expect(placeIn(list, "religion", "more", "religion")).toEqual(list);
    // Every detail is still there once.
    expect(reordered).toHaveLength(list.length);
  });

  it("a detail can be dropped on a step of the school's own", () => {
    const moved = placeIn(usual(), "medicalNotes", "s_health1");
    expect(keysIn(moved, "s_health1")).toEqual(["medicalNotes"]);
    expect(keysIn(placeIn(moved, "disability", "s_health1"), "s_health1")).toEqual(["medicalNotes", "disability"]);
  });

  it("a 'before' that is not in the step it is dropped on means the end of that step", () => {
    const list = usual();
    const moved = placeIn(list, "bpl", "personal", "nationality");
    expect(keysIn(moved, "personal").at(-1)).toBe("bpl");
  });

  it("a key that is not placed is left alone", () => {
    const list = usual();
    expect(placeIn(list, "nothing", "academic")).toEqual(list);
    expect(stepOf(list, "nothing")).toBeUndefined();
  });

  it("each detail is named as the form names it, an own field by its own name", () => {
    expect(labelOfPlaced("aadhaarNumber", [])).toBe("Aadhaar number");
    expect(labelOfPlaced("emergencyMobile", [])).toBe("Emergency / WhatsApp number");
    expect(labelOfPlaced("c_house1", [HOUSE])).toBe("House");
  });
});
