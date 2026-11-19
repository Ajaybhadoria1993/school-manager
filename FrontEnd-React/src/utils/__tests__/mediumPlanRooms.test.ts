import { describe, expect, it } from "vitest";
import { classRangeSummary, emptyPlan, ordinalLevel, planErrors, planFacts, planToApi, quickFill, rangeText, roomSequence, setClassRange } from "../mediumPlans";

const plan = (lowest = "Nursery", highest = "2") => setClassRange(emptyPlan("English"), lowest, highest);

describe("room numbers counted up from the first", () => {
  it("counts up a number, a number with a word before it, and keeps a leading zero", () => {
    expect(roomSequence("101", 3)).toEqual(["101", "102", "103"]);
    expect(roomSequence("Room 12", 2)).toEqual(["Room 12", "Room 13"]);
    expect(roomSequence("A-009", 3)).toEqual(["A-009", "A-010", "A-011"]);
  });

  it("has nothing to count from when there is no number at the end", () => {
    expect(roomSequence("Library", 3)).toBeNull();
    expect(roomSequence("", 3)).toBeNull();
    expect(roomSequence("12 B", 3)).toBeNull();
  });
});

describe("Quick Fill: the same settings for every class", () => {
  it("sets the sections and the seats of every class", () => {
    const filled = quickFill(plan(), { sections: 2, seats: 35 });
    expect(filled.classes.every((c) => c.sections === 2 && c.seats === 35)).toBe(true);
    expect(filled.classes).toHaveLength(5);
  });

  it("numbers the rooms one after the other, only for classes that have sections", () => {
    const base = plan("Nursery", "UKG");
    const withNone = { ...base, classes: base.classes.map((c, i) => (i === 1 ? { ...c, sections: 0 } : c)) };
    const filled = quickFill(withNone, { firstRoom: "101" });
    // Nursery 101, LKG has no sections (so no room and no number used), UKG 102.
    expect(filled.classes.map((c) => c.room ?? null)).toEqual(["101", null, "102"]);
  });

  it("changes only what is given: no first room leaves the rooms as they were", () => {
    const typed = { ...plan("Nursery", "LKG") };
    typed.classes = typed.classes.map((c) => ({ ...c, room: "9" }));
    expect(quickFill(typed, { seats: 50 }).classes.map((c) => [c.seats, c.room])).toEqual([[50, "9"], [50, "9"]]);
  });

  it("a room that cannot be counted up (no number at its end) changes no room", () => {
    expect(quickFill(plan("Nursery", "LKG"), { firstRoom: "Library" }).classes.every((c) => !c.room)).toBe(true);
  });
});

describe("how a range is said", () => {
  it("gives 1st, 2nd, 3rd, 4th... and leaves the pre-school names alone", () => {
    expect(["1", "2", "3", "4", "10", "11", "12", "21"].map(ordinalLevel)).toEqual(["1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "21st"]);
    expect(ordinalLevel("Nursery")).toBe("Nursery");
  });

  it("is 'Nursery to 10th', one class alone, or nothing until the range is right", () => {
    expect(rangeText("Nursery", "10")).toBe("Nursery to 10th");
    expect(rangeText("5", "5")).toBe("5th");
    expect(rangeText("", "10")).toBe("");
    expect(rangeText("10", "5")).toBe("");
  });

  it("lists the classes with the numbered ones as a run", () => {
    expect(classRangeSummary("Nursery", "10")).toBe("Nursery, LKG, UKG, Class 1 to 10");
    expect(classRangeSummary("3", "3")).toBe("Class 3");
    expect(classRangeSummary("Pre-Nursery", "LKG")).toBe("Pre-Nursery, Nursery, LKG");
    expect(classRangeSummary("10", "5")).toBe("");
  });
});

describe("the room in a plan", () => {
  it("is sent only when typed, trimmed", () => {
    const base = plan("1", "2");
    const typed = { ...base, classes: [{ ...base.classes[0], room: "  101 " }, { ...base.classes[1], room: "   " }] };
    const sent = planToApi(typed).classes;
    expect(sent[0]).toEqual({ name: "Class 1", sections: 1, seats: 40, room: "101" });
    expect(sent[1]).toEqual({ name: "Class 2", sections: 1, seats: 40 });
  });

  it("is refused when it is longer than 30 letters, naming the box", () => {
    const base = plan("1", "1");
    const long = { ...base, classes: [{ ...base.classes[0], room: "R".repeat(31) }] };
    expect(planErrors(long, "boards.0.plans.0")["boards.0.plans.0.classes.0.room"]).toBe("Keep the room under 30 characters");
  });
});

describe("what the review says about a medium", () => {
  const saved = (over: object = {}) => ({
    medium: "English",
    lowestClass: "Nursery",
    highestClass: "2",
    seniorStreams: [],
    classes: [
      { name: "Nursery", sections: 2, seats: 30, room: "101" },
      { name: "LKG", sections: 0, seats: 35, room: "ignored" },
      { name: "UKG", sections: 1, seats: 40 },
    ],
    week: { days: [1, 2, 3, 4, 5, 6], usual: [{ kind: "period", label: "", start: "08:30", end: "09:10" }, { kind: "period", label: "", start: "09:10", end: "14:20" }], saturday: [{ kind: "period", label: "", start: "08:30", end: "12:00" }] },
    ...over,
  });

  it("adds up the classes, sections and seats (a class with no sections counts its own seats)", () => {
    const facts = planFacts(saved() as never);
    expect(facts).toMatchObject({ range: "Nursery to 2nd", classes: 3, sections: 3, seats: 60 + 35 + 40 });
  });

  it("counts a room only for a class that has sections", () => {
    expect(planFacts(saved() as never).rooms).toBe(1);
  });

  it("says the days and the timing of the usual day, and Saturday's own when it has one", () => {
    const facts = planFacts(saved() as never);
    expect(facts).toMatchObject({ days: "Mon to Sat", timing: "08:30 to 14:20", saturday: "08:30 to 12:00" });
  });

  it("forgets Saturday's own timing when Saturday is not a school day, and lists the streams", () => {
    const facts = planFacts(saved({ week: { days: [1, 2, 3, 4, 5], usual: [], saturday: [{ kind: "period", label: "", start: "08:30", end: "12:00" }] }, seniorStreams: ["Science", "Arts"] }) as never);
    expect(facts.saturday).toBe("");
    expect(facts.timing).toBe("");
    expect(facts.streams).toEqual(["Science", "Arts"]);
  });
});
