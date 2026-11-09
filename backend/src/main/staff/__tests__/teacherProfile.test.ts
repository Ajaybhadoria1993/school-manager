import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";

/** What the school keeps about a teacher beyond the name: who they are, their job, and where they live. */

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const post = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const one = (token: string, id: string) => request(app).get(`${api}/${id}`).set(auth(token));
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const pathsOf = (res: request.Response) => details(res).map((d) => d.path);

const FULL = {
  name: "Meena Singh",
  mobile: "9876543210",
  gender: "Female",
  dateOfBirth: "1988-07-14",
  address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  designation: "TGT",
  qualification: "M.Sc., B.Ed.",
  experienceYears: 9,
  joiningDate: "2019-06-17",
  employmentType: "full_time",
};

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a teacher's details", () => {
  it("keeps who they are, their job and their address, and gives the days back as written", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, FULL);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Meena Singh",
      gender: "Female",
      dateOfBirth: "1988-07-14",
      address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      designation: "TGT",
      qualification: "M.Sc., B.Ed.",
      experienceYears: 9,
      joiningDate: "2019-06-17",
      employmentType: "full_time",
    });
    expect((await one(token, res.body.data.id)).body.data).toEqual(res.body.data);
  });

  it("is happy with only a name: everything else is empty, and there is no login", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Dev Patel" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      gender: null,
      dateOfBirth: null,
      address: { line1: null, city: null, state: null, pincode: null },
      designation: null,
      qualification: null,
      experienceYears: null,
      joiningDate: null,
      employmentType: null,
      login: null,
    });
  });

  it("treats an empty box as not given", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Dev Patel", gender: "", dateOfBirth: "", designation: "  ", experienceYears: null, address: { pincode: "" } });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ gender: null, dateOfBirth: null, designation: null, experienceYears: null });
  });

  it("says what is wrong with each box, by the box", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, {
      name: "Dev Patel",
      gender: "Robot",
      dateOfBirth: "2015-01-01",
      joiningDate: "not a day",
      address: { pincode: "46200", state: "Atlantis" },
      experienceYears: -2,
      employmentType: "forever",
      designation: "x".repeat(61),
      qualification: "y".repeat(101),
    });
    expect(res.status).toBe(400);
    expect(pathsOf(res).sort()).toEqual(
      ["address.pincode", "address.state", "dateOfBirth", "designation", "employmentType", "experienceYears", "gender", "joiningDate", "qualification"].sort()
    );
  });

  it("holds a teacher to 18 to 75 years old, and not born in the future", async () => {
    const { token } = await createSchool("Sunrise Public School");
    for (const dateOfBirth of ["2030-01-01", "2012-05-05", "1940-01-01"]) {
      const res = await post(token, { name: "Dev Patel", dateOfBirth });
      expect(res.status, dateOfBirth).toBe(400);
      expect(pathsOf(res)).toEqual(["dateOfBirth"]);
    }
    expect((await post(token, { name: "Dev Patel", dateOfBirth: "1990-02-30" })).status).toBe(400);
  });

  it("lets a teacher join in the near future but not years from now", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const inMonths = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    expect((await post(token, { name: "Dev Patel", joiningDate: inMonths })).status).toBe(201);
    const res = await post(token, { name: "Dev Patel", joiningDate: "2099-01-01" });
    expect(res.status).toBe(400);
    expect(pathsOf(res)).toEqual(["joiningDate"]);
  });

  it("changes some details and leaves the others, and clears one with an empty box", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const id = (await post(token, FULL)).body.data.id as string;
    const res = await patch(token, id, { designation: "PGT", qualification: "", address: { city: "Indore" }, gender: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      designation: "PGT",
      qualification: null,
      gender: null,
      dateOfBirth: "1988-07-14",
      address: { line1: "12, MG Road", city: "Indore", state: "Madhya Pradesh", pincode: "462001" },
    });
  });
});

describe("who sees a teacher's details", () => {
  it("keeps a colleague's birthday, address and login name from the other teachers, who see the names", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const colleague = await addColleague(tenantId, "teacher");
    await post(token, { ...FULL, login: { username: "meena.singh", password: "Sch00l@Teach1" } });

    const asAdmin = (await request(app).get(api).set(auth(token))).body.data.items[0];
    expect(asAdmin).toMatchObject({ dateOfBirth: "1988-07-14", login: { username: "meena.singh", isActive: true } });

    const asTeacher = (await request(app).get(api).set(auth(colleague))).body.data.items[0];
    expect(asTeacher).toMatchObject({ name: "Meena Singh", designation: "TGT" });
    for (const private_ of ["dateOfBirth", "address", "login", "gender", "qualification", "joiningDate", "experienceYears"]) {
      expect(asTeacher, private_).not.toHaveProperty(private_);
    }
  });

  it("opens one teacher's whole page to the school admin and the principal only", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const principal = await addColleague(tenantId, "principal");
    const teacher = await addColleague(tenantId, "teacher");
    const id = (await post(token, FULL)).body.data.id as string;
    expect((await one(principal, id)).status).toBe(200);
    expect((await one(teacher, id)).status).toBe(403);
  });

  it("is a 404 for a teacher of another school, or no teacher", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const id = (await post(a.token, FULL)).body.data.id as string;
    expect((await one(b.token, id)).status).toBe(404);
    expect((await one(a.token, "64b7f0c2a1b2c3d4e5f60718")).status).toBe(404);
    expect((await one(a.token, "nope")).status).toBe(400);
  });
});
