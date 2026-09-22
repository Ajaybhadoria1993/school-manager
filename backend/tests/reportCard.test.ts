import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { Branch } from "../src/models/Branch";
import { FeeHead, FeeStructure } from "../src/models/Fee";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

async function createExamWithMarks(fixture: BaseFixture, marks: { internal: number; written: number }) {
  const exam = await request(app)
    .post("/api/exams")
    .set("Authorization", `Bearer ${fixture.principal.token}`)
    .send({
      academicYearId: fixture.academicYear._id,
      classId: fixture.classMaster._id,
      name: "Unit Test 1",
      examType: "unit_test",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
    });

  const examSubject = await request(app)
    .post(`/api/exams/${exam.body.data._id}/subjects`)
    .set("Authorization", `Bearer ${fixture.principal.token}`)
    .send({ subjectId: fixture.subject._id, maxInternal: 20, maxWritten: 80 });

  await request(app)
    .post(`/api/exams/subjects/${examSubject.body.data._id}/marks`)
    .set("Authorization", `Bearer ${fixture.teacher.token}`)
    .send({
      entries: [{ studentId: fixture.student._id, internalMarks: marks.internal, writtenMarks: marks.written, isAbsent: false }],
    });

  return exam.body.data._id as string;
}

describe("Report Cards", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
  });

  it("hides a draft report card from the parent, and reveals it once published", async () => {
    const examId = await createExamWithMarks(fixture, { internal: 18, written: 72 });

    const beforePublish = await request(app)
      .get(`/api/exams/${examId}/report-cards/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(beforePublish.status).toBe(403);

    const publish = await request(app)
      .post(`/api/exams/${examId}/report-cards/${fixture.student._id}/publish`)
      .set("Authorization", `Bearer ${fixture.principal.token}`);
    expect(publish.status).toBe(200);

    const afterPublish = await request(app)
      .get(`/api/exams/${examId}/report-cards/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(afterPublish.status).toBe(200);
    expect(afterPublish.body.data.totals).toEqual({ obtained: 90, max: 100, percentage: 90, grade: "A1" });
  });

  it("locks marks after submission and only lets a Principal reopen them", async () => {
    const exam = await request(app)
      .post("/api/exams")
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({
        academicYearId: fixture.academicYear._id,
        classId: fixture.classMaster._id,
        name: "Final",
        examType: "final",
        startDate: "2026-10-01",
        endDate: "2026-10-05",
      });
    const examSubject = await request(app)
      .post(`/api/exams/${exam.body.data._id}/subjects`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ subjectId: fixture.subject._id, maxInternal: 20, maxWritten: 80 });

    await request(app)
      .patch(`/api/exams/subjects/${examSubject.body.data._id}/submit`)
      .set("Authorization", `Bearer ${fixture.teacher.token}`);

    const blocked = await request(app)
      .post(`/api/exams/subjects/${examSubject.body.data._id}/marks`)
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ entries: [{ studentId: fixture.student._id, internalMarks: 10, writtenMarks: 50, isAbsent: false }] });
    expect(blocked.status).toBe(400);

    const teacherReopen = await request(app)
      .patch(`/api/exams/subjects/${examSubject.body.data._id}/reopen`)
      .set("Authorization", `Bearer ${fixture.teacher.token}`);
    expect(teacherReopen.status).toBe(403);

    const principalReopen = await request(app)
      .patch(`/api/exams/subjects/${examSubject.body.data._id}/reopen`)
      .set("Authorization", `Bearer ${fixture.principal.token}`);
    expect(principalReopen.status).toBe(200);
  });

  it("blocks a published report card from the parent while the hold-for-dues policy is on and fees are outstanding", async () => {
    const tuition = await FeeHead.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Tuition" });
    await FeeStructure.create({
      tenantId: fixture.tenant._id,
      branchId: fixture.branch._id,
      classId: fixture.classMaster._id,
      academicYearId: fixture.academicYear._id,
      name: "Standard",
      installments: [{ name: "Term 1", dueDate: new Date("2026-06-01"), items: [{ feeHeadId: tuition._id, amount: 10000 }] }],
    });
    await Branch.findByIdAndUpdate(fixture.branch._id, { "policies.holdReportCardForDues": true });

    const examId = await createExamWithMarks(fixture, { internal: 18, written: 72 });
    await request(app)
      .post(`/api/exams/${examId}/report-cards/${fixture.student._id}/publish`)
      .set("Authorization", `Bearer ${fixture.principal.token}`);

    const blocked = await request(app)
      .get(`/api/exams/${examId}/report-cards/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/outstanding/i);

    await request(app)
      .post("/api/fees/collect")
      .set("Authorization", `Bearer ${fixture.accountant.token}`)
      .send({ studentId: fixture.student._id, installmentName: "Term 1", amount: 10000, mode: "cash" });

    const unblocked = await request(app)
      .get(`/api/exams/${examId}/report-cards/${fixture.student._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(unblocked.status).toBe(200);
  });
});
