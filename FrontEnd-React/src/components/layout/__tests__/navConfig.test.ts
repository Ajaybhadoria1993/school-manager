import { describe, expect, it } from "vitest";
import type { AuthUser, UserRole } from "../../../types";
import { NAV_ITEMS, SUBMENUS, activeNavItem, cameFrom, navVisible, pageTitleOf, pathForMenu } from "../nav-config";

/** A person of the given kind; `permissions` omitted means the usual list of the kind (what the school has not changed). */
const person = (role: UserRole, permissions?: string[]): AuthUser => ({ id: "u1", name: "A", email: null, username: null, role, tenantId: "t1", emailVerifiedAt: null, ...(permissions ? { permissions } : {}) });
const menuOf = (user: AuthUser) => NAV_ITEMS.filter((i) => navVisible(i, user));
const labelsOf = (user: AuthUser) => menuOf(user).map((i) => i.label);

describe("the menu of the people who run a school", () => {
  const forAdmin = menuOf(person("school_admin"));

  it("has Classes, one Students submenu and one Teachers submenu with active and inactive pages", () => {
    expect(forAdmin.filter((i) => i.group === "Overview").map((i) => [i.label, i.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Classes", "/school-class"],
      ["Active students", "/school/students"],
      ["Inactive students", "/school/students/inactive"],
      ["Active teachers", "/teachers"],
      ["Inactive teachers", "/teachers/inactive"],
      ["Student", "/attendance/students"],
      ["Teacher", "/attendance/teachers"],
      ["Staff", "/attendance/staff"],
      ["School timings", "/school/timings"],
      ["Class timetables", "/school/timetable"],
      ["Staff", "/staff"],
      ["Vehicles", "/transport/vehicles"],
      ["Drivers", "/transport/drivers"],
      ["Routes", "/transport/routes"],
      ["Fee structure", "/fees/structure"],
      ["Fee heads", "/fees/heads"],
      ["Concessions", "/fees/concessions"],
      ["Fee rules", "/fees/rules"],
      ["Permissions", "/permissions"],
      ["Calendar", "/calendar"],
      ["Leave requests", "/leaves"],
    ]);
    expect(NAV_ITEMS.some((i) => i.label === "School Class")).toBe(false);
  });

  it("gives teachers the Calendar and the leave requests, parents the Calendar (2026-11-04), and nothing of the school's setup, until the school says otherwise", () => {
    expect(labelsOf(person("teacher"))).toEqual(["Dashboard", "Calendar", "Leave requests", "Settings"]);
    expect(labelsOf(person("parent"))).toEqual(["Dashboard", "Calendar", "Settings"]);
  });

  it("gives the staff who work for the school without teaching (2026-11-07) the Dashboard and the Calendar, and nothing of the school's setup; Staff and Permissions are for the people who run the school", () => {
    for (const role of ["receptionist", "management", "staff"] as const) {
      expect(labelsOf(person(role))).toEqual(["Dashboard", "Calendar", "Settings"]);
    }
    expect(NAV_ITEMS.find((i) => i.href === "/staff")?.roles).toEqual(["school_admin", "principal"]);
    expect(NAV_ITEMS.find((i) => i.href === "/permissions")?.roles).toEqual(["school_admin"]);
    expect(labelsOf(person("principal"))).not.toContain("Permissions");
  });

  it("the menu follows what the school allowed (Permissions, 2026-11-10): a receptionist with these boxes ticked sees exactly these pages", () => {
    const reception = person("receptionist", ["calendar.view", "students.view", "students.add", "attendance.view", "attendance.mark", "leaves.view"]);
    expect(menuOf(reception).map((i) => [i.submenu ?? "", i.label, i.href])).toEqual([
      ["", "Dashboard", "/dashboard"],
      ["Students", "Active students", "/school/students"],
      ["Attendance", "Student", "/attendance/students"],
      ["", "Calendar", "/calendar"],
      ["", "Leave requests", "/leaves"],
      ["", "Settings", "/settings"],
    ]);
    // Teachers' attendance is its own permission; the platform's pages and the school's set-up are never given by a box.
    expect(labelsOf(person("receptionist", ["attendance.teachers"]))).toEqual(["Dashboard", "Teacher", "Settings"]);
    expect(labelsOf(person("receptionist", ["students.view", "attendance.view"]))).not.toContain("Manage Students");
    expect(labelsOf(person("receptionist", ["students.view", "attendance.view"]))).not.toContain("Inactive students");
    expect(menuOf(person("receptionist", ["students.view", "students.status"])).filter((i) => i.submenu === "Students").map((i) => i.label)).toEqual(["Active students", "Inactive students"]);
    expect(labelsOf(person("receptionist", ["students.view"]))).not.toContain("Permissions");
    // Settings are available to everyone; without permissions the dashboard is the only work area.
    expect(labelsOf(person("receptionist", []))).toEqual(["Dashboard", "Settings"]);
    expect(labelsOf(person("school_admin", []))).toContain("Permissions");
    // The platform team sees the platform's pages only, whatever list a session carries.
    expect(labelsOf(person("super_admin", ["students.view"]))).toEqual(["Dashboard", "Schools", "Settings"]);
  });

  it("the school's pages follow their own keys, and never show admin-only pages to delegated staff", () => {
    const keys = ["teachers.view", "staff.view", "classes.view", "classes.manage", "years.manage", "promotion.manage", "timetable.edit", "exams.manage"];
    expect(labelsOf(person("receptionist", keys))).toEqual([
      "Dashboard",
      "Classes",
      "Active teachers",
      "Inactive teachers",
      "School timings",
      "Class timetables",
      "Staff",
      "Academic years",
      "Promotion",
      "Test & Exam",
      "Settings",
    ]);
    // One key, one Teacher row with active/inactive pages; view and setup share the single Classes entry.
    expect(labelsOf(person("receptionist", ["teachers.view"]))).toEqual(["Dashboard", "Active teachers", "Inactive teachers", "Settings"]);
    expect(labelsOf(person("receptionist", ["classes.view"]))).toEqual(["Dashboard", "Classes", "Settings"]);
    expect(labelsOf(person("receptionist", ["timetable.edit"]))).toEqual(["Dashboard", "School timings", "Class timetables", "Settings"]);
    // Permissions is admin-only; the separate Manage Teacher entry has joined Teacher.
    for (const label of ["Manage Students", "Manage Teacher", "Permissions"]) expect(labelsOf(person("receptionist", [...keys, "students.view"]))).not.toContain(label);
    // A teacher (own classes) and a parent are not given the school's pages by these keys.
    expect(labelsOf(person("teacher", [...keys, "calendar.view"]))).toEqual(["Dashboard", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", keys))).toEqual(["Dashboard", "Settings"]);
  });

  it("Transport is one row that opens Vehicles, Drivers and Routes (2026-11-10), for the people allowed transport.view; not for teachers or parents", () => {
    const pages = NAV_ITEMS.filter((i) => i.submenu === "Transport");
    expect(pages.map((i) => [i.label, i.href])).toEqual([
      ["Vehicles", "/transport/vehicles"],
      ["Drivers", "/transport/drivers"],
      ["Routes", "/transport/routes"],
    ]);
    expect(SUBMENUS.Transport).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Transport")).toBe(false);
    expect(labelsOf(person("receptionist", ["transport.view"]))).toEqual(["Dashboard", "Vehicles", "Drivers", "Routes", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Vehicles");
    expect(labelsOf(person("teacher", ["transport.view", "calendar.view"]))).toEqual(["Dashboard", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", ["transport.view"]))).toEqual(["Dashboard", "Settings"]);
    expect(activeNavItem("/transport/routes", menuOf(person("school_admin")))?.label).toBe("Routes");
  });

  it("Fees is one row that opens Fee structure, Fee heads, Concessions and Fee rules (2026-11-12), for the people allowed fees.view; not for teachers or parents", () => {
    const pages = NAV_ITEMS.filter((i) => i.submenu === "Fees");
    expect(pages.map((i) => [i.label, i.href])).toEqual([
      ["Fee structure", "/fees/structure"],
      ["Fee heads", "/fees/heads"],
      ["Concessions", "/fees/concessions"],
      ["Fee rules", "/fees/rules"],
    ]);
    expect(SUBMENUS.Fees).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Fees")).toBe(false);
    expect(labelsOf(person("accountant", ["fees.view"]))).toEqual(["Dashboard", "Fee structure", "Fee heads", "Concessions", "Fee rules", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Fee structure");
    expect(labelsOf(person("teacher", ["fees.view", "calendar.view"]))).toEqual(["Dashboard", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", ["fees.view"]))).toEqual(["Dashboard", "Settings"]);
    expect(activeNavItem("/fees/heads", menuOf(person("school_admin")))?.label).toBe("Fee heads");
  });

  it("a parent's Calendar and a teacher's pages go when the school takes the boxes away", () => {
    expect(labelsOf(person("parent", []))).toEqual(["Dashboard", "Settings"]);
    expect(labelsOf(person("teacher", ["calendar.view"]))).toEqual(["Dashboard", "Calendar", "Settings"]);
  });

  it("keeps active and inactive students and teachers under one sidebar row each", () => {
    const manage = forAdmin.filter((i) => i.group === "Manage school").map((i) => i.label);
    expect(manage).not.toContain("Manage Teacher");
    expect(manage).not.toContain("Manage Students");
    expect(forAdmin.filter((i) => i.submenu === "Students").map((i) => [i.label, i.href])).toEqual([
      ["Active students", "/school/students"],
      ["Inactive students", "/school/students/inactive"],
    ]);
    expect(NAV_ITEMS.some((i) => i.label === "Students")).toBe(false);
    expect(SUBMENUS.Students).toBeDefined();
    expect(forAdmin.filter((i) => i.submenu === "Teachers").map((i) => [i.label, i.href])).toEqual([
      ["Active teachers", "/teachers"],
      ["Inactive teachers", "/teachers/inactive"],
    ]);
    expect(NAV_ITEMS.some((i) => i.label === "Teacher" || i.label === "Manage Teacher")).toBe(false);
    expect(SUBMENUS.Teachers).toBeDefined();
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
    expect(overview.indexOf("/attendance/students")).toBe(overview.indexOf("/teachers/inactive") + 1);
    expect(activeNavItem("/attendance/teachers")?.href).toBe("/attendance/teachers");
    expect(activeNavItem("/teachers")?.href).toBe("/teachers");
    expect(activeNavItem("/staff")?.href).toBe("/staff");
  });

  it("the top bar says which attendance it is: a page's own title when it has one, else its menu label", () => {
    expect(pageTitleOf(activeNavItem("/attendance/teachers"))).toBe("Teacher attendance");
    expect(pageTitleOf(activeNavItem("/teachers"))).toBe("Active teachers");
    expect(pageTitleOf(undefined)).toBe("Dashboard");
  });

  it("lights up the active or inactive teacher child, including old management addresses", () => {
    expect(activeNavItem("/teachers")?.label).toBe("Active teachers");
    expect(activeNavItem("/teachers/t1/edit")?.label).toBe("Active teachers");
    expect(activeNavItem("/teachers/inactive")?.label).toBe("Inactive teachers");
    expect(activeNavItem(pathForMenu({ pathname: "/teachers", search: "?status=inactive", state: null }))?.label).toBe("Inactive teachers");
    expect(activeNavItem("/school/teachers/t1")?.label).toBe("Active teachers");
    expect(activeNavItem("/school/teachers/new")?.label).toBe("Active teachers");
  });

  it("has School timings and Class timetables nested under one Timetable row below Attendance in Overview", () => {
    const overview = NAV_ITEMS.filter((i) => i.roles.includes("school_admin") && i.group === "Overview");
    expect(overview.filter((i) => /timing|timetable/i.test(i.label)).map((i) => [i.label, i.href])).toEqual([
      ["School timings", "/school/timings"],
      ["Class timetables", "/school/timetable"],
    ]);
    // Timetable is a row that opens them (a submenu), not a page of its own.
    expect(overview.filter((i) => /timing|timetable/i.test(i.label)).map((i) => i.submenu)).toEqual(["Timetable", "Timetable"]);
    expect(overview.findIndex((i) => i.submenu === "Timetable")).toBe(overview.findIndex((i) => i.submenu === "Attendance") + 3);
    expect(SUBMENUS.Timetable).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Timetable")).toBe(false);
    expect(activeNavItem("/school/timings")?.label).toBe("School timings");
    expect(activeNavItem("/school/timetable")?.label).toBe("Class timetables");
    expect(activeNavItem("/school/timetable/subjects")?.label).toBe("Class timetables");
    expect(activeNavItem("/school/timetable/teacher/t1")?.label).toBe("Class timetables");
    expect(activeNavItem("/school/classes")?.label).toBe("Classes");
    expect(activeNavItem("/school/classes/departments/d1")?.label).toBe("Classes");
  });

  it("lights up the matching child of Students on the active, inactive and class-filtered lists", () => {
    expect(activeNavItem("/school-class")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/c5/timetable")?.label).toBe("Classes");
    expect(activeNavItem("/school-class/students", forAdmin)?.label).toBe("Active students");
    expect(activeNavItem("/school/students", forAdmin)?.label).toBe("Active students");
    expect(activeNavItem("/school/students/new", forAdmin)?.label).toBe("Active students");
    expect(activeNavItem("/school/students/inactive", forAdmin)?.label).toBe("Inactive students");
    // A person the school allowed to see students sees the matching child of Students.
    expect(activeNavItem("/school/students/new", menuOf(person("receptionist", ["students.view"])))?.label).toBe("Active students");
    expect(activeNavItem("/school/students/inactive", menuOf(person("receptionist", ["students.view", "students.status"])))?.label).toBe("Inactive students");
  });
});

describe("a page opened from another menu entry keeps that entry lit", () => {
  it("keeps the Active students child lit when Add student came from its class-filtered list", () => {
    const where = { pathname: "/school/students/new", state: cameFrom("/school-class/students", "Students") };
    expect(pathForMenu(where)).toBe("/school-class/students");
    expect(activeNavItem(pathForMenu(where))?.label).toBe("Active students");
  });

  it("works for a class's own page too, which is lit under Classes", () => {
    const where = { pathname: "/school/students/new", state: cameFrom("/school-class/c5", "Class 5") };
    expect(activeNavItem(pathForMenu(where))?.label).toBe("Classes");
  });

  it("is the page's own address when nobody said where they came from", () => {
    expect(pathForMenu({ pathname: "/school/students/new", state: null })).toBe("/school/students/new");
    expect(activeNavItem(pathForMenu({ pathname: "/school/students/new", state: null }), menuOf(person("school_admin")))?.label).toBe("Active students");
  });

  it("ignores anything in the state that is not an address of the app", () => {
    for (const state of [{ cameFrom: "x" }, { cameFrom: { href: 5 } }, { cameFrom: { href: "https://evil.example/" } }, { cameFrom: { href: "//evil.example" } }, "text", 7]) {
      expect(pathForMenu({ pathname: "/school/students/new", state })).toBe("/school/students/new");
    }
  });
});
