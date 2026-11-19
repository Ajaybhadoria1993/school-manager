import { describe, expect, it } from "vitest";
import type { AuthUser, UserRole } from "../../types";
import { can, sameList, toggled } from "../permissions";

const person = (role: UserRole, permissions?: string[]): AuthUser => ({ id: "u1", name: "A", email: null, username: null, role, tenantId: "t1", emailVerifiedAt: null, ...(permissions ? { permissions } : {}) });

describe("can: what the school allowed a person", () => {
  it("the school admin and the principal can do everything, whatever list they carry", () => {
    for (const role of ["school_admin", "principal"] as const) {
      expect(can(person(role, []), "students.add")).toBe(true);
      expect(can(person(role), "anything.at.all")).toBe(true);
    }
  });

  it("anyone else can when their list has ANY of the permissions asked", () => {
    const reception = person("receptionist", ["students.view", "attendance.view"]);
    expect(can(reception, "students.view")).toBe(true);
    expect(can(reception, "students.add", "attendance.view")).toBe(true);
    expect(can(reception, "students.add")).toBe(false);
    expect(can(reception)).toBe(false);
    expect(can(person("receptionist", []), "calendar.view")).toBe(false);
  });

  it("nobody is allowed anything when nobody is signed in, and the platform team has no school permissions", () => {
    expect(can(null, "calendar.view")).toBe(false);
    expect(can(undefined, "calendar.view")).toBe(false);
    expect(can(person("super_admin", ["students.view"]), "students.view")).toBe(true);
    expect(can(person("super_admin"), "students.view")).toBe(false);
  });

  it("a session without its own list (an older server) has the usual list of the kind, so nobody loses a page", () => {
    expect(can(person("teacher"), "attendance.mark")).toBe(true);
    expect(can(person("teacher"), "students.add")).toBe(false);
    expect(can(person("parent"), "child.leave")).toBe(true);
    expect(can(person("accountant"), "students.view", "dashboard.view")).toBe(true);
    expect(can(person("receptionist"), "calendar.view")).toBe(true);
    expect(can(person("receptionist"), "students.view")).toBe(false);
  });
});

describe("ticking and clearing a box", () => {
  it("ticking brings what it needs; clearing takes away what needed it", () => {
    expect(toggled([], "students.add", true).sort()).toEqual(["students.add", "students.view"]);
    expect(toggled(["students.view", "students.add", "students.edit"], "students.view", false)).toEqual([]);
    expect(toggled(["students.view", "students.add"], "students.add", false)).toEqual(["students.view"]);
    expect(toggled(["calendar.view"], "calendar.manage", true).sort()).toEqual(["calendar.manage", "calendar.view"]);
    expect(toggled(["attendance.view", "attendance.mark"], "attendance.view", false)).toEqual([]);
  });

  it("two lists are the same whatever their order", () => {
    expect(sameList(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameList(["a"], ["a", "b"])).toBe(false);
    expect(sameList([], [])).toBe(true);
  });
});
