import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool, PASSWORD } from "../../../test/schools";
import { StaffMember } from "../../staff/models/StaffMember";
import { User } from "../../users/models/User";
import { DEFAULT_PERMISSIONS, IMPLIES, PERMISSION_GROUPS, PERMISSION_KEYS, PROFILES, permissionsFor } from "../constants";
import { RolePermission } from "../models/RolePermission";
import { PermissionService } from "../services/permission.service";

const api = "/api/v1/permissions";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string) => request(app).get(api).set(auth(token));
const put = (token: string, profile: string, permissions: string[]) => request(app).put(`${api}/${profile}`).set(auth(token)).send({ permissions });
const remove = (token: string, profile: string) => request(app).delete(`${api}/${profile}`).set(auth(token));

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the catalogue of what a person may be allowed", () => {
  it("every permission is in one group once, and what a permission needs exists and is offered with it", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const [key, needs] of Object.entries(IMPLIES)) {
      expect(PERMISSION_KEYS, key).toContain(key);
      expect(PERMISSION_KEYS, needs).toContain(needs);
    }
    expect(PERMISSION_GROUPS.flatMap((g) => g.items).map((p) => p.key)).toEqual([...PERMISSION_KEYS]);
  });

  it("each kind of person starts with what they could do before there were permissions, and only what can be given to them", () => {
    for (const profile of PROFILES) {
      const offered = permissionsFor(profile.kind);
      for (const key of DEFAULT_PERMISSIONS[profile.key]) expect(offered, `${profile.key} ${key}`).toContain(key);
    }
    expect(DEFAULT_PERMISSIONS.receptionist).toEqual(["calendar.view"]);
    // Fees are new, so the accountant starts with them (their fee chart is their work).
    expect(DEFAULT_PERMISSIONS.accountant).toEqual(["dashboard.view", "students.view", "students.export", "calendar.view", "fees.view", "fees.manage"]);
    expect(DEFAULT_PERMISSIONS.parent).toContain("child.attendance");
    expect(permissionsFor("parent")).toEqual(["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave"]);
    expect(permissionsFor("staff")).not.toContain("child.attendance");
    // Only what has a page for that person is offered: a teacher works with their own classes, the staff with the school's pages.
    expect(permissionsFor("teacher")).toEqual(expect.arrayContaining(["attendance.mark", "classwork.manage", "exams.marks", "timetable.view"]));
    expect(permissionsFor("teacher")).not.toContain("students.add");
    expect(permissionsFor("staff")).toEqual(expect.arrayContaining(["students.add", "attendance.mark", "leaves.decide", "calendar.manage", "dashboard.view"]));
    expect(permissionsFor("staff")).not.toContain("classwork.manage");
  });

  it("the kinds are a teacher, a parent and every kind of staff except the principal, who runs the school", () => {
    const keys = PROFILES.map((p) => p.key);
    expect(keys.slice(0, 2)).toEqual(["teacher", "parent"]);
    expect(keys).toEqual(expect.arrayContaining(["receptionist", "accountant", "management", "librarian", "driver", "other"]));
    expect(keys).not.toContain("principal");
  });
});

describe("the Permissions page's API", () => {
  it("the school admin reads every kind with what they may do (the usual list until the school chooses), and the principal can read too", async () => {
    const s = await createSchool("Sunrise Public School");
    const res = await get(s.token);
    expect(res.status).toBe(200);
    const reception = res.body.data.profiles.find((p: { key: string }) => p.key === "receptionist");
    expect(reception).toMatchObject({ label: "Receptionist", kind: "staff", permissions: ["calendar.view"], isDefault: true });
    expect(reception.offered).not.toContain("child.attendance");
    expect(res.body.data.profiles.find((p: { key: string }) => p.key === "parent").offered).toContain("child.attendance");
    expect(res.body.data.groups.map((g: { key: string }) => g.key)).toContain("students");

    const principal = await addColleague(s.tenantId, "principal");
    expect((await get(principal)).status).toBe(200);
  });

  it("nobody else reads or changes it: a receptionist, a teacher, a parent are refused; the principal reads but does not change", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const role of ["receptionist", "teacher", "parent", "accountant"] as const) {
      const token = await addColleague(s.tenantId, role);
      expect((await get(token)).status, role).toBe(403);
      expect((await put(token, "receptionist", ["students.view"])).status, role).toBe(403);
    }
    const principal = await addColleague(s.tenantId, "principal");
    expect((await put(principal, "receptionist", ["students.view"])).status).toBe(403);
    expect((await get((await request(app).post("/api/v1/auth/login").send({ email: "nobody@x.example", password: PASSWORD })).body.data?.accessToken ?? "")).status).toBe(401);
  });

  it("saves what a kind may do: a permission brings what it needs (adding students needs seeing them), in the catalogue's order", async () => {
    const s = await createSchool("Sunrise Public School");
    const saved = await put(s.token, "receptionist", ["students.add", "attendance.mark", "calendar.view"]);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ key: "receptionist", isDefault: false });
    expect(saved.body.data.permissions).toEqual(["students.view", "students.add", "attendance.view", "attendance.mark", "calendar.view"]);
    const again = (await get(s.token)).body.data.profiles.find((p: { key: string }) => p.key === "receptionist");
    expect(again).toMatchObject({ isDefault: false, permissions: saved.body.data.permissions });
    // Another kind is untouched.
    expect((await get(s.token)).body.data.profiles.find((p: { key: string }) => p.key === "librarian")).toMatchObject({ isDefault: true, permissions: ["calendar.view"] });
  });

  it("a kind can be given nothing at all, and the usual list comes back with a reset", async () => {
    const s = await createSchool("Sunrise Public School");
    const none = await put(s.token, "receptionist", []);
    expect(none.body.data).toMatchObject({ permissions: [], isDefault: false });
    const back = await remove(s.token, "receptionist");
    expect(back.body.data).toMatchObject({ permissions: ["calendar.view"], isDefault: true });
    expect(await RolePermission.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("refuses a permission that cannot be given to that kind, an unknown permission and an unknown kind", async () => {
    const s = await createSchool("Sunrise Public School");
    const parentOnly = await put(s.token, "receptionist", ["child.attendance"]);
    expect(parentOnly.status).toBe(400);
    expect(parentOnly.body.code).toBe("PERMISSION_NOT_OFFERED");
    expect((await put(s.token, "parent", ["students.add"])).status).toBe(400);
    expect((await put(s.token, "receptionist", ["nothing.at.all"])).status).toBe(400);
    expect((await put(s.token, "principal", ["students.view"])).status).toBe(404);
    expect((await put(s.token, "wizard", [])).status).toBe(404);
    expect((await request(app).put(`${api}/receptionist`).set(auth(s.token)).send({ permissions: "all" })).status).toBe(400);
  });

  it("each school has its own: one school's choice does not reach another", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonlight Public School");
    await put(a.token, "receptionist", ["students.view"]);
    expect((await get(b.token)).body.data.profiles.find((p: { key: string }) => p.key === "receptionist")).toMatchObject({ isDefault: true });
    expect(await RolePermission.countDocuments({ tenantId: new Types.ObjectId(b.tenantId) })).toBe(0);
  });
});

describe("what a login may do follows its kind", () => {
  async function staffOf(tenantId: string, role: string) {
    const email = `${role}.${tenantId}@school.example`;
    const user = await User.create({ name: "Meena", email, passwordHash: "x", role: "staff", tenantId });
    await StaffMember.create({ tenantId, name: "Meena Rao", nameKey: "meena rao", role, status: "active", userId: user._id });
    return { userId: user._id.toString(), tenantId };
  }

  it("grantedTo: everything for the school admin and the principal; the kind's list for the rest; a staff login by their own role", async () => {
    const s = await createSchool("Sunrise Public School");
    const admin = await User.findOne({ tenantId: s.tenantId, role: "school_admin" });
    expect(await PermissionService.grantedTo({ userId: admin!._id.toString(), role: "school_admin", tenantId: s.tenantId })).toEqual([...PERMISSION_KEYS]);
    expect(await PermissionService.grantedTo({ userId: "x", role: "principal", tenantId: s.tenantId })).toEqual([...PERMISSION_KEYS]);
    expect(await PermissionService.grantedTo({ userId: "x", role: "receptionist", tenantId: s.tenantId })).toEqual(["calendar.view"]);
    expect(await PermissionService.grantedTo({ userId: "x", role: "student", tenantId: s.tenantId })).toEqual([]);
    expect(await PermissionService.grantedTo({ userId: "x", role: "super_admin", tenantId: null })).toEqual([]);

    await put(s.token, "librarian", ["students.view"]);
    const librarian = await staffOf(s.tenantId, "librarian");
    const driver = await staffOf(s.tenantId, "driver");
    expect(await PermissionService.grantedTo({ ...librarian, role: "staff" })).toEqual(["students.view"]);
    expect(await PermissionService.grantedTo({ ...driver, role: "staff" })).toEqual(["calendar.view"]);
    // A staff login with no staff record is treated as an "other" role.
    expect(await PermissionService.grantedTo({ userId: new Types.ObjectId().toString(), role: "staff", tenantId: s.tenantId })).toEqual(["calendar.view"]);
  });

  it("a permission saved before a kind of person was offered something is not given (only what is offered counts)", async () => {
    const s = await createSchool("Sunrise Public School");
    await RolePermission.create({ tenantId: s.tenantId, profile: "receptionist", permissions: ["students.view", "child.attendance"] });
    expect(await PermissionService.grantedTo({ userId: "x", role: "receptionist", tenantId: s.tenantId })).toEqual(["students.view"]);
  });
});
