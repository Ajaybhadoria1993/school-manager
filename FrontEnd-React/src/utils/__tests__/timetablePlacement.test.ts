import { describe, expect, it } from "vitest";
import { missingPeriods, placementText } from "../timetablePlacement";

/** How many of a subject's periods a week have a lesson in the class's timetable, said in plain words (2026-11-13). */
describe("placementText", () => {
  it("says none of the periods are in the timetable yet", () => {
    expect(placementText(0, 5)).toBe("Not in timetable yet");
  });

  it("says how many are in when some are", () => {
    expect(placementText(3, 5)).toBe("3 of 5 in timetable");
    expect(placementText(1, 6)).toBe("1 of 6 in timetable");
  });

  it("says all of them are in when every period has a lesson (or more lessons than periods)", () => {
    expect(placementText(5, 5)).toBe("All 5 in timetable");
    expect(placementText(7, 5)).toBe("All 5 in timetable");
  });
});

describe("missingPeriods", () => {
  it("adds up the periods that have no lesson yet, never counting a subject that has more than it needs", () => {
    expect(
      missingPeriods([
        { periodsPerWeek: 5, placedPeriods: 0 },
        { periodsPerWeek: 6, placedPeriods: 4 },
        { periodsPerWeek: 3, placedPeriods: 3 },
        { periodsPerWeek: 2, placedPeriods: 9 },
      ])
    ).toBe(7);
  });

  it("is 0 when nothing is missing, or when there is no subject", () => {
    expect(missingPeriods([{ periodsPerWeek: 4, placedPeriods: 4 }])).toBe(0);
    expect(missingPeriods([])).toBe(0);
  });
});
