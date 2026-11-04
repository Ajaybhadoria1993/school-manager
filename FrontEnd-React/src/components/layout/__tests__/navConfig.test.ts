import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavItem } from "../nav-config";

describe("the menu of the people who run a school", () => {
  const forAdmin = NAV_ITEMS.filter((i) => i.roles.includes("school_admin"));

  it("has Teacher on top, under School Class (outside Manage school), for finding and opening teachers", () => {
    expect(forAdmin.filter((i) => i.group === "Overview").map((i) => [i.label, i.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["School Class", "/school-class"],
      ["Teacher", "/teachers"],
      ["Calendar", "/calendar"],
      ["Leave requests", "/leaves"],
    ]);
  });

  it("gives teachers the Calendar and the leave requests, parents the Calendar (2026-11-04), and nothing of the school's setup", () => {
    expect(NAV_ITEMS.filter((i) => i.roles.includes("teacher")).map((i) => i.label)).toEqual(["Dashboard", "Calendar", "Leave requests"]);
    expect(NAV_ITEMS.filter((i) => i.roles.includes("parent")).map((i) => i.label)).toEqual(["Dashboard", "Calendar"]);
  });

  it("calls the teachers' page under Manage school Manage Teacher", () => {
    const manage = forAdmin.filter((i) => i.group === "Manage school").map((i) => i.label);
    expect(manage).toContain("Manage Teacher");
    expect(manage).not.toContain("Teachers");
    expect(NAV_ITEMS.find((i) => i.label === "Manage Teacher")?.href).toBe("/school/teachers");
  });

  it("lights up the entry of the page: a teacher opened from Teacher, or from Manage Teacher", () => {
    expect(activeNavItem("/teachers")?.label).toBe("Teacher");
    expect(activeNavItem("/teachers/t1/edit")?.label).toBe("Teacher");
    expect(activeNavItem("/school/teachers/t1")?.label).toBe("Manage Teacher");
    expect(activeNavItem("/school/teachers/new")?.label).toBe("Manage Teacher");
  });
});
