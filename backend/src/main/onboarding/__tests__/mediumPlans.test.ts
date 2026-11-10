import { describe, expect, it } from "vitest";
import { plannedClasses } from "../../academics/constants";
import { step2Schema } from "../schemas/onboarding.schemas";

/**
 * Onboarding step 2 (Academic year): under each board, every medium it is taught in says which classes it runs (with their sections and seats) and its
 * timing. So what the school needs from day one is known before approval, and nothing inside starts empty.
 */

const period = (start: string, end: string) => ({ kind: "period", label: "", start, end });
const DAY = [period("08:00", "08:40"), period("08:40", "09:20"), { kind: "lunch", label: "Lunch", start: "09:20", end: "09:50" }, period("09:50", "10:30")];
const WEEK = { days: [1, 2, 3, 4, 5, 6], usual: DAY, saturday: null };

const rows = (lowest: string, highest: string, streams: string[] = []) =>
  plannedClasses(lowest as never, highest as never, streams).map((c) => ({ name: c.name, sections: 2, seats: 40 }));

const plan = (medium: string, lowest = "1", highest = "5", over: object = {}) => ({ medium, lowestClass: lowest, highestClass: highest, seniorStreams: [], classes: rows(lowest, highest), week: WEEK, ...over });

const base = {
  boards: [{ board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: ["English"], plans: [plan("English")] }],
  academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" },
};

const withBoard = (entry: object) => ({ ...base, boards: [{ ...base.boards[0], ...entry }] });

function problems(body: unknown): Record<string, string> {
  const result = step2Schema.safeParse(body);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("plannedClasses: what a range of classes makes", () => {
  it("names each level as a class", () => {
    expect(plannedClasses("LKG", "2").map((c) => c.name)).toEqual(["LKG", "UKG", "Class 1", "Class 2"]);
  });

  it("makes a class per stream in 11 and 12, and leaves the rest alone", () => {
    expect(plannedClasses("10", "12", ["Science", "Arts"]).map((c) => c.name)).toEqual(["Class 10", "Class 11 Science", "Class 11 Arts", "Class 12 Science", "Class 12 Arts"]);
  });

  it("has nothing to make from a range that runs backwards", () => {
    expect(plannedClasses("10", "5")).toEqual([]);
  });
});

describe("step 2: each medium's plan", () => {
  it("accepts a full plan", () => {
    expect(problems(base)).toEqual({});
  });

  it("asks for a plan for every medium of a board", () => {
    expect(problems(withBoard({ mediums: ["English", "Hindi"] }))).toEqual({ "boards.0.plans": "Fill in the classes and timing of every medium" });
    expect(problems(withBoard({ plans: [] }))).toEqual({ "boards.0.plans": "Fill in the classes and timing of every medium" });
  });

  it("keeps two mediums of one board apart, each with its own classes and timing", () => {
    const afternoon = { ...WEEK, usual: [period("12:00", "12:40"), period("12:40", "13:20")] };
    const parsed = step2Schema.parse(withBoard({ mediums: ["English", "Hindi"], plans: [plan("English", "1", "7"), plan("Hindi", "Nursery", "12", { week: afternoon })] }));
    expect(parsed.boards[0].plans.map((p) => [p.medium, p.lowestClass, p.highestClass])).toEqual([
      ["English", "1", "7"],
      ["Hindi", "Nursery", "12"],
    ]);
    expect(parsed.boards[0].plans[1].week.usual[0]).toMatchObject({ kind: "period", start: 720, end: 760 });
  });

  it("the school's first and last class come from its mediums", () => {
    const parsed = step2Schema.parse(withBoard({ mediums: ["English", "Hindi"], plans: [plan("English", "1", "7"), plan("Hindi", "Nursery", "12")] }));
    expect([parsed.lowestClass, parsed.highestClass]).toEqual(["Nursery", "12"]);
  });

  it("says when the last class is below the first", () => {
    expect(problems(withBoard({ plans: [plan("English", "10", "5", { classes: [] })] }))).toMatchObject({ "boards.0.plans.0.highestClass": "The last class cannot be lower than the first class" });
  });

  it("needs a row of sections and seats for exactly the classes of the range", () => {
    expect(problems(withBoard({ plans: [plan("English", "1", "5", { classes: rows("1", "4") })] }))).toEqual({ "boards.0.plans.0.classes": "Fill in the sections and seats of every class" });
  });

  it("checks the numbers of a class", () => {
    const bad = rows("1", "2");
    bad[0] = { ...bad[0], sections: 27 };
    bad[1] = { ...bad[1], seats: 0 };
    expect(problems(withBoard({ plans: [plan("English", "1", "2", { classes: bad })] }))).toEqual({
      "boards.0.plans.0.classes.0.sections": "A class can start with up to 26 sections",
      "boards.0.plans.0.classes.1.seats": "Enter the seats",
    });
  });

  it("a class can have no sections at all", () => {
    expect(problems(withBoard({ plans: [plan("English", "1", "1", { classes: [{ name: "Class 1", sections: 0, seats: 30 }] })] }))).toEqual({});
  });

  it("makes the streams classes of 11 and 12, and needs their rows", () => {
    const streams = ["Science", "Commerce"];
    expect(problems(withBoard({ plans: [plan("English", "11", "12", { seniorStreams: streams, classes: rows("11", "12", streams) })] }))).toEqual({});
    expect(problems(withBoard({ plans: [plan("English", "11", "12", { seniorStreams: streams, classes: rows("11", "12") })] }))).toEqual({ "boards.0.plans.0.classes": "Fill in the sections and seats of every class" });
  });

  it("forgets streams for a medium that stops before Class 11", () => {
    const parsed = step2Schema.parse(withBoard({ plans: [plan("English", "1", "5", { seniorStreams: ["Science"] })] }));
    expect(parsed.boards[0].plans[0].seniorStreams).toEqual([]);
  });

  it("needs at least one school day", () => {
    expect(problems(withBoard({ plans: [plan("English", "1", "5", { week: { ...WEEK, days: [] } })] }))).toEqual({ "boards.0.plans.0.week.days": "Choose the days school is open" });
  });

  it("says when a day's timing does not make sense", () => {
    expect(problems(withBoard({ plans: [plan("English", "1", "5", { week: { ...WEEK, usual: [] } })] }))).toEqual({ "boards.0.plans.0.week.usual": "Add at least one period" });
  });

  it("checks Saturday's own timing, and forgets it when Saturday is not a school day", () => {
    const halfDay = [period("08:00", "08:40")];
    expect(step2Schema.parse(withBoard({ plans: [plan("English", "1", "5", { week: { ...WEEK, saturday: halfDay } })] })).boards[0].plans[0].week.saturday).toHaveLength(1);
    expect(problems(withBoard({ plans: [plan("English", "1", "5", { week: { ...WEEK, saturday: [{ kind: "lunch", label: "Lunch", start: "08:00", end: "08:30" }] } })] }))).toEqual({ "boards.0.plans.0.week.saturday": "Add at least one period" });
    expect(step2Schema.parse(withBoard({ plans: [plan("English", "1", "5", { week: { days: [1, 2, 3, 4, 5], usual: DAY, saturday: halfDay } })] })).boards[0].plans[0].week.saturday).toBeNull();
  });

  it("refuses a plan for a medium the board does not list, and the same medium twice", () => {
    expect(problems(withBoard({ plans: [plan("Hindi")] }))).toEqual({ "boards.0.plans": "Fill in the classes and timing of every medium" });
    expect(problems(withBoard({ mediums: ["English", "Hindi"], plans: [plan("English"), plan("English")] }))).toEqual({ "boards.0.plans": "Fill in the classes and timing of every medium" });
  });
});

describe("step 2: how many sections and seats", () => {
  const one = (sections: number, seats: number) => withBoard({ plans: [plan("English", "1", "1", { classes: [{ name: "Class 1", sections, seats }] })] });

  it("takes up to 26 sections, one for each letter A to Z", () => {
    expect(problems(one(26, 70))).toEqual({});
    expect(problems(one(27, 40))).toEqual({ "boards.0.plans.0.classes.0.sections": "A class can start with up to 26 sections" });
  });

  it("a class holds up to 2000 seats in all, as it does when the school edits it later", () => {
    expect(problems(one(10, 200))).toEqual({});
    expect(problems(one(11, 200))).toEqual({ "boards.0.plans.0.classes.0.seats": "A class holds up to 2000 seats in all" });
  });

  it("a section holds up to 200 seats", () => {
    expect(problems(one(2, 200))).toEqual({});
    expect(problems(one(2, 201))).toEqual({ "boards.0.plans.0.classes.0.seats": "Up to 200 seats in a section" });
  });

  it("without sections the seats are the whole class's, up to 2000", () => {
    expect(problems(one(0, 2000))).toEqual({});
    expect(problems(one(0, 2001))).toEqual({ "boards.0.plans.0.classes.0.seats": "Up to 2000 seats" });
  });
});

describe("step 2: the streams of Class 11 and 12", () => {
  const withStreams = (streams: unknown[]) => withBoard({ plans: [plan("English", "11", "12", { seniorStreams: streams, classes: rows("11", "12", streams as string[]) })] });
  const streamsOf = (streams: unknown[]) => step2Schema.parse(withStreams(streams)).boards[0].plans[0].seniorStreams;

  it("offers Maths along with Science, Commerce and Arts", () => {
    expect(plannedClasses("11", "11", ["Maths"]).map((c) => c.name)).toEqual(["Class 11 Maths"]);
    expect(problems(withStreams(["Maths", "Science"]))).toEqual({});
  });

  it("takes a stream the school names itself, as a class of its own", () => {
    expect(plannedClasses("12", "12", ["Computer Science"]).map((c) => c.name)).toEqual(["Class 12 Computer Science"]);
    expect(problems(withStreams(["Science", "Computer Science", "Agriculture"]))).toEqual({});
  });

  it("keeps the streams in the order they were given", () => {
    expect(streamsOf(["Arts", "Agriculture", "Science"])).toEqual(["Arts", "Agriculture", "Science"]);
  });

  it("tidies a name: trimmed, one space between words", () => {
    // The rows were made from the tidy names, as the form does.
    const plan11 = plan("English", "11", "12", { seniorStreams: ["  Computer    Science "], classes: rows("11", "12", ["Computer Science"]) });
    expect(step2Schema.parse(withBoard({ plans: [plan11] })).boards[0].plans[0].seniorStreams).toEqual(["Computer Science"]);
  });

  it("counts science and SCIENCE as one stream", () => {
    const plan11 = plan("English", "11", "12", { seniorStreams: ["Science", "science", " SCIENCE "], classes: rows("11", "12", ["Science"]) });
    expect(step2Schema.parse(withBoard({ plans: [plan11] })).boards[0].plans[0].seniorStreams).toEqual(["Science"]);
  });

  it("refuses a name that is too short, too long or has odd characters", () => {
    const path = "boards.0.plans.0.seniorStreams.0";
    expect(Object.keys(problems(withStreams(["A"])))).toContain(path);
    expect(Object.keys(problems(withStreams(["x".repeat(31)])))).toContain(path);
    expect(Object.keys(problems(withStreams(["<script>"])))).toContain(path);
    expect(Object.keys(problems(withStreams(["Maths; DROP"])))).toContain(path);
  });

  it("takes up to 8 streams", () => {
    const eight = ["Science", "Commerce", "Arts", "Maths", "Biology", "Agriculture", "Vocational", "Sports"];
    expect(problems(withStreams(eight))).toEqual({});
    expect(Object.keys(problems(withStreams([...eight, "Music"])))).toContain("boards.0.plans.0.seniorStreams");
  });

  it("needs a row for each class a stream makes, custom ones too", () => {
    expect(problems(withBoard({ plans: [plan("English", "11", "12", { seniorStreams: ["Agriculture"], classes: rows("11", "12") })] }))).toEqual({ "boards.0.plans.0.classes": "Fill in the sections and seats of every class" });
  });
});
