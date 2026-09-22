import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";
import { buildBaseFixture, PASSWORD } from "./helpers/fixtures";

describe("Auth", () => {
  it("logs in with correct credentials and rejects a wrong password", async () => {
    const fixture = await buildBaseFixture();

    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: fixture.schoolAdmin.user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.user.role).toBe("school_admin");

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: fixture.schoolAdmin.user.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("rejects requests with no token and with a garbage token", async () => {
    const noToken = await request(app).get("/api/students");
    expect(noToken.status).toBe(401);

    const badToken = await request(app).get("/api/students").set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });

  it("returns validation errors as 400, not 500", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
