import { describe, expect, it } from "vitest";
import type { AuthUser, UserRole } from "../../../types";
import { NAV_ITEMS, SUBMENUS, activeNavItem, cameFrom, navVisible, pageTitleOf, pathForMenu } from "../nav-config";

/** A person of the given kind; `permissions` omitted means the usual list of the kind (what the school has not changed). */
const person = (role: UserRole, permissions?: string[]): AuthUser => ({ id: "u1", name: "A", email: null, username: null, role, tenantId: "t1", emailVerifiedAt: null, ...(permissions ? { permissions } : {}) });
const menuOf = (user: AuthUser) => NAV_ITEMS.filter((i) => navVisible(i, user));
const labelsOf = (user: AuthUser) => menuOf(user).map((i) => i.label);

describe("the menu of the people who run a school", () => {
  const forAdmin = menuOf(person("school_admin"));

  it("has Classes and, under it, Students (2026-11-04: they were the two tabs of School Class), then Teacher, outside Manage school", () => {
    expect(forAdmin.filter((i) => i.group === "Overview").map((i) => [i.label, i.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Classes", "/school-class"],
      ["Students", "/school-class/students"],
      ["Teacher", "/teachers"],
      ["Student", "/attendance/students"],
      ["Teacher", "/attendance/teachers"],
      ["Staff", "/attendance/staff"],
      ["Staff", "/staff"],
      ["Permissions", "/permissions"],
      ["Calendar", "/calendar"],
      ["Leave requests", "/leaves"],
    ]);
    expect(NAV_ITEMS.some((i) => i.label === "School Class")).toBe(false);
  });

  it("gives teachers the Calendar and the leave requests, parents the Calendar (2026-11-04), and nothing of the school's setup, until the school says otherwise", () => {
    expect(labelsOf(person("teacher"))).toEqual(["Dashboard", "Calendar", "Leave requests"]);
    expect(labelsOf(person("parent"))).toEqual(["Dashboard", "Calendar"]);
  });

  it("gives the staff who work for the school without teaching (2026-11-07) the Dashboard and the Calendar, and nothing of the school's setup; Staff and Permissions are for the people who run the school", () => {
    for (const role of ["receptionist", "management", "staff"] as const) {
      expect(labelsOf(person(role))).toEqual(["Dashboard", "Calendar"]);
    }
    expect(NAV_ITEMS.find((i) => i.href === "/staff")?.roles).toEqual(["school_admin", "principal"]);
    expect(NAV_ITEMS.find((i) => i.href === "/permissions")?.roles).toEqual(["school_admin"]);
    expect(labelsOf(person("principal"))).not.toContain("Permissions");
  });

  it("the menu follows what the school allowed (Permissions, 2026-11-10): a receptionist with these boxes ticked sees exactly these pages", () => {
    const reception = person("receptionist", ["calendar.view", "students.view", "students.add", "attendance.view", "attendance.mark", "leaves.view"]);
    expect(menuOf(reception).map((i) => [i.submenu ?? "", i.label, i.href])).toEqual([
      ["", "Dashboard", "/dashboard"],
      ["", "Students", "/school/students"],
      ["Attendance", "Student", "/attendance/students"],
      ["", "Calendar", "/calendar"],
      ["", "Leave requests", "/leaves"],
    ]);
    // Teachers' attendance is its own permission; the platform's pages and the school's set-up are never given by a box.
    expect(labelsOf(person("receptionist", ["attendance.teachers"]))).toEqual(["Dashboard", "Teacher"]);
    expect(labelsOf(person("receptionist", ["students.view", "attendance.view"]))).not.toContain("Manage Students");
    expect(labelsOf(person("receptionist", ["students.view"]))).not.toContain("Permissions");
    // Nothing ticked: the dashboard (their own home) only. The school admin never needs a box.
    expect(labelsOf(person("receptionist", []))).toEqual(["Dashboard"]);
    expect(labelsOf(person("school_admin", []))).toContain("Permissions");
    // The platform team sees the platform's pages only, whatever list a session carries.
    expect(labelsOf(person("super_admin", ["students.view"]))).toEqual(["Dashboard", "Schools"]);
  });

  it("the school's set-up pages follow their own keys: Manage school holds exactly what a person was allowed, and never the admin-only pages", () => {
    const keys = ["teachers.view", "staff.view", "classes.view", "classes.manage", "years.manage", "promotion.manage", "timetable.edit", "exams.manage"];
    expect(labelsOf(person("receptionist", keys))).toEqual([
      "Dashboard",
      "Classes",
      "Teacher",
      "Staff",
      "Classes & Sections",
      "Academic years",
      "Promotion",
      "School timings",
      "Class timetables",
      "Test & Exam",
    ]);
    // One key, one page: Teacher without Staff, Classes without Classes & Sections.
    expect(labelsOf(person("receptionist", ["teachers.view"]))).toEqual(["Dashboard", "Teacher"]);
    expect(labelsOf(person("receptionist", ["classes.view"]))).toEqual(["Dashboard", "Classes"]);
    expect(labelsOf(person("receptionist", ["timetable.edit"]))).toEqual(["Dashboard", "School timings", "Class timetables"]);
    // Never given by a box: Manage Students, Manage Teacher (the twins of Students and Teacher), Permissions.
    for (const label of ["Manage Students", "Manage Teacher", "Permissions"]) expect(labelsOf(person("receptionist", [...keys, "students.view"]))).not.toContain(label);
    // A teacher (own classes) and a parent are not given the school's pages by these keys.
    expect(labelsOf(person("teacher", [...keys, "calendar.view"]))).toEqual(["Dashboard", "Calendar"]);
    expect(labelsOf(person("parent", keys))).toEqual(["Dashboard"]);
  });

  it("a parent's Calendar and a teacher's pages go when the school takes the boxes away", () => {
    expect(labelsOf(person("parent", []))).toEqual(["Dashboard"]);
    expect(labelsOf(person("teacher", ["calendar.view"]))).toEqual(["Dashboard", "Calendar"]);
  });

  it("calls the teachers' page under Manage school Manage Teacher, and the students' page Manage Students (so no two entries are both Students)", () => {
    const manage = forAdmin.filter((i) => i.group === "Manage school").map((i) => i.label);
    expect(manage).toContain("Manage Teacher");
    expect(manage).not.toContain("Teachers");
    expect(NAV_ITEMS.find((i) => i.label === "Manage Teacher")?.href).toBe("/school/teachers");
    expect(manage).toContain("Manage Students");
    expect(manage).not.toContain("Students");
    expect(NAV_ITEMS.find((i) => i.label === "Manage Students")?.href).toBe("/school/students");
    // No two entries at one level share a name; under Attendance the row itself says which Teacher and Staff these are.
    const labels = forAdmin.map((i) => `${i.submenu ?? ""}/${i.label}`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has Test & Exam under Manage school for the people who run the school only (2026-11-06), lit up on an exam's own page too", () => {
    const item = NAV_ITEMS.find((i) => i.label === "Test & Exam");
    expect(item).toMatchObject({ href: "/school/exams", group: "Manage school" });
    expect(item?.roles).toEqual(["school_admin", "principal"]);
    expect(activeNavItem("/school/exams")?.label).toBe("Test & Exam");
    expect(activeNavItem("/school/exams/e1")?.label).toBe("Test & Exam");
  });

  it("has Attendance right under Teacher, as one row that opens Student, Teacher and Staff (2026-11-10), for the people who run the school only; teachers mark themselves on their home", () => {
    const pages = NAV_ITEMS.filter((i) => i.submenu === "Attendance");
    expect(pages.map((i) => [i.label, i.href, i.title])).toEqual([
      ["Student", "/attendance/students", "Student attendance"],
      ["Teacher", "/attendance/teachers", "Teacher attendance"],
      ["Staff", "/attendance/staff", "Staff attendance"],
    ]);
    for (const page of pages) {
      expect(page.group).toBe("Overview");
      expect(page.roles).toEqual(["school_admin", "principal"]);
    }
    expect(SUBMENUS.Attendance).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Attendance")).toBe(false);
    const overview = NAV_ITEMS.filter((i) => i.group === "Overview").map((i) => i.href);
    expect(overview.indexOf("/attendance/students")).toBe(overview.indexOf("/teachers") + 1);
    expect(activeNavItem("/attendance/teachers")?.href).toBe("/attendance/teachers");
    expect(activeNavItem("/teachers")?.href).toBe("/teachers");
    expect(activeNavItem("/staff")?.href).toBe("/staff");
  });

  it("the top bar says which attendance it is: a page's own title when it has one, else its menu label", () => {
    expect(pageTitleOf(activeNavItem("/attendance/teachers"))).toBe("Teacher attendance");
    expect(pageTitleOf(activeNavItem("/teachers"))).toBe("Teacher");
    expect(pageTitleOf(undefined)).toBe("Dashboard");
  });

  it("lights up the entry of the page: a teacher opened from Teacher, or from Manage Teacher", () => {
    expect(activeNavItem("/teachers")?.label).toBe("Teacher");
    expect(activeNavItem("/teachers/t1/edit")?.label).toBe("Teacher");
    expect(activeNavItem("/school/teachers/t1")?.label).toBe("Manage Teacher");
    expect(activeNavItem("/school/teachers/new")?.label).toBe("Manage Teacher");
  });

  it("has School timings and Class timetables as the two pages nested under one Timetable row of Manage school (2026-11-10), and the timetable's other pages light Class timetables", () => {
    const manage = NAV_ITEMS.filter((i) => i.roles.includes("school_admin") && i.group === "Manage school");
    expect(manage.filter((i) => /timing|timetable/i.test(i.label)).map((i) => [i.label, i.href])).toEqual([
      ["School timings", "/school/timings"],
      ["Class timetables", "/school/timetable"],
    ]);
    // Timetable is a row that opens them (a submenu), not a page of its own.
    expect(manage.filter((i) => /timing|timetable/i.test(i.label)).map((i) => i.submenu)).toEqual(["Timetable", "Timetable"]);
    expect(SUBMENUS.Timetable).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Timetable")).toBe(false);
    expect(activeNavItem("/school/timings")?.label).toBe("School timings");
    expect(activeNavItem("/school/timetable")?.label).toBe("Class timetables");
    expect(activeNavItem("/school/timetable/subjects")?.label).toBe("Class timetables");
    expect(activeNavItem("/school/timetable/teacher/t1")?.label).toBe("Class timetables");
  });

  it("lights up Classes for the classes and one class's pages, Students only for the students list, and Manage Students for the student pages", () => {
    expect(activeNavItem("/school-class")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5/timetable")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/students", forAdmin)?.label).toBe("Students");
    expect(activeNavItem("/school/students", forAdmin)?.label).toBe("Manage Students");
    expect(activeNavItem("/school/students/new", forAdmin)?.label).toBe("Manage Students");
    // A person the school allowed to see students has one Students entry, on the list's own address.
    expect(activeNavItem("/school/students/new", menuOf(person("receptionist", ["students.view"])))?.label).toBe("Students");
  });
});

describe("a page opened from another menu entry keeps that entry lit", () => {
  it("is the page the person came from, when the link says so (Add student from Students stays under Students, not Manage Students)", () => {
    const where = { pathname: "/school/students/new", state: cameFrom("/school-class/students", "Students") };
    expect(pathForMenu(where)).toBe("/school-class/students");
    expect(activeNavItem(pathForMenu(where))?.label).toBe("Students");
  });

  it("works for a class's own page too, which is lit under Classes", () => {
    const where = { pathname: "/school/students/new", state: cameFrom("/school-class/c5", "Class 5") };
    expect(activeNavItem(pathForMenu(where))?.label).toBe("Classes");
  });

  it("is the page's own address when nobody said where they came from", () => {
    expect(pathForMenu({ pathname: "/school/students/new", state: null })).toBe("/school/students/new");
    expect(activeNavItem(pathForMenu({ pathname: "/school/students/new", state: null }), menuOf(person("school_admin")))?.label).toBe("Manage Students");
  });

  it("ignores anything in the state that is not an address of the app", () => {
    for (const state of [{ cameFrom: "x" }, { cameFrom: { href: 5 } }, { cameFrom: { href: "https://evil.example/" } }, { cameFrom: { href: "//evil.example" } }, "text", 7]) {
      expect(pathForMenu({ pathname: "/school/students/new", state })).toBe("/school/students/new");
    }
  });
});
