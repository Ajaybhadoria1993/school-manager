import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { User } from "../../users/models/User";

/**
 * Add teacher asks "is this username free?" while it is typed. A username is one on the whole platform (the login box has no school), so
 * the answer looks across every school; when it is taken the answer comes with free ones, each a number after the name, like
 * meena.singh_41. The answer says nothing else: not whose it is, not which school.
 */

const api = "/api/v1/staff/usernames/check";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const check = (token: string, username: string) => request(app).get(api).query({ username }).set(auth(token));
const PASSWORD = "Sch00l@Teach1";

/** Takes these usernames, as logins of some other school, without the cost of a real teacher each. */
async function take(usernames: string[]) {
  await User.insertMany(usernames.map((username) => ({ name: "Someone Else", username, passwordHash: "not-a-real-hash", role: "teacher", tenantId: new Types.ObjectId() })));
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("is this username free", () => {
  it("says yes for a username nobody has, and offers nothing", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await check(token, "meena.singh");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: true, suggestions: [] });
  });

  it("says no for a username a teacher of another school has, and gives free ones with a number after the name", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    expect(
      (await request(app).post("/api/v1/staff/teachers").set(auth(a.token)).send({ name: "Meena Singh", mobile: "9876543210", login: { username: "meena.singh", password: PASSWORD } })).status
    ).toBe(201);

    const res = await check(b.token, "meena.singh");
    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(false);
    const suggestions = res.body.data.suggestions as string[];
    expect(suggestions).toHaveLength(4);
    expect(new Set(suggestions).size).toBe(4);
    for (const s of suggestions) expect(s).toMatch(/^meena\.singh_\d{2}$/);
    expect(await User.countDocuments({ username: { $in: suggestions } })).toBe(0);
  });

  it("works from the name, whatever the capitals, and a number already at the end is not stacked: meena.singh_30 gives meena.singh_NN", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await take(["meena.singh_30"]);
    const res = await check(token, "Meena.Singh_30");
    expect(res.body.data.available).toBe(false);
    for (const s of res.body.data.suggestions as string[]) {
      expect(s).toMatch(/^meena\.singh_\d{2,3}$/);
      expect(s).not.toBe("meena.singh_30");
    }
  });

  it("only offers usernames that are free, even when most of the two-digit ones are gone", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const crowded = Array.from({ length: 88 }, (_, i) => `meena.singh_${10 + i}`);
    await take(["meena.singh", ...crowded]);
    const res = await check(token, "meena.singh");
    expect(res.body.data.available).toBe(false);
    const suggestions = res.body.data.suggestions as string[];
    expect(suggestions).toHaveLength(4);
    expect(await User.countDocuments({ username: { $in: suggestions } })).toBe(0);
    for (const s of suggestions) expect(s.length).toBeLessThanOrEqual(30);
  });

  it("keeps a long name inside the 30 letters a username can have", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const long = "a".repeat(30);
    await take([long]);
    const res = await check(token, long);
    expect(res.body.data.available).toBe(false);
    const suggestions = res.body.data.suggestions as string[];
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) expect(s).toMatch(/^[a-z][a-z0-9._]{2,29}$/);
  });

  it("refuses a username that could never be one, in words, before looking anything up", async () => {
    const { token } = await createSchool("Sunrise Public School");
    for (const username of ["ab", "9meena", "meena singh", "Meena@Singh"]) {
      const res = await check(token, username);
      expect(res.status, username).toBe(400);
      expect(res.body.details).toEqual([expect.objectContaining({ path: "username" })]);
    }
    expect((await request(app).get(api).set(auth(token))).status).toBe(400);
  });

  it("is for the people who run the school: a teacher and someone not signed in get no answer", async () => {
    const { tenantId } = await createSchool("Sunrise Public School");
    const teacher = await addColleague(tenantId, "teacher");
    expect((await check(teacher, "meena.singh")).status).toBe(403);
    expect((await request(app).get(api).query({ username: "meena.singh" })).status).toBe(401);
  });

  it("tells nothing but yes or no and the free ones: not whose the username is, not which school", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await take(["meena.singh"]);
    const res = await check(token, "meena.singh");
    expect(Object.keys(res.body.data).sort()).toEqual(["available", "suggestions"]);
    expect(JSON.stringify(res.body)).not.toMatch(/Someone|tenant|school|userId|role/i);
  });
});

describe("the username that is refused when a teacher is added", () => {
  it("is taken with the same kind of suggestions, each of them free", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const body = { name: "Meena Singh", mobile: "9876543210", login: { username: "meena.singh", password: PASSWORD } };
    expect((await request(app).post("/api/v1/staff/teachers").set(auth(a.token)).send(body)).status).toBe(201);

    const res = await request(app).post("/api/v1/staff/teachers").set(auth(b.token)).send({ ...body, name: "Another Meena", mobile: "9876500000" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("USERNAME_TAKEN");
    const message = res.body.details[0].message as string;
    expect(message).toMatch(/taken/i);
    const offered = message.match(/meena\.singh_\d{2,3}/g) ?? [];
    expect(offered.length).toBeGreaterThanOrEqual(2);
    expect(await User.countDocuments({ username: { $in: offered } })).toBe(0);
    expect((await request(app).post("/api/v1/staff/teachers").set(auth(b.token)).send({ ...body, name: "Another Meena", mobile: "9876500000", login: { username: offered[0], password: PASSWORD } })).status).toBe(201);
  });
});
