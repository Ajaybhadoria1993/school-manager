import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { Guardian } from "../src/models/Guardian";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("User provisioning (logins for Staff/Guardians)", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
  });

  it("searches guardians by phone or partial name", async () => {
    const byPhone = await request(app)
      .get("/api/guardians")
      .query({ q: fixture.guardian.phone })
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.data).toHaveLength(1);
    expect(byPhone.body.data[0]._id).toBe(String(fixture.guardian._id));

    const byName = await request(app)
      .get("/api/guardians")
      .query({ q: "Test Guard" })
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(byName.body.data).toHaveLength(1);
  });

  it("guardian search does not error on regex special characters (ReDoS/crash guard)", async () => {
    const res = await request(app)
      .get("/api/guardians")
      .query({ q: "(a+)+$" })
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(res.status).toBe(200);
  });

  it("admits a sibling under the SAME existing guardian instead of creating a duplicate", async () => {
    const res = await request(app)
      .post("/api/students")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        branchId: fixture.branch._id,
        academicYearId: fixture.academicYear._id,
        classId: fixture.classMaster._id,
        sectionId: fixture.section._id,
        firstName: "Sibling",
        lastName: "Student",
        dob: "2016-01-01",
        gender: "female",
        guardians: [{ existingGuardianId: fixture.guardian._id, relation: "Father" }],
      });
    expect(res.status).toBe(201);

    const guardianAfter = await Guardian.findById(fixture.guardian._id);
    expect(guardianAfter?.studentIds.map(String)).toContain(String(fixture.student._id));
    expect(guardianAfter?.studentIds.map(String)).toContain(String(res.body.data._id));

    const totalGuardians = await Guardian.countDocuments({ tenantId: fixture.tenant._id });
    expect(totalGuardians).toBe(1); // no duplicate guardian record was created

    // The parent's /my-children now shows both siblings from one login.
    const myChildren = await request(app)
      .get("/api/students/my-children")
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(myChildren.body.data.map((s: { _id: string }) => s._id)).toEqual(
      expect.arrayContaining([String(fixture.student._id), String(res.body.data._id)])
    );
  });

  it("creates a teacher login linked to an existing Staff profile", async () => {
    const { Staff } = await import("../src/models/Staff");
    const newTeacher = await Staff.create({
      tenantId: fixture.tenant._id,
      branchId: fixture.branch._id,
      employeeId: "EMP-TEST-2",
      name: "Second Teacher",
      category: "teaching",
      designation: "PGT",
      phone: "9444444444",
    });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        name: "Second Teacher",
        email: "second_teacher@test.school",
        password: "Password@123",
        role: "teacher",
        staffProfileId: newTeacher._id,
      });
    expect(res.status).toBe(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "second_teacher@test.school", password: "Password@123" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("teacher");
  });

  it("creating a parent login for an existing guardian links guardian.userId, so /my-children resolves", async () => {
    const guardian = await Guardian.create({
      tenantId: fixture.tenant._id,
      name: "Unlinked Guardian",
      relation: "Mother",
      phone: "9555555555",
      studentIds: [fixture.student._id],
      isPrimary: true,
    });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        name: "Unlinked Guardian",
        email: "unlinked_guardian@test.school",
        password: "Password@123",
        role: "parent",
        guardianProfileId: guardian._id,
      });
    expect(res.status).toBe(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "unlinked_guardian@test.school", password: "Password@123" });
    const myChildren = await request(app)
      .get("/api/students/my-children")
      .set("Authorization", `Bearer ${login.body.data.token}`);
    expect(myChildren.body.data).toHaveLength(1);
  });

  it("a School Admin can deactivate and reactivate a login", async () => {
    const create = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({ name: "Temp Accountant", email: "temp_acc@test.school", password: "Password@123", role: "accountant" });

    const deactivate = await request(app)
      .patch(`/api/users/${create.body.data.id}/deactivate`)
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(deactivate.status).toBe(200);

    const blockedLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "temp_acc@test.school", password: "Password@123" });
    expect(blockedLogin.status).toBe(401);

    await request(app).patch(`/api/users/${create.body.data.id}/reactivate`).set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    const okLogin = await request(app).post("/api/auth/login").send({ email: "temp_acc@test.school", password: "Password@123" });
    expect(okLogin.status).toBe(200);
  });

  it("a teacher cannot create logins for others", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ name: "Sneaky", email: "sneaky@test.school", password: "Password@123", role: "accountant" });
    expect(res.status).toBe(403);
  });
});
