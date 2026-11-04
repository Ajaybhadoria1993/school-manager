import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addClass, addSubject, addTeacher, addTiming, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { AuthToken } from "../../auth/models/AuthToken";
import { PasswordService } from "../../auth/services/password.service";

/**
 * A parent's login (2026-11-04, the user: "like the teacher's username and password, the school gives the parent one, and the parent sees
 * their child's record on the website, and later in the mobile app"). The login is the GUARDIAN's: one parent of two children has one
 * login and sees both, and nobody else's child.
 */

const PASSWORD = "Sch00l@Parent1";
const signIn = (identifier: string, password = PASSWORD) => request(app).post("/api/v1/auth/login").send({ identifier, password });
const makeLogin = (token: string, guardianId: string, username: string, password = PASSWORD) =>
  request(app).post(`/api/v1/students/guardians/${guardianId}/login`).set(auth(token)).send({ username, password });
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];

function admit(token: string, classId: string, sectionId: string | null, firstName: string, guardian: object) {
  return request(app)
    .post("/api/v1/students")
    .set(auth(token))
    .send({
      firstName,
      lastName: "Verma",
      gender: "Female",
      dateOfBirth: "2018-05-14",
      address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      previousSchool: { name: "Little Flower School" },
      classId,
      sectionId,
      guardians: [guardian],
    });
}

/** Ravi Verma has two children here (Asha in Class 5 - A, Dev in Class 1); Mira is another family's. */
async function family(name = "Sunrise Public School", mobile = "9000000001") {
  const s = await timetableSchool(name);
  const class5 = await addClass(s.token, "Class 5", ["A"]);
  const class1 = await addClass(s.token, "Class 1");
  const asha = (await admit(s.token, class5.id, class5.sections[0].id, "Asha", { name: "Ravi Verma", relation: "Father", isPrimary: true, mobile })).body.data;
  const fatherId = asha.guardians[0].id as string;
  const dev = (await admit(s.token, class1.id, null, "Dev", { guardianId: fatherId, name: "Ravi Verma", relation: "Father", isPrimary: true, mobile })).body.data;
  const mira = (await admit(s.token, class1.id, null, "Mira", { name: "Sita Rao", relation: "Mother", isPrimary: true, mobile: `9${mobile.slice(1, -1)}9` })).body.data;
  return { ...s, class5, class1, asha, dev, mira, fatherId, unitA: { classId: class5.id, sectionId: class5.sections[0].id } };
}

async function parentToken(s: { token: string; fatherId: string }, username = "ravi.verma_12") {
  await makeLogin(s.token, s.fatherId, username);
  return (await signIn(username)).body.data.accessToken as string;
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the school gives a parent a login", () => {
  it("makes it for a guardian: the student's page shows the username (never the password), and the parent signs in with it", async () => {
    const s = await family();
    const res = await makeLogin(s.token, s.fatherId, "ravi.verma_12");
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ guardianId: s.fatherId, login: { username: "ravi.verma_12", isActive: true } });

    for (const child of [s.asha, s.dev]) {
      const page = await request(app).get(`/api/v1/students/${child.id}`).set(auth(s.token));
      expect(page.body.data.guardians[0].login).toEqual({ username: "ravi.verma_12", isActive: true });
      expect(JSON.stringify(page.body)).not.toContain(PASSWORD);
    }
    const mira = await request(app).get(`/api/v1/students/${s.mira.id}`).set(auth(s.token));
    expect(mira.body.data.guardians[0].login).toBeNull();

    const session = await signIn("ravi.verma_12");
    expect(session.status).toBe(200);
    expect(session.body.data.user).toMatchObject({ name: "Ravi Verma", username: "ravi.verma_12", role: "parent", tenantId: s.tenantId });
  });

  it("refuses a username that is anybody's on the platform (with free ones), and a second login for the same parent", async () => {
    const s = await family();
    await addTeacher(s.token, "Dev Patel", { mobile: "9876500000", login: { username: "dev.patel", password: "Sch00l@Teach1" } });
    const taken = await makeLogin(s.token, s.fatherId, "dev.patel");
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("USERNAME_TAKEN");
    expect(details(taken)[0].path).toBe("username");
    expect(details(taken)[0].message).toMatch(/^This username is taken\. Try another, for example dev\.patel_\d+ or dev\.patel_\d+$/);

    expect((await makeLogin(s.token, s.fatherId, "ravi.verma_12")).status).toBe(201);
    const again = await makeLogin(s.token, s.fatherId, "ravi.verma_99");
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("GUARDIAN_HAS_LOGIN");
  });

  it("changes the username (the old one stops, the password stays) and gives a new password (the old one stops at once)", async () => {
    const s = await family();
    const old = await parentToken(s);
    const renamed = await request(app).patch(`/api/v1/students/guardians/${s.fatherId}/login`).set(auth(s.token)).send({ username: "ravi.v" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.login).toEqual({ username: "ravi.v", isActive: true });
    expect((await signIn("ravi.verma_12")).status).toBe(401);
    expect((await signIn("ravi.v")).status).toBe(200);

    const reset = await request(app).post(`/api/v1/students/guardians/${s.fatherId}/reset-password`).set(auth(s.token)).send({ password: "Sch00l@New22" });
    expect(reset.status).toBe(200);
    expect((await signIn("ravi.v")).status).toBe(401);
    expect((await signIn("ravi.v", "Sch00l@New22")).status).toBe(200);
    // The sessions of the old password are over.
    await new Promise((r) => setTimeout(r, 1100));
    expect((await request(app).get("/api/v1/parent/children").set(auth(old))).status).toBe(401);
  });

  it("says so when a guardian has no login to change", async () => {
    const s = await family();
    const rename = await request(app).patch(`/api/v1/students/guardians/${s.fatherId}/login`).set(auth(s.token)).send({ username: "ravi.v" });
    expect(rename.status).toBe(409);
    expect(rename.body.code).toBe("GUARDIAN_HAS_NO_LOGIN");
    const reset = await request(app).post(`/api/v1/students/guardians/${s.fatherId}/reset-password`).set(auth(s.token)).send({ password: "Sch00l@New22" });
    expect(reset.body.code).toBe("GUARDIAN_HAS_NO_LOGIN");
  });

  it("the guardian lookup (a brother's or sister's admission) says the parent already has a login", async () => {
    const s = await family();
    await makeLogin(s.token, s.fatherId, "ravi.verma_12");
    const found = await request(app).post("/api/v1/students/guardians/lookup").set(auth(s.token)).send({ mobile: "9000000001" });
    expect(found.body.data.guardian.login).toEqual({ username: "ravi.verma_12", isActive: true });
  });

  it("is for the people who run the school", async () => {
    const s = await family();
    const parent = await parentToken(s);
    expect((await makeLogin(parent, s.fatherId, "hacker_1")).status).toBe(403);
    expect((await request(app).get("/api/v1/students").set(auth(parent))).status).toBe(403);
    expect((await request(app).get(`/api/v1/students/${s.asha.id}`).set(auth(parent))).status).toBe(403);
    expect((await request(app).get("/api/v1/staff/teachers").set(auth(parent))).status).toBe(403);
  });
});

describe("a parent's login follows their children (2026-11-04: the user: a child who leaves, the parent cannot sign in)", () => {
  const deactivate = (token: string, ids: string[]) => request(app).post("/api/v1/students/deactivate").set(auth(token)).send({ ids, reason: "Left the school" });

  it("stays while one child is still here, closes when the last one is made inactive (the session too), and opens when a child comes back", async () => {
    const s = await family();
    const session = await parentToken(s);

    expect((await deactivate(s.token, [s.asha.id])).body.data.deactivated).toBe(1);
    expect((await signIn("ravi.verma_12")).status).toBe(200);
    expect((await request(app).get("/api/v1/parent/children").set(auth(session))).body.data.items.map((c: { name: string }) => c.name)).toEqual(["Dev Verma"]);

    // The last child leaves for another school.
    expect((await request(app).post(`/api/v1/students/${s.dev.id}/transfer-out`).set(auth(s.token)).send({ schoolName: "Moonrise Public School" })).status).toBe(200);
    const refused = await signIn("ravi.verma_12");
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("ACCOUNT_DISABLED");
    expect((await request(app).get("/api/v1/parent/children").set(auth(session))).status).toBe(403);
    const page = await request(app).get(`/api/v1/students/${s.asha.id}`).set(auth(s.token));
    expect(page.body.data.guardians[0].login).toEqual({ username: "ravi.verma_12", isActive: false });

    expect((await request(app).post("/api/v1/students/reactivate").set(auth(s.token)).send({ ids: [s.asha.id] })).body.data.reactivated).toBe(1);
    expect((await signIn("ravi.verma_12")).status).toBe(200);
  });

  it("another family's child leaving changes nothing for this parent", async () => {
    const s = await family();
    await parentToken(s);
    await deactivate(s.token, [s.mira.id]);
    expect((await signIn("ravi.verma_12")).status).toBe(200);
  });

  it("a login made for a parent whose children have all left is made closed", async () => {
    const s = await family();
    await deactivate(s.token, [s.asha.id, s.dev.id]);
    const made = await makeLogin(s.token, s.fatherId, "ravi.verma_12");
    expect(made.status).toBe(201);
    expect(made.body.data.login).toEqual({ username: "ravi.verma_12", isActive: false });
    expect((await signIn("ravi.verma_12")).status).toBe(403);
  });
});

describe("only the school sets a parent's password", () => {
  it("there is no way for the parent to reset it themselves (the forgot-password email is for the school's staff)", async () => {
    const s = await family();
    await parentToken(s);
    await request(app).patch(`/api/v1/students/guardians/${s.fatherId}`).set(auth(s.token)).send({ email: "ravi@family.example" });
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "ravi@family.example" });
    expect(res.status).toBe(200);
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(0);
  });
});

describe("what a signed-in parent sees", () => {
  it("their children (all of them, nobody else's), each with the class", async () => {
    const s = await family();
    const parent = await parentToken(s);
    const res = await request(app).get("/api/v1/parent/children").set(auth(parent));
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((c: { name: string; place: { label: string } | null }) => [c.name, c.place?.label])).toEqual([
      ["Asha Verma", "Class 5 - A"],
      ["Dev Verma", "Class 1"],
    ]);
    expect(res.body.data.parent).toEqual({ name: "Ravi Verma", school: "Sunrise Public School" });
  });

  it("one child's record: who they are, their class and class teacher, their parents and address; another family's child is not found", async () => {
    const s = await family();
    const meena = await addTeacher(s.token, "Meena Singh", { mobile: "9876543210" });
    await request(app).put("/api/v1/staff/class-teachers").set(auth(s.token)).send({ ...s.unitA, teacherId: meena });
    const parent = await parentToken(s);

    const res = await request(app).get(`/api/v1/parent/children/${s.asha.id}`).set(auth(parent));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: s.asha.id,
      name: "Asha Verma",
      admissionNumber: s.asha.admissionNumber,
      gender: "Female",
      dateOfBirth: "2018-05-14",
      place: { className: "Class 5", sectionName: "A", label: "Class 5 - A" },
      classTeacher: { name: "Meena Singh" },
      address: { line1: "12 MG Road", city: "Bhopal" },
      guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9000000001" }],
    });
    // Nothing of the school's own bookkeeping, and no logins.
    expect(res.body.data).not.toHaveProperty("moves");
    expect(res.body.data).not.toHaveProperty("custom");
    expect(res.body.data.guardians[0]).not.toHaveProperty("login");

    expect((await request(app).get(`/api/v1/parent/children/${s.mira.id}`).set(auth(parent))).status).toBe(404);
    expect((await request(app).get(`/api/v1/parent/children/${s.mira.id}/timetable`).set(auth(parent))).status).toBe(404);
  });

  it("the child's timetable only once the school publishes it: subjects, teachers' names, rooms and times, nothing else", async () => {
    const s = await family();
    await addTiming(s.token);
    const maths = await addSubject(s.token, "Mathematics");
    const meena = await addTeacher(s.token, "Meena Singh", { mobile: "9876543210" });
    await saveAllotments(s.token, s.unitA, [{ subjectId: maths, periodsPerWeek: 6, teacherId: meena }]);
    await request(app).put("/api/v1/timetable/grid").set(auth(s.token)).send({ ...s.unitA, cells: [{ day: 1, period: 1, lessons: [{ subjectId: maths, room: "Room 5A" }] }] });
    const parent = await parentToken(s);
    const url = `/api/v1/parent/children/${s.asha.id}/timetable`;

    const draft = await request(app).get(url).set(auth(parent));
    expect(draft.status).toBe(200);
    expect(draft.body.data).toBeNull();

    await request(app).post("/api/v1/timetable/grid/publish").set(auth(s.token)).send(s.unitA);
    const week = (await request(app).get(url).set(auth(parent))).body.data;
    expect(week.status).toBe("published");
    expect(week.days.map((d: { name: string }) => d.name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(week.cells).toEqual([{ day: 1, period: 1, lessons: [{ subjectId: maths, teacherId: null, room: "Room 5A" }] }]);
    expect(week.allotments).toEqual([expect.objectContaining({ subjectId: maths, subjectName: "Mathematics", periodsPerWeek: 6, teacherId: meena })]);
    expect(week.teachers).toEqual([{ id: meena, name: "Meena Singh" }]);
    for (const key of ["busy", "load", "issues"]) expect(week).not.toHaveProperty(key);
  });

  it("is only for parents, and a parent of another school sees nothing here", async () => {
    const s = await family();
    expect((await request(app).get("/api/v1/parent/children").set(auth(s.token))).status).toBe(403);
    const other = await family("Moonrise Public School", "9100000001");
    const theirs = await parentToken(other, "ravi.moon_10");
    expect((await request(app).get(`/api/v1/parent/children/${s.asha.id}`).set(auth(theirs))).status).toBe(404);
    expect((await request(app).get("/api/v1/parent/children").set(auth(theirs))).body.data.items.map((c: { name: string }) => c.name)).toEqual(["Asha Verma", "Dev Verma"]);
  });
});
