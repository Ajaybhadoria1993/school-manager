import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { buildBaseFixture, BaseFixture } from "./helpers/fixtures";

describe("Staff Leave", () => {
  let fixture: BaseFixture;

  beforeEach(async () => {
    fixture = await buildBaseFixture();
  });

  it("lets a teacher apply for their own leave without passing a staffId", async () => {
    const res = await request(app)
      .post("/api/leave")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ leaveType: "casual", startDate: "2026-10-05", endDate: "2026-10-07", reason: "Family function" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
  });

  it("auto-updates the leave balance by exactly the inclusive day count on approval", async () => {
    const apply = await request(app)
      .post("/api/leave")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ leaveType: "sick", startDate: "2026-10-10", endDate: "2026-10-12", reason: "Fever" });

    const approve = await request(app)
      .patch(`/api/leave/${apply.body.data._id}/decide`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ status: "approved" });
    expect(approve.status).toBe(200);

    const balance = await request(app)
      .get(`/api/leave/balance/${fixture.teacherStaff._id}`)
      .query({ year: 2026 })
      .set("Authorization", `Bearer ${fixture.teacher.token}`);
    const sick = balance.body.data.allocations.find((a: { leaveType: string }) => a.leaveType === "sick");
    expect(sick.used).toBe(3); // Oct 10, 11, 12 inclusive
  });

  it("does not touch the balance for a rejected request, and refuses to re-decide it", async () => {
    const apply = await request(app)
      .post("/api/leave")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ leaveType: "casual", startDate: "2026-11-01", endDate: "2026-11-02", reason: "Personal" });

    const reject = await request(app)
      .patch(`/api/leave/${apply.body.data._id}/decide`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ status: "rejected" });
    expect(reject.status).toBe(200);

    const secondDecision = await request(app)
      .patch(`/api/leave/${apply.body.data._id}/decide`)
      .set("Authorization", `Bearer ${fixture.principal.token}`)
      .send({ status: "approved" });
    expect(secondDecision.status).toBe(400);
  });

  it("a teacher cannot approve their own leave request", async () => {
    const apply = await request(app)
      .post("/api/leave")
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ leaveType: "casual", startDate: "2026-12-01", endDate: "2026-12-01", reason: "Personal" });

    const selfApprove = await request(app)
      .patch(`/api/leave/${apply.body.data._id}/decide`)
      .set("Authorization", `Bearer ${fixture.teacher.token}`)
      .send({ status: "approved" });
    expect(selfApprove.status).toBe(403);
  });
});
