import { describe, expect, it } from "vitest";
import { divisionPlan, splitEvenly } from "../academics";

describe("sharing a class's students between new sections", () => {
  it("is even, and the first sections take the extra student (the server does the same)", () => {
    expect(splitEvenly(41, 2)).toEqual([21, 20]);
    expect(splitEvenly(40, 2)).toEqual([20, 20]);
    expect(splitEvenly(7, 3)).toEqual([3, 2, 2]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
    expect(splitEvenly(2, 4)).toEqual([1, 1, 0, 0]);
  });

  it("puts the new student in the section with the fewest, and says the least seats each section needs", () => {
    // 40 students, 2 sections: 20 and 20; the newcomer makes one of them 21.
    expect(divisionPlan(40, 2)).toEqual({ sizes: [20, 20], newcomerIn: 0, minSeats: 21 });
    // 41 students: 21 and 20; the newcomer goes to the smaller one (B), which then has 21 as well.
    expect(divisionPlan(41, 2)).toEqual({ sizes: [21, 20], newcomerIn: 1, minSeats: 21 });
    // 7 students, 3 sections: 3, 2, 2; the newcomer goes to B, so no section needs more than 3.
    expect(divisionPlan(7, 3)).toEqual({ sizes: [3, 2, 2], newcomerIn: 1, minSeats: 3 });
  });
});
