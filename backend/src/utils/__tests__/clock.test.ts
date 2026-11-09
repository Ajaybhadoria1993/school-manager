import { afterEach, describe, expect, it, vi } from "vitest";
import { clock, indiaNow, instantAt } from "../clock";

/** The school's clock (2026-11-06): the day and the minute in India, whatever time zone the server keeps, and a seam for tests. */

afterEach(() => vi.restoreAllMocks());

describe("indiaNow", () => {
  it("is the calendar day and the minutes after midnight in India (UTC+5:30)", () => {
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-05T03:30:00.000Z"));
    expect(indiaNow()).toMatchObject({ date: "2026-11-05", minutes: 9 * 60 });
  });

  it("goes over to the next day when it is still the evening in UTC: 19:00 UTC is 00:30 the next day in India", () => {
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-05T19:00:00.000Z"));
    expect(indiaNow()).toMatchObject({ date: "2026-11-06", minutes: 30 });
  });

  it("the last minute of the day and the first", () => {
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-05T18:29:00.000Z"));
    expect(indiaNow()).toMatchObject({ date: "2026-11-05", minutes: 23 * 60 + 59 });
    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-05T18:30:00.000Z"));
    expect(indiaNow()).toMatchObject({ date: "2026-11-06", minutes: 0 });
  });

  it("carries the very moment too", () => {
    const moment = new Date("2026-11-05T03:30:12.000Z");
    vi.spyOn(clock, "now").mockReturnValue(moment);
    expect(indiaNow().at).toEqual(moment);
  });

  it("is the real time when nothing is mocked", () => {
    const before = Date.now();
    const now = indiaNow();
    expect(now.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(now.minutes).toBeGreaterThanOrEqual(0);
    expect(now.minutes).toBeLessThan(1440);
  });
});

describe("instantAt", () => {
  it("is the moment a clock time of an Indian day is: 9:00 on 5 Nov in India is 03:30 UTC", () => {
    expect(instantAt("2026-11-05", 9 * 60).toISOString()).toBe("2026-11-05T03:30:00.000Z");
    expect(instantAt("2026-11-05", 0).toISOString()).toBe("2026-11-04T18:30:00.000Z");
  });
});
