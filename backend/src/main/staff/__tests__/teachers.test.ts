import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Allotment } from "../../subjects/models/Allotment";
import { Teacher } from "../models/Teacher";

const api = "/api/v1/staff/teachers";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const get = (token: string, path = "") => request(app).get(`${api}${path}`).set(auth(token));
const post = (token: string, body: object) => request(app).post(api).set(auth(token)).send(body);
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);

const names = (res: request.Response) => res.body.data.items.map((t: { name: string }) => t.name);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const subject = async (token: string, name: string) => (await request(app).post("/api/v1/subjects").set(auth(token)).send({ name })).body.data.id as string;

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("teachers: who may use them", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get(api)).status).toBe(401);
  });

  it("lets the school admin and the principal change them, a teacher only look, and keeps the accountant out", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const principal = await addColleague(tenantId, "principal");
    const teacher = await addColleague(tenantId, "teacher");
    const accountant = await addColleague(tenantId, "accountant");
    expect((await post(token, { name: "Meena Singh" })).status).toBe(201);
    expect((await post(principal, { name: "Dev Patel" })).status).toBe(201);
    expect(names(await get(teacher))).toEqual(["Dev Patel", "Meena Singh"]);
    expect((await post(teacher, { name: "Sneaky" })).status).toBe(403);
    expect((await get(accountant)).status).toBe(403);
  });
});

describe("adding a teacher", () => {
  it("keeps what was given, in the form the school reads it, and starts with no days off and no limits", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const maths = await subject(token, "Mathematics");
    const res = await post(token, {
      name: "  Meena   Singh ",
      mobile: "+91 98765 43210",
      email: "Meena@School.Example",
      employeeCode: "emp-014",
      subjectIds: [maths],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Meena Singh",
      mobile: "9876543210",
      email: "meena@school.example",
      employeeCode: "EMP-014",
      subjectIds: [maths],
      maxPeriodsPerDay: null,
      maxPeriodsPerWeek: null,
      offDays: [],
      isActive: true,
      load: { sections: 0, periodsAllotted: 0 },
    });
  });

  it("needs only a name", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Meena Singh" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ mobile: null, email: null, employeeCode: null, subjectIds: [] });
  });

  it("says what is wrong with each box, by the box", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, {
      name: " ",
      mobile: "12345",
      email: "nope",
      employeeCode: "a b <c>",
      maxPeriodsPerDay: 0,
      maxPeriodsPerWeek: 200,
      offDays: [1, 1, 9],
    });
    expect(res.status).toBe(400);
    const by = Object.fromEntries(details(res).map((d) => [d.path.split(".")[0], d.message]));
    expect(by.name).toBe("Enter the teacher's name");
    expect(by.mobile).toBe("Enter a 10-digit mobile number starting with 6, 7, 8 or 9");
    expect(by.email).toBe("Enter a valid email address");
    expect(by.employeeCode).toBe("The employee code is letters, digits and - only, up to 20");
    expect(by.maxPeriodsPerDay).toBe("A teacher can take 1 to 12 periods a day");
    expect(by.maxPeriodsPerWeek).toBe("A teacher can take 1 to 70 periods a week");
    expect(by.offDays).toBeDefined();
  });

  it("refuses a teacher who is off on all seven days", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const res = await post(token, { name: "Never Here", offDays: [1, 2, 3, 4, 5, 6, 7] });
    expect(res.status).toBe(400);
    expect(details(res)[0]).toEqual({ path: "offDays", message: "A teacher cannot be off on every day" });
  });

  it("refuses a mobile number or an employee code another teacher of the school has, and lets another school use them", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    await post(a.token, { name: "Meena Singh", mobile: "9876543210", employeeCode: "T-1" });
    const mobile = await post(a.token, { name: "Someone Else", mobile: "09876543210" });
    expect(mobile.status).toBe(409);
    expect(mobile.body.code).toBe("TEACHER_MOBILE_EXISTS");
    expect(details(mobile)).toEqual([{ path: "mobile", message: "Meena Singh already has this mobile number" }]);
    const code = await post(a.token, { name: "Someone Else", employeeCode: "t-1" });
    expect(code.status).toBe(409);
    expect(code.body.code).toBe("TEACHER_CODE_EXISTS");
    expect(details(code)[0].path).toBe("employeeCode");
    expect((await post(b.token, { name: "Meena Singh", mobile: "9876543210", employeeCode: "T-1" })).status).toBe(201);
  });

  it("lets two teachers have the same name (it happens)", async () => {
    const { token } = await createSchool("Sunrise Public School");
    expect((await post(token, { name: "Sunita Sharma" })).status).toBe(201);
    expect((await post(token, { name: "Sunita Sharma" })).status).toBe(201);
  });

  it("only takes subjects of the school", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const others = await subject(b.token, "Hindi");
    const res = await post(a.token, { name: "Meena Singh", subjectIds: [others] });
    expect(res.status).toBe(400);
    expect(details(res)).toEqual([{ path: "subjectIds", message: "Choose subjects from your school's list" }]);
  });
});

describe("the list", () => {
  it("is in alphabetical order, active first, and can be searched by name, mobile or employee code", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, { name: "Meena Singh", mobile: "9876543210", employeeCode: "T-1" });
    await post(token, { name: "Dev Patel", employeeCode: "T-2" });
    const gone = (await post(token, { name: "Anil Rao" })).body.data;
    await patch(token, gone.id, { isActive: false });

    expect(names(await get(token))).toEqual(["Dev Patel", "Meena Singh"]);
    expect(names(await get(token, "?status=inactive"))).toEqual(["Anil Rao"]);
    expect(names(await get(token, "?status=all"))).toEqual(["Anil Rao", "Dev Patel", "Meena Singh"]);
    expect(names(await get(token, "?search=meena"))).toEqual(["Meena Singh"]);
    expect(names(await get(token, "?search=98765"))).toEqual(["Meena Singh"]);
    expect(names(await get(token, "?search=t-2"))).toEqual(["Dev Patel"]);
  });

  it("shows how many sections each teaches this year and how many periods a week they were given", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const year = (
      await request(app).post("/api/v1/academics/academic-years/initial").set(auth(token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" })
    ).body.data;
    const maths = await subject(token, "Mathematics");
    const teacher = (await post(token, { name: "Meena Singh" })).body.data;
    const row = (periods: number) => ({
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: new Types.ObjectId(year.id),
      classId: new Types.ObjectId(),
      sectionId: new Types.ObjectId(),
      subjectId: new Types.ObjectId(maths),
      periodsPerWeek: periods,
      teacherId: new Types.ObjectId(teacher.id),
    });
    await Allotment.create([row(6), row(5)]);
    expect((await get(token)).body.data.items[0].load).toEqual({ sections: 2, periodsAllotted: 11 });
  });
});

describe("changing a teacher", () => {
  it("changes some boxes and leaves the others, and clears an optional box with an empty one", async () => {
    const { token } = await createSchool("Sunrise Public School");
    const t = (await post(token, { name: "Meena Singh", mobile: "9876543210", email: "m@school.example", maxPeriodsPerDay: 6, offDays: [6] })).body.data;
    const res = await patch(token, t.id, { name: "Meena S. Singh", mobile: "", email: null, maxPeriodsPerDay: null, offDays: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Meena S. Singh", mobile: null, email: null, maxPeriodsPerDay: null, offDays: [] });
    expect((await patch(token, t.id, {})).status).toBe(400);
  });

  it("refuses another teacher's mobile when changing, but not its own", async () => {
    const { token } = await createSchool("Sunrise Public School");
    await post(token, { name: "Meena Singh", mobile: "9876543210" });
    const dev = (await post(token, { name: "Dev Patel", mobile: "9876543211" })).body.data;
    expect((await patch(token, dev.id, { mobile: "9876543210" })).status).toBe(409);
    expect((await patch(token, dev.id, { mobile: "9876543211", name: "Dev P" })).status).toBe(200);
  });

  it("will not make a teacher inactive while a class is given to them, and says how many; free, they can leave and return", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    const year = (
      await request(app).post("/api/v1/academics/academic-years/initial").set(auth(token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" })
    ).body.data;
    const maths = await subject(token, "Mathematics");
    const teacher = (await post(token, { name: "Meena Singh" })).body.data;
    await Allotment.create({
      tenantId: new Types.ObjectId(tenantId),
      academicYearId: new Types.ObjectId(year.id),
      classId: new Types.ObjectId(),
      sectionId: new Types.ObjectId(),
      subjectId: new Types.ObjectId(maths),
      periodsPerWeek: 6,
      teacherId: new Types.ObjectId(teacher.id),
    });
    const refused = await patch(token, teacher.id, { isActive: false });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("TEACHER_HAS_CLASSES");
    expect(refused.body.message).toBe("Meena Singh teaches 1 section this year (6 periods a week). Give those classes to another teacher first.");
    await Allotment.deleteMany({ tenantId });
    expect((await patch(token, teacher.id, { isActive: false })).body.data.isActive).toBe(false);
    expect((await patch(token, teacher.id, { isActive: true })).body.data.isActive).toBe(true);
  });

  it("is a 404 for a teacher of another school or none, before the body is read", async () => {
    const a = await createSchool("Sunrise Public School");
    const b = await createSchool("Moonrise Public School");
    const t = (await post(a.token, { name: "Meena Singh" })).body.data;
    expect((await patch(b.token, t.id, { nope: 1 })).status).toBe(404);
    expect((await patch(a.token, "not-an-id", { name: "x" })).status).toBe(400);
  });
});

describe("limits", () => {
  it("holds a school to 300 teachers", async () => {
    const { tenantId, token } = await createSchool("Sunrise Public School");
    await Teacher.insertMany(Array.from({ length: 300 }, (_, i) => ({ tenantId: new Types.ObjectId(tenantId), name: `Teacher ${i}`, nameKey: `teacher ${i}` })));
    const over = await post(token, { name: "One too many" });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe("LIMIT_REACHED");
  }, 60_000);
});
