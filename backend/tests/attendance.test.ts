import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("Attendance", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
  });

  it("marks a student absent and computes the monthly percentage on read", async () => {
    const today = new Date();
    const mark = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({
        branchId: fixture.branch._id,
        academicYearId: fixture.academicYear._id,
        classId: fixture.classMaster._id,
        sectionId: fixture.section._id,
        date: today.toISOString(),
        entries: [{ studentId: fixture.student._id, status: "absent" }],
      });
    expect(mark.status).toBe(201);

    const summary = await request(app)
      .get(`/api/attendance/student/${fixture.student._id}/summary`)
      .query({ month: today.getMonth() + 1, year: today.getFullYear() })
      .set("Authorization", `Bearer ${fixture.teacher.token}`);
    expect(summary.body.data.absent).toBe(1);
    expect(summary.body.data.percentage).toBe(0);
  });

  it("recalculates the percentage immediately after a correction, without a separate job", async () => {
    const today = new Date();
    const mark = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({
        branchId: fixture.branch._id,
        academicYearId: fixture.academicYear._id,
        classId: fixture.classMaster._id,
        sectionId: fixture.section._id,
        date: today.toISOString(),
        entries: [{ studentId: fixture.student._id, status: "absent" }],
      });
    const recordId = mark.body.data[0]._id;

    const correction = await request(app)
      .patch(`/api/attendance/${recordId}/correct`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ status: "present", correctionNote: "Teacher marked wrong student by mistake" });
    expect(correction.status).toBe(200);

    const summary = await request(app)
      .get(`/api/attendance/student/${fixture.student._id}/summary`)
      .query({ month: today.getMonth() + 1, year: today.getFullYear() })
      .set("Authorization", `Bearer ${fixture.teacher.token}`);
    expect(summary.body.data.present).toBe(1);
    expect(summary.body.data.percentage).toBe(100);
  });

  it("rejects a teacher trying to correct attendance (Admin/Principal only)", async () => {
    const today = new Date();
    const mark = await request(app)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({
        branchId: fixture.branch._id,
        academicYearId: fixture.academicYear._id,
        classId: fixture.classMaster._id,
        sectionId: fixture.section._id,
        date: today.toISOString(),
        entries: [{ studentId: fixture.student._id, status: "absent" }],
      });
    const recordId = mark.body.data[0]._id;

    const correction = await request(app)
      .patch(`/api/attendance/${recordId}/correct`)
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ status: "present", correctionNote: "trying to self-correct" });
    expect(correction.status).toBe(403);
  });
});
