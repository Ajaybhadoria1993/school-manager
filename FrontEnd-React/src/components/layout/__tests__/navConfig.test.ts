import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavItem } from "../nav-config";

describe("the menu of the people who run a school", () => {
  const forAdmin = NAV_ITEMS.filter((i) => i.roles.includes("school_admin"));

  it("has Classes and, under it, Students (2026-11-04: they were the two tabs of School Class), then Teacher, outside Manage school", () => {
    expect(forAdmin.filter((i) => i.group === "Overview").map((i) => [i.label, i.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Classes", "/school-class"],
      ["Students", "/school-class/students"],
      ["Teacher", "/teachers"],
      ["Attendance", "/attendance"],
      ["Staff", "/staff"],
      ["Calendar", "/calendar"],
      ["Leave requests", "/leaves"],
    ]);
    expect(NAV_ITEMS.some((i) => i.label === "School Class")).toBe(false);
  });

  it("gives teachers the Calendar and the leave requests, parents the Calendar (2026-11-04), and nothing of the school's setup", () => {
    expect(NAV_ITEMS.filter((i) => i.roles.includes("teacher")).map((i) => i.label)).toEqual(["Dashboard", "Calendar", "Leave requests"]);
    expect(NAV_ITEMS.filter((i) => i.roles.includes("parent")).map((i) => i.label)).toEqual(["Dashboard", "Calendar"]);
  });

  it("gives the staff who work for the school without teaching (2026-11-07) the Dashboard and the Calendar, and nothing of the school's setup; Staff is for the people who run the school", () => {
    for (const role of ["receptionist", "management", "staff"] as const) {
      expect(NAV_ITEMS.filter((i) => i.roles.includes(role)).map((i) => i.label)).toEqual(["Dashboard", "Calendar"]);
    }
    expect(NAV_ITEMS.find((i) => i.label === "Staff")?.roles).toEqual(["school_admin", "principal"]);
  });

  it("calls the teachers' page under Manage school Manage Teacher, and the students' page Manage Students (so no two entries are both Students)", () => {
    const manage = forAdmin.filter((i) => i.group === "Manage school").map((i) => i.label);
    expect(manage).toContain("Manage Teacher");
    expect(manage).not.toContain("Teachers");
    expect(NAV_ITEMS.find((i) => i.label === "Manage Teacher")?.href).toBe("/school/teachers");
    expect(manage).toContain("Manage Students");
    expect(manage).not.toContain("Students");
    expect(NAV_ITEMS.find((i) => i.label === "Manage Students")?.href).toBe("/school/students");
    const labels = forAdmin.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has Test & Exam under Manage school for the people who run the school only (2026-11-06), lit up on an exam's own page too", () => {
    const item = NAV_ITEMS.find((i) => i.label === "Test & Exam");
    expect(item).toMatchObject({ href: "/school/exams", group: "Manage school" });
    expect(item?.roles).toEqual(["school_admin", "principal"]);
    expect(activeNavItem("/school/exams")?.label).toBe("Test & Exam");
    expect(activeNavItem("/school/exams/e1")?.label).toBe("Test & Exam");
  });

  it("has Attendance right under Teacher for the people who run the school only (2026-11-06); teachers mark themselves on their home", () => {
    const item = NAV_ITEMS.find((i) => i.label === "Attendance");
    expect(item).toMatchObject({ href: "/attendance", group: "Overview" });
    expect(item?.roles).toEqual(["school_admin", "principal"]);
    const overview = NAV_ITEMS.filter((i) => i.group === "Overview").map((i) => i.label);
    expect(overview.indexOf("Attendance")).toBe(overview.indexOf("Teacher") + 1);
    expect(activeNavItem("/attendance")?.label).toBe("Attendance");
  });

  it("lights up the entry of the page: a teacher opened from Teacher, or from Manage Teacher", () => {
    expect(activeNavItem("/teachers")?.label).toBe("Teacher");
    expect(activeNavItem("/teachers/t1/edit")?.label).toBe("Teacher");
    expect(activeNavItem("/school/teachers/t1")?.label).toBe("Manage Teacher");
    expect(activeNavItem("/school/teachers/new")?.label).toBe("Manage Teacher");
  });

  it("lights up Classes for the classes and one class's pages, Students only for the students list, and Manage Students for the student pages", () => {
    expect(activeNavItem("/school-class")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5/timetable")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/students")?.label).toBe("Students");
    expect(activeNavItem("/school/students")?.label).toBe("Manage Students");
    expect(activeNavItem("/school/students/new")?.label).toBe("Manage Students");
  });
});
