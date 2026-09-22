import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("Certificates", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
  });

  it("issues a Bonafide certificate with a sequential serial number", async () => {
    const res = await request(app)
      .post("/api/certificates/bonafide")
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ studentId: fixture.student._id, purpose: "Passport application" });
    expect(res.status).toBe(201);
    expect(res.body.data.serialNumber).toBe("BONAFIDE-00001");
  });

  it("re-issuing a certificate retires the old serial (never reused) and links the two", async () => {
    const original = await request(app)
      .post("/api/certificates/bonafide")
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ studentId: fixture.student._id, purpose: "Bank account opening" });

    const reissued = await request(app)
      .post(`/api/certificates/${original.body.data._id}/reissue`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ purpose: "Corrected purpose text" });

    expect(reissued.status).toBe(201);
    expect(reissued.body.data.serialNumber).not.toBe(original.body.data.serialNumber);
    expect(reissued.body.data.supersedes).toBe(String(original.body.data._id));

    const originalAfter = await request(app)
      .get(`/api/certificates/${original.body.data._id}`)
      .set("Authorization", `Bearer ${fixture.principal.token}`);
    expect(originalAfter.body.data.status).toBe("superseded");
  });

  it("blocks Transfer Certificate issuance while the hold-for-dues policy is on and dues are outstanding", async () => {
    const { FeeHead, FeeStructure } = await import("../src/models/Fee");
    const { Branch } = await import("../src/models/Branch");
    const tuition = await FeeHead.create({ tenantId: fixture.tenant._id, branchId: fixture.branch._id, name: "Tuition" });
    await FeeStructure.create({
      tenantId: fixture.tenant._id,
      branchId: fixture.branch._id,
      classId: fixture.classMaster._id,
      academicYearId: fixture.academicYear._id,
      name: "Standard",
      installments: [{ name: "Term 1", dueDate: new Date("2026-06-01"), items: [{ feeHeadId: tuition._id, amount: 5000 }] }],
    });
    await Branch.findByIdAndUpdate(fixture.branch._id, { "policies.holdTCForDues": true });

    const blocked = await request(app)
      .post("/api/certificates/transfer")
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ studentId: fixture.student._id, reasonForLeaving: "Relocation", lastAttendanceDate: "2026-10-01", conduct: "Good" });
    expect(blocked.status).toBe(403);
  });

  it("a parent cannot view another family's certificate", async () => {
    const { buildSecondFamily } = await import("./helpers/fixtures");
    const other = await buildSecondFamily(fixture);

    const cert = await request(app)
      .post("/api/certificates/bonafide")
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ studentId: other.student._id, purpose: "Test" });

    const res = await request(app)
      .get(`/api/certificates/${cert.body.data._id}`)
      .set("Authorization", `Bearer ${fixture.parent.token}`);
    expect(res.status).toBe(403);
  });
});
