import { describe, expect, it } from "vitest";
import { attentionItem, monthName, shareOf, shortRange } from "../dashboard";

/** The words and links of the school's dashboard, kept out of the components so they can be tested one by one. */

describe("what needs attention, in words", () => {
  it("says how many, in the singular and the plural", () => {
    expect(attentionItem("teachers_absent", 1, true).text).toBe("1 teacher is absent today");
    expect(attentionItem("teachers_absent", 3, true).text).toBe("3 teachers are absent today");
    expect(attentionItem("attendance_pending", 1, true).text).toBe("1 class has not taken today's attendance");
    expect(attentionItem("attendance_pending", 2, true).text).toBe("2 classes have not taken today's attendance");
    expect(attentionItem("leave_pending", 1, true).text).toBe("1 leave request is waiting for an answer");
    expect(attentionItem("leave_pending", 4, true).text).toBe("4 leave requests are waiting for an answer");
    expect(attentionItem("no_class_teacher", 1, true).text).toBe("1 class has no class teacher");
    expect(attentionItem("no_class_teacher", 5, true).text).toBe("5 classes have no class teacher");
    expect(attentionItem("full_sections", 1, true).text).toBe("1 section is full");
    expect(attentionItem("full_sections", 2, true).text).toBe("2 sections are full");
  });

  it("leads to the page where it is dealt with", () => {
    expect(attentionItem("teachers_absent", 1, true).to).toBe("/attendance/teachers");
    expect(attentionItem("attendance_pending", 1, true).to).toBe("/attendance/students");
    expect(attentionItem("leave_pending", 1, true).to).toBe("/leaves");
    expect(attentionItem("no_class_teacher", 1, true).to).toBe("/school-class");
    expect(attentionItem("full_sections", 1, true).to).toBe("/school-class");
  });

  it("for a person who does not run the school, only the leaves have a page they can open", () => {
    expect(attentionItem("attendance_pending", 1, false).to).toBeNull();
    expect(attentionItem("no_class_teacher", 1, false).to).toBeNull();
    expect(attentionItem("leave_pending", 1, false).to).toBe("/leaves");
  });

  it("a tone for each, with the absent teachers the loudest", () => {
    expect(attentionItem("teachers_absent", 1, true).tone).toBe("danger");
    expect(attentionItem("attendance_pending", 1, true).tone).toBe("warning");
    expect(attentionItem("leave_pending", 1, true).tone).toBe("info");
  });
});

describe("days and months", () => {
  it("writes one day, or a run of days, short", () => {
    expect(shortRange("2026-11-12", "2026-11-12")).toBe("12 Nov");
    expect(shortRange("2026-11-20", "2026-11-27")).toBe("20 to 27 Nov");
    expect(shortRange("2026-11-30", "2026-12-02")).toBe("30 Nov to 2 Dec");
    expect(shortRange("2026-12-30", "2027-01-02")).toBe("30 Dec to 2 Jan");
  });

  it("names a month by its short and its full name", () => {
    expect(monthName("2026-11")).toEqual({ short: "Nov", full: "November 2026" });
    expect(monthName("2027-01")).toEqual({ short: "Jan", full: "January 2027" });
  });
});

describe("a share", () => {
  it("is a whole percent of the total, and 0 when there is no total", () => {
    expect(shareOf(2, 3)).toBe(67);
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(0, 0)).toBe(0);
  });
});

