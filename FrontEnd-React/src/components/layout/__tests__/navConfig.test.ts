import { describe, expect, it } from "vitest";
import type { AuthUser, UserRole } from "../../../types";
import { NAV_ITEMS, SUBMENUS, activeNavItem, cameFrom, kickerOf, navVisible, pageTitleOf, pathForMenu, sectionOf } from "../nav-config";

/** A person of the given kind; `permissions` omitted means the usual list of the kind (what the school has not changed). */
const person = (role: UserRole, permissions?: string[]): AuthUser => ({ id: "u1", name: "A", email: null, username: null, role, tenantId: "t1", emailVerifiedAt: null, ...(permissions ? { permissions } : {}) });
const menuOf = (user: AuthUser) => NAV_ITEMS.filter((i) => navVisible(i, user));
const labelsOf = (user: AuthUser) => menuOf(user).map((i) => i.label);

describe("the headings of the menu (2026-11-22, the reference pictures)", () => {
  const sectionOfHref = (href: string) => sectionOf(NAV_ITEMS.find((i) => i.href === href)!);

  it("Main holds the daily pages, Finance & transport the money and the buses, Admin the school's own setting up", () => {
    for (const href of ["/dashboard", "/school/exams", "/school-class", "/school/students", "/teachers", "/attendance/students", "/attendance/teachers", "/attendance/staff", "/school/timings", "/school/timetable", "/staff"]) {
      expect(sectionOfHref(href), href).toBe("Main");
    }
    for (const href of ["/transport/vehicles", "/transport/drivers", "/transport/routes", "/transport/tracking", "/fees/collect", "/fees/dues", "/fees/receipts", "/fees/structure", "/fees/heads", "/fees/concessions", "/fees/rules"]) {
      expect(sectionOfHref(href), href).toBe("Finance & transport");
    }
    for (const href of ["/permissions", "/calendar", "/leaves", "/super-admin/schools"]) {
      expect(sectionOfHref(href), href).toBe("Admin");
    }
  });

  it("a page of a folding group (Manage school) and Settings keep their own heading", () => {
    expect(sectionOfHref("/documents")).toBe("Manage school");
    expect(sectionOfHref("/settings")).toBe("Account");
  });

  it("no item is left under the old catch-all heading \"Overview\"", () => {
    expect(NAV_ITEMS.map(sectionOf)).not.toContain("Overview");
  });
});

describe("one run of each heading (found in the real app, 2026-11-22)", () => {
  it("the items of a heading sit together, so the menu draws each heading and each folding row once (Manage school was drawn twice, and React warned of a repeated key)", () => {
    for (const who of [person("school_admin"), person("principal"), person("super_admin"), person("accountant"), person("receptionist", ["students.view", "documents.view", "fees.view"])]) {
      const runs: string[] = [];
      for (const item of menuOf(who)) {
        const name = sectionOf(item);
        if (runs[runs.length - 1] !== name) runs.push(name);
      }
      expect(new Set(runs).size, runs.join(" > ")).toBe(runs.length);
    }
  });
});

describe("the small label above the page's name in the top bar", () => {
  const item = (href: string) => NAV_ITEMS.find((i) => i.href === href);

  it("names the kind of page (People, Daily register, Finance...), and the school for the dashboard", () => {
    expect(kickerOf(item("/dashboard"), "KKR Public School")).toBe("KKR Public School");
    expect(kickerOf(item("/school/students"), "KKR Public School")).toBe("People");
    expect(kickerOf(item("/teachers"), "KKR Public School")).toBe("People");
    expect(kickerOf(item("/staff"), "KKR Public School")).toBe("People");
    expect(kickerOf(item("/attendance/students"), "KKR Public School")).toBe("Daily register");
    expect(kickerOf(item("/fees/structure"), "KKR Public School")).toBe("Finance");
    expect(kickerOf(item("/transport/routes"), "KKR Public School")).toBe("Transport");
    expect(kickerOf(item("/school/timetable"), "KKR Public School")).toBe("Academics");
    expect(kickerOf(item("/school-class"), "KKR Public School")).toBe("Academics");
    expect(kickerOf(item("/school/exams"), "KKR Public School")).toBe("Academics");
    expect(kickerOf(item("/permissions"), "KKR Public School")).toBe("Admin");
  });

  it("is the school's name for a page it has no kind for", () => {
    expect(kickerOf(undefined, "KKR Public School")).toBe("KKR Public School");
  });
});

describe("the menu of the people who run a school", () => {
  const forAdmin = menuOf(person("school_admin"));

  it("has Classes, ONE Students row and ONE Teachers row (their active / inactive lists are tabs on their pages)", () => {
    expect(forAdmin.filter((i) => i.group === "Overview").map((i) => [i.label, i.href])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Exam", "/school/exams"],
      ["Classes", "/school-class"],
      ["Students", "/school/students"],
      ["Teachers", "/teachers"],
      ["Student", "/attendance/students"],
      ["Teacher", "/attendance/teachers"],
      ["Staff", "/attendance/staff"],
      ["School timings", "/school/timings"],
      ["Class timetables", "/school/timetable"],
      ["Leave & arrangements", "/school/arrangements"],
      ["Teaching progress", "/teaching-progress"],
      ["Staff", "/staff"],
      ["Vehicles", "/transport/vehicles"],
      ["Drivers", "/transport/drivers"],
      ["Routes", "/transport/routes"],
      ["Live tracking", "/transport/tracking"],
      ["Collect fees", "/fees/collect"],
      ["Dues", "/fees/dues"],
      ["Receipts", "/fees/receipts"],
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
    expect(labelsOf(person("teacher"))).toEqual(["Dashboard", "Teaching progress", "My leave", "Calendar", "Leave requests", "Settings"]);
    expect(labelsOf(person("parent"))).toEqual(["Dashboard", "Calendar", "Settings"]);
  });

  it("gives the staff who work for the school without teaching (2026-11-07) the Dashboard and the Calendar, and nothing of the school's setup; Staff and Permissions are for the people who run the school", () => {
    for (const role of ["receptionist", "management", "staff"] as const) {
      expect(labelsOf(person(role))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
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
      ["", "My leave", "/my-leave"],
      ["", "Calendar", "/calendar"],
      ["", "Leave requests", "/leaves"],
      ["", "Settings", "/settings"],
    ]);
    // Teachers' attendance is its own permission; the platform's pages and the school's set-up are never given by a box.
    expect(labelsOf(person("receptionist", ["attendance.teachers"]))).toEqual(["Dashboard", "Teacher", "My leave", "Settings"]);
    expect(labelsOf(person("receptionist", ["students.view", "attendance.view"]))).not.toContain("Manage Students");
    expect(labelsOf(person("receptionist", ["students.view", "attendance.view"]))).not.toContain("Inactive students");
    // The inactive students are a tab of the Students page (the tab asks for students.status), not a menu entry.
    expect(labelsOf(person("receptionist", ["students.view", "students.status"]))).toContain("Students");
    expect(labelsOf(person("receptionist", ["students.view", "students.status"]))).not.toContain("Inactive students");
    expect(labelsOf(person("receptionist", ["students.view"]))).not.toContain("Permissions");
    // Settings are available to everyone; without permissions the dashboard is the only work area.
    expect(labelsOf(person("receptionist", []))).toEqual(["Dashboard", "My leave", "Settings"]);
    expect(labelsOf(person("school_admin", []))).toContain("Permissions");
    // The platform team sees the platform's pages only, whatever list a session carries.
    expect(labelsOf(person("super_admin", ["students.view"]))).toEqual(["Dashboard", "Schools", "Settings"]);
  });

  it("the school's pages follow their own keys, and never show admin-only pages to delegated staff", () => {
    const keys = ["teachers.view", "staff.view", "classes.view", "classes.manage", "years.manage", "promotion.manage", "timetable.edit", "exams.manage"];
    expect(labelsOf(person("receptionist", keys))).toEqual([
      "Dashboard",
      "Exam",
      "Classes",
      "Teachers",
      "School timings",
      "Class timetables",
      "Leave & arrangements",
      "My leave",
      "Staff",
      "Academic years",
      "Promotion",
      "Settings",
    ]);
    // One key, one Teachers row (active / inactive are its tabs); view and setup share the single Classes entry.
    expect(labelsOf(person("receptionist", ["teachers.view"]))).toEqual(["Dashboard", "Teachers", "My leave", "Settings"]);
    expect(labelsOf(person("receptionist", ["classes.view"]))).toEqual(["Dashboard", "Classes", "My leave", "Settings"]);
    expect(labelsOf(person("receptionist", ["timetable.edit"]))).toEqual(["Dashboard", "School timings", "Class timetables", "Leave & arrangements", "My leave", "Settings"]);
    // Permissions is admin-only; the separate Manage Teacher entry has joined Teacher.
    for (const label of ["Manage Students", "Manage Teacher", "Permissions"]) expect(labelsOf(person("receptionist", [...keys, "students.view"]))).not.toContain(label);
    // A teacher (own classes) and a parent are not given the school's pages by these keys.
    expect(labelsOf(person("teacher", [...keys, "calendar.view"]))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", keys))).toEqual(["Dashboard", "Settings"]);
  });

  it("Teaching progress: for a teacher who may see the diary and for staff the school allowed progress.view; never parents", () => {
    expect(labelsOf(person("teacher", ["classwork.view"]))).toContain("Teaching progress");
    expect(labelsOf(person("receptionist", ["progress.view"]))).toEqual(["Dashboard", "Teaching progress", "My leave", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Teaching progress");
    expect(labelsOf(person("parent"))).not.toContain("Teaching progress");
  });

  it("Transport is one row that opens Vehicles, Drivers, Routes and Live tracking (2026-11-10), for the people allowed transport.view; not for teachers or parents", () => {
    const pages = NAV_ITEMS.filter((i) => i.submenu === "Transport");
    expect(pages.map((i) => [i.label, i.href])).toEqual([
      ["Vehicles", "/transport/vehicles"],
      ["Drivers", "/transport/drivers"],
      ["Routes", "/transport/routes"],
      ["Live tracking", "/transport/tracking"],
    ]);
    expect(SUBMENUS.Transport).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Transport")).toBe(false);
    expect(labelsOf(person("receptionist", ["transport.view"]))).toEqual(["Dashboard", "My leave", "Vehicles", "Drivers", "Routes", "Live tracking", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Vehicles");
    expect(labelsOf(person("teacher", ["transport.view", "calendar.view"]))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", ["transport.view"]))).toEqual(["Dashboard", "Settings"]);
    expect(activeNavItem("/transport/routes", menuOf(person("school_admin")))?.label).toBe("Routes");
  });

  it("Fees is one row (2026-11-12, collecting 2026-11-19): Collect fees, Dues and Receipts for the people allowed fees.collect, then Fee structure, Fee heads, Concessions and Fee rules for those allowed fees.view; not for teachers or parents", () => {
    const pages = NAV_ITEMS.filter((i) => i.submenu === "Fees");
    expect(pages.map((i) => [i.label, i.href])).toEqual([
      ["Collect fees", "/fees/collect"],
      ["Dues", "/fees/dues"],
      ["Receipts", "/fees/receipts"],
      ["Fee structure", "/fees/structure"],
      ["Fee heads", "/fees/heads"],
      ["Concessions", "/fees/concessions"],
      ["Fee rules", "/fees/rules"],
    ]);
    expect(SUBMENUS.Fees).toBeDefined();
    expect(NAV_ITEMS.some((i) => i.label === "Fees")).toBe(false);
    expect(labelsOf(person("accountant", ["fees.view", "fees.collect"]))).toEqual(["Dashboard", "My leave", "Collect fees", "Dues", "Receipts", "Fee structure", "Fee heads", "Concessions", "Fee rules", "Settings"]);
    // A cashier who only collects sees the collecting pages and not the set-up.
    expect(labelsOf(person("receptionist", ["fees.collect"]))).toEqual(["Dashboard", "My leave", "Collect fees", "Dues", "Receipts", "Settings"]);
    expect(labelsOf(person("accountant", ["fees.view"]))).toEqual(["Dashboard", "My leave", "Fee structure", "Fee heads", "Concessions", "Fee rules", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Fee structure");
    expect(labelsOf(person("teacher", ["fees.view", "fees.collect", "calendar.view"]))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
    expect(labelsOf(person("parent", ["fees.view", "fees.collect"]))).toEqual(["Dashboard", "Settings"]);
    expect(activeNavItem("/fees/heads", menuOf(person("school_admin")))?.label).toBe("Fee heads");
    expect(activeNavItem("/fees/collect", menuOf(person("school_admin")))?.label).toBe("Collect fees");
  });

  it("Documents (2026-11-19) is in Manage school, for the people allowed documents.view; not for teachers or parents", () => {
    expect(forAdmin.find((i) => i.label === "Documents")).toMatchObject({ href: "/documents", group: "Manage school" });
    expect(labelsOf(person("receptionist", ["documents.view"]))).toEqual(["Dashboard", "My leave", "Documents", "Settings"]);
    expect(labelsOf(person("receptionist", ["calendar.view"]))).not.toContain("Documents");
    expect(labelsOf(person("teacher", ["documents.view", "calendar.view"]))).not.toContain("Documents");
    expect(labelsOf(person("parent", ["documents.view"]))).toEqual(["Dashboard", "Settings"]);
    expect(activeNavItem("/documents", forAdmin)?.label).toBe("Documents");
  });

  it("Attendance > Staff and Leave & arrangements can be given to a kind of staff (2026-11-26); never to a teacher", () => {
    expect(labelsOf(person("receptionist", ["attendance.staff"]))).toEqual(["Dashboard", "Staff", "My leave", "Settings"]);
    expect(labelsOf(person("receptionist", ["staffleaves.view"]))).toEqual(["Dashboard", "Leave & arrangements", "My leave", "Settings"]);
    expect(labelsOf(person("teacher", ["attendance.staff", "staffleaves.view", "calendar.view"]))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
  });

  it("a staff member who also teaches (a Coordinator who takes a class, 2026-11-26) sees the school's pages their role's list gives, beside their teacher's pages", () => {
    const teaching = (permissions: string[], schoolPermissions: string[]): AuthUser => ({ ...person("teacher", permissions), schoolPermissions });
    expect(labelsOf(teaching(["students.view", "attendance.view", "calendar.view", "fees.collect"], ["students.view", "fees.collect"]))).toEqual([
      "Dashboard",
      "Students",
      "My leave",
      "Collect fees",
      "Dues",
      "Receipts",
      "Calendar",
      "Settings",
    ]);
    // Their Class teacher list's attendance.view is their own class's: the whole school's Student attendance only when their role's list has it.
    expect(labelsOf(teaching(["attendance.view"], []))).not.toContain("Student");
    expect(labelsOf(teaching(["attendance.view"], ["attendance.view"]))).toContain("Student");
  });

  it("a parent's Calendar and a teacher's pages go when the school takes the boxes away", () => {
    expect(labelsOf(person("parent", []))).toEqual(["Dashboard", "Settings"]);
    expect(labelsOf(person("teacher", ["calendar.view"]))).toEqual(["Dashboard", "My leave", "Calendar", "Settings"]);
  });

  it("My leave (2026-11-24) is for the people who work for the school and can ask for leave from their own login: not parents or the school admin, who answer it on Leave & arrangements", () => {
    for (const role of ["teacher", "principal", "accountant", "receptionist", "management", "staff"] as const) expect(labelsOf(person(role))).toContain("My leave");
    for (const role of ["school_admin", "parent", "student", "super_admin"] as const) expect(labelsOf(person(role))).not.toContain("My leave");
    expect(NAV_ITEMS.find((i) => i.label === "My leave")).toMatchObject({ href: "/my-leave", group: "Overview" });
    expect(NAV_ITEMS.find((i) => i.label === "Leave & arrangements")?.submenu).toBeUndefined();
    expect(activeNavItem("/my-leave", menuOf(person("teacher")))?.label).toBe("My leave");
  });

  it("keeps students and teachers each on one sidebar row (their active / inactive lists are tabs, not menu entries)", () => {
    const manage = forAdmin.filter((i) => i.group === "Manage school").map((i) => i.label);
    expect(manage).not.toContain("Manage Teacher");
    expect(manage).not.toContain("Manage Students");
    expect(forAdmin.filter((i) => i.submenu === "Students")).toEqual([]);
    expect(NAV_ITEMS.filter((i) => i.label === "Students").map((i) => [i.href, i.submenu])).toEqual([["/school/students", undefined]]);
    expect(NAV_ITEMS.some((i) => i.label === "Inactive students" || i.label === "Active students")).toBe(false);
    expect(SUBMENUS.Students).toBeUndefined();
    expect(forAdmin.filter((i) => i.submenu === "Teachers")).toEqual([]);
    expect(NAV_ITEMS.filter((i) => i.label === "Teachers").map((i) => [i.href, i.submenu])).toEqual([["/teachers", undefined]]);
    expect(NAV_ITEMS.some((i) => i.label === "Inactive teachers" || i.label === "Active teachers")).toBe(false);
    expect(SUBMENUS.Teachers).toBeUndefined();
    // Attendance's own "Teacher" row (2026-11-10) is teacher attendance, not the list of teachers.
    expect(NAV_ITEMS.some((i) => i.submenu !== "Attendance" && (i.label === "Teacher" || i.label === "Manage Teacher"))).toBe(false);
    // No two entries at one level share a name; under Attendance the row itself says which Teacher and Staff these are.
    const labels = forAdmin.map((i) => `${i.submenu ?? ""}/${i.label}`);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has Exam as its own row at the top, right under Dashboard (2026-11-26; it was Test & Exam under Manage school), lit up on an exam's own page too", () => {
    expect(NAV_ITEMS.some((i) => i.label === "Test & Exam")).toBe(false);
    const item = NAV_ITEMS.find((i) => i.label === "Exam");
    expect(item).toMatchObject({ href: "/school/exams", group: "Overview", permission: ["exams.manage"], schoolWide: true });
    expect(item?.submenu).toBeUndefined();
    expect(item?.roles).toEqual(["school_admin", "principal"]);
    expect(forAdmin.map((i) => i.label).slice(0, 2)).toEqual(["Dashboard", "Exam"]);
    expect(activeNavItem("/school/exams")?.label).toBe("Exam");
    expect(activeNavItem("/school/exams/e1")?.label).toBe("Exam");
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
    expect(pageTitleOf(activeNavItem("/teachers"))).toBe("Teachers");
    expect(pageTitleOf(undefined)).toBe("Dashboard");
  });

  it("lights up the one Teachers row on its list (either tab), a teacher's own pages and the old management addresses", () => {
    expect(activeNavItem("/teachers")?.label).toBe("Teachers");
    expect(activeNavItem("/teachers/t1/edit")?.label).toBe("Teachers");
    expect(activeNavItem("/teachers/inactive")?.label).toBe("Teachers");
    expect(activeNavItem(pathForMenu({ pathname: "/teachers", search: "?status=inactive", state: null }))?.label).toBe("Teachers");
    expect(activeNavItem("/school/teachers/t1")?.label).toBe("Teachers");
    expect(activeNavItem("/school/teachers/new")?.label).toBe("Teachers");
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
    expect(activeNavItem("/school-class/students", forAdmin)?.label).toBe("Students");
    expect(activeNavItem("/school/students", forAdmin)?.label).toBe("Students");
    expect(activeNavItem("/school/students/new", forAdmin)?.label).toBe("Students");
    expect(activeNavItem("/school/students/inactive", forAdmin)?.label).toBe("Students");
    // A person the school allowed to see students sees the same row.
    expect(activeNavItem("/school/students/new", menuOf(person("receptionist", ["students.view"])))?.label).toBe("Students");
  });
});

describe("a page opened from another menu entry keeps that entry lit", () => {
  it("keeps the Students row lit when Add student came from its class-filtered list", () => {
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
    expect(activeNavItem(pathForMenu({ pathname: "/school/students/new", state: null }), menuOf(person("school_admin")))?.label).toBe("Students");
  });

  it("ignores anything in the state that is not an address of the app", () => {
    for (const state of [{ cameFrom: "x" }, { cameFrom: { href: 5 } }, { cameFrom: { href: "https://evil.example/" } }, { cameFrom: { href: "//evil.example" } }, "text", 7]) {
      expect(pathForMenu({ pathname: "/school/students/new", state })).toBe("/school/students/new");
    }
  });
});
