import { describe, expect, it } from "vitest";
import { nextYearAfter } from "../academicYear";

describe("the next year, suggested from the running one", () => {
  it("starts the day after the running year ends and runs a year, with the name of those years", () => {
    expect(nextYearAfter({ startDate: "2026-04-01", endDate: "2027-03-31" })).toEqual({ name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31" });
    expect(nextYearAfter({ startDate: "2026-06-15", endDate: "2027-05-14" })).toEqual({ name: "2027-2028", startDate: "2027-05-15", endDate: "2028-05-14" });
  });

  it("a year inside one calendar year gives the next calendar year, named by it", () => {
    expect(nextYearAfter({ startDate: "2026-01-01", endDate: "2026-12-31" })).toEqual({ name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" });
  });

  it("a leap day is handled (the year ends on 28 or 29 February)", () => {
    expect(nextYearAfter({ startDate: "2027-03-01", endDate: "2028-02-29" })).toEqual({ name: "2028-2029", startDate: "2028-03-01", endDate: "2029-02-28" });
  });
});
