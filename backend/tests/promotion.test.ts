import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { ClassMaster, Section } from "../src/models/ClassSection";
import { FeeHead, FeeStructure } from "../src/models/Fee";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("Academic Year Rollover / Promotion", () => {
  let fixture: BaseFixture;
  let nextClass: InstanceType<typeof ClassMaster>;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
    nextClass = await ClassMaster.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Class 7", order: 1 });
    await Section.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, classId: nextClass._id, name: "A" });
  });

  it("promotes a student into the matching section of the target class and records history", async () => {
    const newYear = await request(app)
      .post("/api/academic-years")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({ branchId: fixture.branch._id, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", terms: [] });

    const promote = await request(app)
      .post("/api/academics/promote")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        fromAcademicYearId: fixture.academicYear._id,
        toAcademicYearId: newYear.body.data._id,
        classMapping: [{ fromClassId: fixture.classMaster._id, toClassId: nextClass._id }],
      });
    expect(promote.status).toBe(200);
    expect(promote.body.data.promoted).toBe(1);

    const student = await request(app)
      .get(`/api/students/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(student.body.data.classId._id).toBe(String(nextClass._id));
    expect(student.body.data.promotionHistory).toHaveLength(1);
    expect(String(student.body.data.promotionHistory[0].classId)).toBe(String(fixture.classMaster._id));
  });

  it("marks a student alumni when its class maps to null (graduating class)", async () => {
    const newYear = await request(app)
      .post("/api/academic-years")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({ branchId: fixture.branch._id, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", terms: [] });

    const promote = await request(app)
      .post("/api/academics/promote")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        fromAcademicYearId: fixture.academicYear._id,
        toAcademicYearId: newYear.body.data._id,
        classMapping: [{ fromClassId: fixture.classMaster._id, toClassId: null }],
      });
    expect(promote.body.data.graduated).toBe(1);

    const student = await request(app)
      .get(`/api/students/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`);
    expect(student.body.data.status).toBe("alumni");
  });

  it("keeps a promoted student's prior-year dues visible in the outstanding report", async () => {
    const tuition = await FeeHead.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Tuition" });
    await FeeStructure.create({
      tenantId: fixture.tenant._id,
      branchId: fixture.branch._id,
      classId: fixture.classMaster._id,
      academicYearId: fixture.academicYear._id,
      name: "Standard",
      installments: [{ name: "Term 1", dueDate: new Date("2026-06-01"), items: [{ feeHeadId: tuition._id, amount: 10000 }] }],
    });

    await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 3000, mode: "cash" });

    const newYear = await request(app)
      .post("/api/academic-years")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({ branchId: fixture.branch._id, name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31", terms: [] });

    await request(app)
      .post("/api/academics/promote")
      .set("Authorization", `Bearer ${fixture.schoolAdmin.token}`)
      .send({
        fromAcademicYearId: fixture.academicYear._id,
        toAcademicYearId: newYear.body.data._id,
        classMapping: [{ fromClassId: fixture.classMaster._id, toClassId: nextClass._id }],
      });

    const outstanding = await request(app)
      .get("/api/fees/reports/outstanding")
      .set("Authorization", `Bearer ${fixture.accountant.token}`);
    const row = outstanding.body.data.find((r: { studentId: string }) => r.studentId === String(fixture.student._id));
    expect(row).toBeDefined();
    expect(row.outstanding).toBe(7000);
    expect(row.carriedForwardFromPriorYear).toBe(true);
  });
});
