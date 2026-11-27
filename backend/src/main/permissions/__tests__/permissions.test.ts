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
    expect(DEFAULT_PERMISSIONS.accountant).toEqual(["dashboard.view", "students.view", "students.export", "calendar.view", "fees.view", "fees.manage", "fees.collect"]);
    expect(DEFAULT_PERMISSIONS.parent).toContain("child.attendance");
    expect(permissionsFor("parent")).toEqual(["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave", "child.transport", "child.fees", "child.documents"]);
    expect(permissionsFor("staff")).not.toContain("child.attendance");
    // Only what has a page for that person is offered: a teacher works with their own classes, the staff with the school's pages.
    expect(permissionsFor("teacher")).toEqual(expect.arrayContaining(["classwork.manage", "exams.marks", "timetable.view"]));
    expect(permissionsFor("teacher")).not.toContain("students.add");
    // What only a class teacher does in their own class is its own list (2026-11-26): not on every teacher's.
    expect(permissionsFor("class_teacher")).toEqual(["attendance.view", "attendance.mark", "leaves.view", "leaves.decide"]);
    expect(permissionsFor("teacher")).not.toContain("attendance.mark");
    expect(permissionsFor("teacher")).not.toContain("leaves.decide");
    expect(DEFAULT_PERMISSIONS.class_teacher).toEqual(["attendance.view", "attendance.mark", "leaves.view", "leaves.decide"]);
    expect(permissionsFor("staff")).toEqual(expect.arrayContaining(["students.add", "attendance.view", "leaves.decide", "calendar.manage", "dashboard.view"]));
    // The staff's attendance sheet and the teachers' and staff's own leave can be given (2026-11-26).
    expect(permissionsFor("staff")).toEqual(expect.arrayContaining(["attendance.staff", "staffleaves.view", "staffleaves.decide"]));
    expect(permissionsFor("teacher")).not.toContain("staffleaves.view");
    // Only a class teacher takes attendance (2026-11-17): the staff are never offered it.
    expect(permissionsFor("staff")).not.toContain("attendance.mark");
    expect(permissionsFor("staff")).not.toContain("classwork.manage");
  });

  it("the kinds are a teacher, a class teacher, a parent and every kind of staff except the principal, who runs the school", () => {
    const keys = PROFILES.map((p) => p.key);
    expect(keys.slice(0, 3)).toEqual(["teacher", "class_teacher", "parent"]);
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
    const saved = await put(s.token, "receptionist", ["students.add", "attendance.view", "calendar.view"]);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ key: "receptionist", isDefault: false });
    expect(saved.body.data.permissions).toEqual(["students.view", "students.add", "attendance.view", "calendar.view"]);
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
  async function staffOf(tenantId: string, role: string, roleOther: string | null = null, status = "active") {
    const tag = `${role}.${(roleOther ?? "").replace(/\W+/g, "")}.${status}`;
    const email = `${tag}.${tenantId}@school.example`;
    const user = await User.create({ name: "Meena", email, passwordHash: "x", role: "staff", tenantId });
    await StaffMember.create({ tenantId, name: `Meena ${tag}`, nameKey: `meena ${tag}`, role, roleOther, status, userId: user._id });
    return { userId: user._id.toString(), tenantId };
  }
  const profilesOf = async (token: string) => (await get(token)).body.data.profiles as { key: string; label: string; kind: string; permissions: string[]; isDefault: boolean }[];

  it("a role the school named itself (Other: Sports coach) is a kind of its own, and follows Other roles until the school chooses for it", async () => {
    const s = await createSchool("Sunrise Public School");
    const coach = await staffOf(s.tenantId, "other", "Sports Coach");
    const gardener = await staffOf(s.tenantId, "other", "Gardener");
    // The same name written another way is the same role; a role whose only person is inactive is not listed.
    await staffOf(s.tenantId, "other", " sports  coach ", "invited");
    await staffOf(s.tenantId, "other", "Old post", "inactive");

    const listed = (await profilesOf(s.token)).filter((p) => p.key.startsWith("other:"));
    expect(listed.map((p) => [p.key, p.label, p.kind])).toEqual([
      ["other:gardener", "Gardener", "staff"],
      ["other:sports coach", "Sports Coach", "staff"],
    ]);
    expect(listed.every((p) => p.isDefault && p.permissions.join() === "calendar.view")).toBe(true);

    // Other roles is what every named role without a list of its own may do.
    await put(s.token, "other", ["transport.view"]);
    expect(await PermissionService.grantedTo({ ...coach, role: "staff" })).toEqual(["transport.view"]);

    // The coach gets a list of their own; the gardener still follows Other roles.
    const saved = await request(app).put(`${api}/${encodeURIComponent("other:sports coach")}`).set(auth(s.token)).send({ permissions: ["students.view"] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ key: "other:sports coach", label: "Sports Coach", kind: "staff", isDefault: false, permissions: ["students.view"] });
    expect(await PermissionService.grantedTo({ ...coach, role: "staff" })).toEqual(["students.view"]);
    expect(await PermissionService.grantedTo({ ...gardener, role: "staff" })).toEqual(["transport.view"]);

    // Back to the usual list: they follow Other roles again.
    const back = await request(app).delete(`${api}/${encodeURIComponent("other:sports coach")}`).set(auth(s.token));
    expect(back.body.data).toMatchObject({ key: "other:sports coach", isDefault: true, permissions: ["transport.view"] });
    expect(await PermissionService.grantedTo({ ...coach, role: "staff" })).toEqual(["transport.view"]);
  });

  const makeRole = (token: string, name: unknown) => request(app).post(`${api}/roles`).set(auth(token)).send({ name });
  const deleteRole = (token: string, key: string) => request(app).delete(`${api}/roles/${encodeURIComponent(key)}`).set(auth(token));

  it("the school admin makes a role with only its name (2026-11-26): every staff permission is offered, it follows Other roles, Add staff lists it", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await makeRole(s.token, "  Sports   Coach ");
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ key: "other:sports coach", label: "Sports Coach", kind: "staff", isDefault: true, permissions: ["calendar.view"], custom: true, people: 0 });
    expect(made.body.data.offered).toEqual([...permissionsFor("staff")]);
    expect((await profilesOf(s.token)).find((p) => p.key === "other:sports coach")).toMatchObject({ label: "Sports Coach", custom: true, people: 0 });

    // Its own list, then a person added with the role has it.
    expect((await put(s.token, encodeURIComponent("other:sports coach"), ["students.view", "fees.collect"])).status).toBe(200);
    const coach = await staffOf(s.tenantId, "other", "sports coach");
    expect(await PermissionService.grantedTo({ ...coach, role: "staff" })).toEqual(["students.view", "fees.collect"]);
    expect((await profilesOf(s.token)).find((p) => p.key === "other:sports coach")).toMatchObject({ people: 1 });

    // Add staff's list of the roles the school named: for anyone who adds or changes staff, not only the admin.
    await staffOf(s.tenantId, "other", "Gardener");
    const roles = await request(app).get(`${api}/roles`).set(auth(s.token));
    expect(roles.body.data.items).toEqual([
      { key: "other:gardener", label: "Gardener" },
      { key: "other:sports coach", label: "Sports Coach" },
    ]);
    const reception = await addColleague(s.tenantId, "receptionist");
    expect((await request(app).get(`${api}/roles`).set(auth(reception))).status).toBe(403);
    await put(s.token, "receptionist", ["staff.add"]);
    expect((await request(app).get(`${api}/roles`).set(auth(reception))).status).toBe(200);
    // Making and deleting a role is the school admin's alone.
    expect((await makeRole(reception, "Cook")).status).toBe(403);
    expect((await makeRole(await addColleague(s.tenantId, "principal"), "Cook")).status).toBe(403);
  });

  it("refuses a name made already, the name of a usual role and an empty name", async () => {
    const s = await createSchool("Sunrise Public School");
    expect((await makeRole(s.token, "Sports Coach")).status).toBe(201);
    const twice = await makeRole(s.token, "sports coach");
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("ROLE_EXISTS");
    for (const name of ["Librarian", "clerk / office staff", "Teacher", "Class teacher", "Principal", "Other"]) {
      const usual = await makeRole(s.token, name);
      expect(usual.status, name).toBe(409);
      expect(usual.body.code, name).toBe("ROLE_NAME_TAKEN");
    }
    expect((await makeRole(s.token, "  ")).status).toBe(400);
    expect((await makeRole(s.token, "x".repeat(41))).status).toBe(400);
  });

  it("a role nobody has can be deleted with its list; one someone has cannot; a name only typed in Add staff is not a role to delete", async () => {
    const s = await createSchool("Sunrise Public School");
    await makeRole(s.token, "Gardener");
    await put(s.token, encodeURIComponent("other:gardener"), ["transport.view"]);
    const gone = await deleteRole(s.token, "other:gardener");
    expect(gone.status).toBe(200);
    expect((await profilesOf(s.token)).some((p) => p.key === "other:gardener")).toBe(false);
    expect(await RolePermission.countDocuments({ tenantId: s.tenantId, profile: "other:gardener" })).toBe(0);

    await makeRole(s.token, "Coach");
    await staffOf(s.tenantId, "other", "Coach");
    const inUse = await deleteRole(s.token, "other:coach");
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe("ROLE_IN_USE");

    await staffOf(s.tenantId, "other", "Watchman");
    expect((await deleteRole(s.token, "other:watchman")).status).toBe(404);
    expect((await deleteRole(s.token, "other:astronaut")).status).toBe(404);
  });

  it("a named role nobody of the school has is not found, and a parent's or a teacher's key cannot be given to one", async () => {
    const s = await createSchool("Sunrise Public School");
    await staffOf(s.tenantId, "other", "Gardener");
    expect((await put(s.token, encodeURIComponent("other:astronaut"), [])).status).toBe(404);
    expect((await put(s.token, encodeURIComponent("other:gardener"), ["child.attendance"])).status).toBe(400);
    expect((await put(s.token, encodeURIComponent("other:gardener"), ["classwork.manage"])).status).toBe(400);
    // Another school's named role is not this school's.
    const b = await createSchool("Moonlight Public School");
    expect((await put(b.token, encodeURIComponent("other:gardener"), [])).status).toBe(404);
  });

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

  it("a teacher's login has every teacher's list and the class teacher's list together (the class teacher's works only in their own class)", async () => {
    const s = await createSchool("Sunrise Public School");
    const teacher = { userId: "x", role: "teacher", tenantId: s.tenantId };
    expect(await PermissionService.grantedTo(teacher)).toEqual(
      expect.arrayContaining(["attendance.view", "attendance.mark", "leaves.view", "leaves.decide", "classwork.manage", "exams.marks", "timetable.view", "calendar.view"])
    );
    await put(s.token, "class_teacher", ["attendance.view"]);
    const after = await PermissionService.grantedTo(teacher);
    expect(after).toContain("attendance.view");
    expect(after).not.toContain("attendance.mark");
    expect(after).not.toContain("leaves.view");
    expect(after).toContain("classwork.manage");
    await put(s.token, "teacher", ["calendar.view"]);
    expect(await PermissionService.grantedTo(teacher)).toEqual(["attendance.view", "calendar.view"]);
    // The class teacher's list is offered only what a class teacher does in their class.
    expect((await put(s.token, "class_teacher", ["students.view"])).status).toBe(400);
    expect((await put(s.token, "teacher", ["attendance.mark"])).status).toBe(400);
  });

  it("a permission saved before a kind of person was offered something is not given (only what is offered counts)", async () => {
    const s = await createSchool("Sunrise Public School");
    await RolePermission.create({ tenantId: s.tenantId, profile: "receptionist", permissions: ["students.view", "child.attendance"] });
    expect(await PermissionService.grantedTo({ userId: "x", role: "receptionist", tenantId: s.tenantId })).toEqual(["students.view"]);
  });
});
