import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, generateDay } from "../timings";
import {
  addStream,
  boardFromApi,
  boardToApi,
  classSeats,
  cleanStreamName,
  emptyPlan,
  hasSeniorClasses,
  planErrors,
  planFromApi,
  planSummary,
  planToApi,
  plannedClassNames,
  planTotals,
  removeStream,
  setAllClasses,
  setClassRange,
  setStreams,
  streamProblem,
  syncPlans,
} from "../mediumPlans";
import { SENIOR_STREAMS } from "../../constants/schoolOptions";
import type { BoardEntry, MediumPlanDraft } from "../../types";

const filled = (over: Partial<MediumPlanDraft> = {}): MediumPlanDraft => setClassRange({ ...emptyPlan("English"), ...over }, over.lowestClass ?? "1", over.highestClass ?? "3");

describe("the classes of a range", () => {
  it("names each level", () => {
    expect(plannedClassNames("UKG", "2", [])).toEqual(["UKG", "Class 1", "Class 2"]);
  });

  it("makes a class per stream in 11 and 12", () => {
    expect(plannedClassNames("10", "12", ["Science", "Arts"])).toEqual(["Class 10", "Class 11 Science", "Class 11 Arts", "Class 12 Science", "Class 12 Arts"]);
  });

  it("is empty until both ends are chosen, and for a range that runs backwards", () => {
    expect(plannedClassNames("", "5", [])).toEqual([]);
    expect(plannedClassNames("10", "5", [])).toEqual([]);
  });

  it("knows which ranges reach Class 11", () => {
    expect(hasSeniorClasses("10")).toBe(false);
    expect(hasSeniorClasses("11")).toBe(true);
    expect(hasSeniorClasses("")).toBe(false);
  });
});

describe("a medium's plan", () => {
  it("starts with Monday to Saturday and the usual day", () => {
    expect(emptyPlan("Hindi")).toMatchObject({ medium: "Hindi", lowestClass: "", highestClass: "", seniorStreams: [], classes: [], days: [1, 2, 3, 4, 5, 6], usual: DEFAULT_SETUP, saturday: null });
  });

  it("makes a row for each class of the range, one section of 40 seats to begin with", () => {
    expect(setClassRange(emptyPlan("English"), "1", "2").classes).toEqual([
      { name: "Class 1", sections: 1, seats: 40 },
      { name: "Class 2", sections: 1, seats: 40 },
    ]);
  });

  it("keeps what was typed for a class that stays in the range", () => {
    const plan = setClassRange(emptyPlan("English"), "1", "2");
    const typed = { ...plan, classes: [{ name: "Class 1", sections: 3, seats: 25 }, plan.classes[1]] };
    expect(setClassRange(typed, "1", "3").classes).toEqual([
      { name: "Class 1", sections: 3, seats: 25 },
      { name: "Class 2", sections: 1, seats: 40 },
      { name: "Class 3", sections: 1, seats: 40 },
    ]);
  });

  it("forgets the streams when the range stops before Class 11", () => {
    const plan = setStreams(setClassRange(emptyPlan("English"), "11", "12"), ["Science"]);
    expect(plan.classes.map((c) => c.name)).toEqual(["Class 11 Science", "Class 12 Science"]);
    const shorter = setClassRange(plan, "9", "10");
    expect(shorter.seniorStreams).toEqual([]);
    expect(shorter.classes.map((c) => c.name)).toEqual(["Class 9", "Class 10"]);
  });

  it("gives a new stream's classes their own rows", () => {
    const plan = setClassRange(emptyPlan("English"), "11", "11");
    expect(setStreams(plan, ["Science", "Arts"]).classes.map((c) => c.name)).toEqual(["Class 11 Science", "Class 11 Arts"]);
  });

  it("sets every class at once", () => {
    const plan = setClassRange(emptyPlan("English"), "1", "2");
    expect(setAllClasses(plan, { sections: 2 }).classes.map((c) => [c.sections, c.seats])).toEqual([
      [2, 40],
      [2, 40],
    ]);
    expect(setAllClasses(plan, { seats: 30 }).classes.map((c) => [c.sections, c.seats])).toEqual([
      [1, 30],
      [1, 30],
    ]);
  });
});

describe("the plans of a board follow its mediums", () => {
  it("adds one for a new medium and keeps the others", () => {
    const english = filled();
    const plans = syncPlans([english], ["English", "Hindi"]);
    expect(plans.map((p) => p.medium)).toEqual(["English", "Hindi"]);
    expect(plans[0]).toBe(english);
  });

  it("drops the plan of a medium taken away", () => {
    expect(syncPlans([filled(), emptyPlan("Hindi")], ["Hindi"]).map((p) => p.medium)).toEqual(["Hindi"]);
  });
});

describe("what is wrong with a plan", () => {
  const prefix = "boards.0.plans.1";

  it("nothing when it is filled in", () => {
    expect(planErrors(filled(), prefix)).toEqual({});
  });

  it("asks for both ends of the range", () => {
    expect(planErrors(emptyPlan("English"), prefix)).toMatchObject({ [`${prefix}.lowestClass`]: "Choose the first class.", [`${prefix}.highestClass`]: "Choose the last class." });
  });

  it("says when the last class is below the first", () => {
    expect(planErrors({ ...emptyPlan("English"), lowestClass: "10", highestClass: "5" }, prefix)).toMatchObject({ [`${prefix}.highestClass`]: "The last class cannot be lower than the first class." });
  });

  it("checks the sections and the seats of each class", () => {
    const plan = filled();
    plan.classes[1] = { ...plan.classes[1], sections: 27 };
    plan.classes[2] = { ...plan.classes[2], seats: 0 };
    expect(planErrors(plan, prefix)).toEqual({ [`${prefix}.classes.1.sections`]: "Up to 26", [`${prefix}.classes.2.seats`]: "Enter the seats" });
  });

  it("allows up to 26 sections in a class, one for each letter", () => {
    const plan = filled();
    plan.classes[0] = { ...plan.classes[0], sections: 26, seats: 70 };
    expect(planErrors(plan, prefix)).toEqual({});
  });

  it("a section holds up to 200 seats, and a class up to 2000 in all", () => {
    const plan = filled();
    plan.classes[0] = { ...plan.classes[0], sections: 2, seats: 201 };
    plan.classes[1] = { ...plan.classes[1], sections: 11, seats: 200 };
    plan.classes[2] = { ...plan.classes[2], sections: 10, seats: 200 };
    expect(planErrors(plan, prefix)).toEqual({
      [`${prefix}.classes.0.seats`]: "Up to 200 seats in a section",
      [`${prefix}.classes.1.seats`]: "A class holds up to 2000 seats in all",
    });
  });

  it("a class with no sections holds up to 2000 seats of its own", () => {
    const plan = filled();
    plan.classes[0] = { ...plan.classes[0], sections: 0, seats: 2000 };
    plan.classes[1] = { ...plan.classes[1], sections: 0, seats: 2001 };
    expect(planErrors(plan, prefix)).toEqual({ [`${prefix}.classes.1.seats`]: "Up to 2000 seats" });
  });

  it("asks for at least one school day", () => {
    expect(planErrors(filled({ days: [] }), prefix)).toEqual({ [`${prefix}.week.days`]: "Choose the days school is open." });
  });

  it("says when the usual day does not work", () => {
    expect(planErrors(filled({ usual: { ...DEFAULT_SETUP, periods: 0 } }), prefix)).toEqual({ [`${prefix}.week.usual`]: "Add at least one period" });
    expect(planErrors(filled({ usual: { ...DEFAULT_SETUP, lunchEnd: "10:00" } }), prefix)).toEqual({ [`${prefix}.week.usual`]: "The lunch must end after it starts" });
  });

  it("checks Saturday's own timing only when Saturday is a school day", () => {
    const bad = { ...DEFAULT_SETUP, periods: 0 };
    expect(planErrors(filled({ saturday: bad }), prefix)).toEqual({ [`${prefix}.week.saturday`]: "Add at least one period" });
    expect(planErrors(filled({ saturday: bad, days: [1, 2, 3, 4, 5] }), prefix)).toEqual({});
  });
});

describe("to and from the server", () => {
  it("sends the rows of the day", () => {
    const api = planToApi(filled());
    expect(api.week).toEqual({ days: [1, 2, 3, 4, 5, 6], usual: generateDay(DEFAULT_SETUP).slots, saturday: null });
    expect(api).not.toHaveProperty("usual");
  });

  it("sends Saturday's rows only when it is a school day", () => {
    const halfDay = { ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null };
    expect(planToApi(filled({ saturday: halfDay })).week.saturday).toEqual(generateDay(halfDay).slots);
    expect(planToApi(filled({ saturday: halfDay, days: [1, 2] })).week.saturday).toBeNull();
  });

  it("comes back the way it went", () => {
    const halfDay = { ...DEFAULT_SETUP, periods: 4, lunchStart: null, lunchEnd: null };
    const back = planFromApi(planToApi(filled({ saturday: halfDay })));
    expect(back.usual).toEqual(DEFAULT_SETUP);
    expect(back.saturday).toEqual(halfDay);
    expect(back.classes).toHaveLength(3);
  });

  it("a board saved before plans existed gets one empty plan for each medium", () => {
    const old = { board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English", "Hindi"] } as unknown as BoardEntry;
    expect(boardFromApi(old).plans.map((p) => p.medium)).toEqual(["English", "Hindi"]);
  });

  it("a board goes back with its plans turned into rows", () => {
    const draft = { board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English"], plans: [filled()] };
    expect(boardToApi(draft).plans[0].week.usual).toEqual(generateDay(DEFAULT_SETUP).slots);
  });
});

describe("a plan in one line", () => {
  it("says the classes, the hours and the days", () => {
    expect(planSummary(planToApi(filled()))).toBe("1 to 3 · 08:30 to 14:20 · Mon to Sat");
  });
});

describe("the seats of a class and of the whole plan", () => {
  it("a class with sections holds its sections times their seats, one without holds its own seats", () => {
    expect(classSeats({ name: "Class 1", sections: 3, seats: 40 })).toBe(120);
    expect(classSeats({ name: "Class 1", sections: 0, seats: 35 })).toBe(35);
  });

  it("adds up the classes, the sections and the seats of a plan", () => {
    const plan = filled();
    plan.classes[0] = { ...plan.classes[0], sections: 2, seats: 30 };
    plan.classes[1] = { ...plan.classes[1], sections: 0, seats: 50 };
    plan.classes[2] = { ...plan.classes[2], sections: 3, seats: 40 };
    expect(planTotals(plan)).toEqual({ classes: 3, sections: 5, seats: 230 });
  });
});

describe("the streams of Class 11 and 12", () => {
  const senior = () => setClassRange(emptyPlan("English"), "11", "12");

  it("offers Maths along with Science, Commerce and Arts", () => {
    expect([...SENIOR_STREAMS]).toEqual(["Science", "Commerce", "Arts", "Maths"]);
  });

  it("tidies a name: trimmed, one space between words", () => {
    expect(cleanStreamName("  Computer    Science ")).toBe("Computer Science");
  });

  it("adds a stream the school names itself, as a class of its own in 11 and 12", () => {
    const plan = addStream(senior(), "Agriculture");
    expect(plan.seniorStreams).toEqual(["Agriculture"]);
    expect(plan.classes.map((c) => c.name)).toEqual(["Class 11 Agriculture", "Class 12 Agriculture"]);
  });

  it("keeps the order: the ones already there first", () => {
    const plan = addStream(setStreams(senior(), ["Science", "Arts"]), "Agriculture");
    expect(plan.classes.map((c) => c.name)).toEqual(["Class 11 Science", "Class 11 Arts", "Class 11 Agriculture", "Class 12 Science", "Class 12 Arts", "Class 12 Agriculture"]);
  });

  it("keeps what was typed for the classes that were already there", () => {
    const plan = setStreams(senior(), ["Science"]);
    plan.classes[0] = { ...plan.classes[0], sections: 4, seats: 30 };
    expect(addStream(plan, "Arts").classes[0]).toEqual({ name: "Class 11 Science", sections: 4, seats: 30 });
  });

  it("takes a stream away again, with its classes", () => {
    const plan = removeStream(addStream(setStreams(senior(), ["Science"]), "Agriculture"), "Agriculture");
    expect(plan.seniorStreams).toEqual(["Science"]);
    expect(plan.classes.map((c) => c.name)).toEqual(["Class 11 Science", "Class 12 Science"]);
  });

  it("says what is wrong with a name", () => {
    expect(streamProblem("A", [])).toBe("Name the stream.");
    expect(streamProblem("x".repeat(31), [])).toBe("A stream's name is up to 30 letters.");
    expect(streamProblem("<b>", [])).toBe("Use letters and numbers in a stream's name.");
    expect(streamProblem("Computer Science", [])).toBeNull();
  });

  it("says when it is already there, whatever the case", () => {
    expect(streamProblem("science", ["Science"])).toBe("Science is already there.");
  });

  it("takes up to 8", () => {
    const eight = ["Science", "Commerce", "Arts", "Maths", "Biology", "Agriculture", "Vocational", "Sports"];
    expect(streamProblem("Music", eight)).toBe("A medium can run up to 8 streams.");
    expect(streamProblem("Music", eight.slice(0, 7))).toBeNull();
  });

  it("a name that is not allowed changes nothing", () => {
    const plan = senior();
    expect(addStream(plan, "<b>")).toBe(plan);
    expect(addStream(addStream(plan, "Arts"), "arts").seniorStreams).toEqual(["Arts"]);
  });
});
