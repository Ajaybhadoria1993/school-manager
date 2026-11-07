import { describe, it, expect } from "vitest";
import { standardHolidayByKey, standardHolidaysBetween } from "../data/standardHolidays";

/**
 * The holidays every school calendar starts with, as on a calendar at home: the Government of India's gazetted holidays (DoPT order
 * "List of Holidays", Annexure-I). The festivals move with the moon, so each year's days are written down from the order; the
 * ones that fall on the same day every year (26 Jan, 15 Aug, 2 Oct, 25 Dec) are known for any year.
 */

const names = (year: number) => standardHolidaysBetween(`${year}-01-01`, `${year}-12-31`).map((h) => [h.day, h.title]);

describe("the standard holidays of a year", () => {
  it("2026 is the Government's list of 17, in date order, with Bakrid on the 28th (the date the Government moved it to)", () => {
    expect(names(2026)).toEqual([
      ["2026-01-26", "Republic Day"],
      ["2026-03-04", "Holi"],
      ["2026-03-21", "Id-ul-Fitr"],
      ["2026-03-26", "Ram Navami"],
      ["2026-03-31", "Mahavir Jayanti"],
      ["2026-04-03", "Good Friday"],
      ["2026-05-01", "Buddha Purnima"],
      ["2026-05-28", "Id-ul-Zuha (Bakrid)"],
      ["2026-06-26", "Muharram"],
      ["2026-08-15", "Independence Day"],
      ["2026-08-26", "Milad-un-Nabi"],
      ["2026-09-04", "Janmashtami"],
      ["2026-10-02", "Gandhi Jayanti"],
      ["2026-10-20", "Dussehra"],
      ["2026-11-08", "Diwali"],
      ["2026-11-24", "Guru Nanak Jayanti"],
      ["2026-12-25", "Christmas"],
    ]);
  });

  it("2027 is the Government's list of 17 too (Independence Day and Milad-un-Nabi are the same Sunday)", () => {
    const list = names(2027);
    expect(list).toHaveLength(17);
    expect(list).toContainEqual(["2027-03-23", "Holi"]);
    expect(list).toContainEqual(["2027-10-29", "Diwali"]);
    expect(list).toContainEqual(["2027-08-15", "Independence Day"]);
    expect(list).toContainEqual(["2027-08-15", "Milad-un-Nabi"]);
  });

  it("a year the Government has not published yet has the days that never move", () => {
    expect(names(2031)).toEqual([
      ["2031-01-26", "Republic Day"],
      ["2031-08-15", "Independence Day"],
      ["2031-10-02", "Gandhi Jayanti"],
      ["2031-12-25", "Christmas"],
    ]);
  });

  it("only Republic Day, Independence Day and Gandhi Jayanti are national (a school cannot take them off)", () => {
    const national = standardHolidaysBetween("2026-01-01", "2027-12-31").filter((h) => h.source === "national");
    expect(new Set(national.map((h) => h.title))).toEqual(new Set(["Republic Day", "Independence Day", "Gandhi Jayanti"]));
    expect(national).toHaveLength(6);
    expect(standardHolidaysBetween("2026-11-08", "2026-11-08")).toEqual([expect.objectContaining({ title: "Diwali", source: "festival" })]);
  });
});

describe("asking for some days", () => {
  it("gives the ones inside them, both ends included, across the turn of a year", () => {
    expect(standardHolidaysBetween("2026-12-25", "2027-01-26").map((h) => h.day)).toEqual(["2026-12-25", "2027-01-26"]);
    expect(standardHolidaysBetween("2026-12-26", "2027-01-25")).toEqual([]);
  });

  it("each has a key of its own, and the key finds it again", () => {
    const all = standardHolidaysBetween("2026-01-01", "2027-12-31");
    expect(new Set(all.map((h) => h.key)).size).toBe(all.length);
    expect(standardHolidayByKey("2026-11-08-diwali")).toMatchObject({ title: "Diwali", day: "2026-11-08", source: "festival" });
    expect(standardHolidayByKey("2031-01-26-republic-day")).toMatchObject({ title: "Republic Day", source: "national" });
    expect(standardHolidayByKey("2026-11-09-diwali")).toBeNull();
    expect(standardHolidayByKey("nonsense")).toBeNull();
  });
});
