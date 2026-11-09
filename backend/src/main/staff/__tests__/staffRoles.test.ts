import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { createSchool } from "../../../test/schools";
import { addClass, addSubject, addTeacher, auth, saveAllotments, timetableSchool } from "../../../test/timetable";
import { AuthToken } from "../../auth/models/AuthToken";
import { PasswordService } from "../../auth/services/password.service";
import { nameKeyOf } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { StaffMember } from "../models/StaffMember";
import { Teacher } from "../models/Teacher";

/**
 * The kinds of staff a school has besides teachers (2026-11-08): many roles, **Other** with a name of the school's own, what each signs
 * in as, and a staff member who **also teaches** (a vice principal who takes Maths): they are a Teacher too, from the moment the school
 * makes their login (the school gives the username and the password: there is no invitation for staff).
 */

const api = "/api/v1/staff/members";
const PASSWORD = "Staff@Desk1";
let counter = 0;
/** A username and the password every person here is given (the school makes both). */
const nextLogin = () => ({ username: `staff${++counter}_10`, password: PASSWORD });
const add = (token: string, body: object) => request(app).post(api).set(auth(token)).send({ login: nextLogin(), ...body });
const list = (token: string, query = "") => request(app).get(`${api}${query}`).set(auth(token));
const patch = (token: string, id: string, body: object) => request(app).patch(`${api}/${id}`).set(auth(token)).send(body);
const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
const login = (identifier: string, password = PASSWORD) => request(app).post("/api/v1/auth/login").send({ identifier, password });
const usernameOf = (res: request.Response) => res.body.data.login.username as string;
// Every teacher, the ones who have left too (the list shows only the active ones unless asked).
const teachers = async (token: string) => ((await request(app).get("/api/v1/staff/teachers?status=all").set(auth(token))).body.data.items as { id: string; name: string; isActive: boolean; login: { username: string } | null }[]);

const PERSON = { name: "Asha Rao", email: "asha.rao@school.example", mobile: "9876543210" };

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("the kinds of staff", () => {
  it("a school can have a vice principal, a librarian, a driver and the rest of the people who do not teach, each with its label", async () => {
    const s = await createSchool("Sunrise Public School");
    const labels: Record<string, string> = {
      vice_principal: "Vice principal",
      coordinator: "Coordinator",
      clerk: "Clerk / office staff",
      librarian: "Librarian",
      lab_assistant: "Lab assistant",
      counsellor: "Counsellor",
      nurse: "Nurse",
      it_support: "IT / computer support",
      transport: "Transport in-charge",
      driver: "Driver",
      security: "Security guard",
      peon: "Peon / attendant",
      housekeeping: "Housekeeping",
      warden: "Hostel warden",
    };
    let n = 0;
    for (const [role, label] of Object.entries(labels)) {
      const res = await add(s.token, { name: `Person ${++n}`, role });
      expect(res.status, role).toBe(201);
      expect(res.body.data, role).toMatchObject({ role, roleLabel: label, roleOther: null, alsoTeacher: false });
    }
    expect((await list(s.token)).body.data.items).toHaveLength(Object.keys(labels).length);
  });

  it("Other takes a role name of the school's own, which is the role's label; without a name it is refused", async () => {
    const s = await createSchool("Sunrise Public School");
    for (const roleOther of [undefined, "", "   ", "x".repeat(41)]) {
      const res = await add(s.token, { ...PERSON, role: "other", ...(roleOther !== undefined ? { roleOther } : {}) });
      expect(res.status, String(roleOther)).toBe(400);
      expect(details(res)[0].path, String(roleOther)).toBe("roleOther");
    }
    expect(await StaffMember.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await User.countDocuments({ tenantId: s.tenantId, role: "staff" })).toBe(0);

    const made = await add(s.token, { ...PERSON, role: "other", roleOther: "  Lab   technician " });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ role: "other", roleOther: "Lab technician", roleLabel: "Lab technician" });
    expect((await login(usernameOf(made))).body.data.user.roleLabel).toBe("Lab technician");
    expect((await list(s.token, "?role=other")).body.data.items.map((m: { name: string }) => m.name)).toEqual(["Asha Rao"]);
  });

  it("a role name is kept only for Other: any other role drops it, and changing to Other asks for it", async () => {
    const s = await createSchool("Sunrise Public School");
    const librarian = await add(s.token, { ...PERSON, role: "librarian", roleOther: "Something" });
    expect(librarian.body.data).toMatchObject({ roleLabel: "Librarian", roleOther: null });
    const id = librarian.body.data.id as string;
    const bare = await patch(s.token, id, { role: "other" });
    expect(bare.status).toBe(400);
    expect(details(bare)[0].path).toBe("roleOther");
    const named = await patch(s.token, id, { role: "other", roleOther: "Sports coach" });
    expect(named.body.data).toMatchObject({ role: "other", roleLabel: "Sports coach" });
    // The title the person is shown follows.
    expect((await login(usernameOf(librarian))).body.data.user.roleLabel).toBe("Sports coach");
    const back = await patch(s.token, id, { role: "clerk" });
    expect(back.body.data).toMatchObject({ role: "clerk", roleLabel: "Clerk / office staff", roleOther: null });
  });
});

describe("what each kind of staff signs in as", () => {
  it("a role with pages of its own keeps its login role; every other kind signs in as plain staff, with its own label on show", async () => {
    const s = await createSchool("Sunrise Public School");
    const expected: [string, Record<string, unknown>, string, string][] = [
      ["principal", {}, "principal", "Principal"],
      ["accountant", {}, "accountant", "Accountant"],
      ["receptionist", {}, "receptionist", "Receptionist"],
      ["management", {}, "management", "Management"],
      ["librarian", {}, "staff", "Librarian"],
      ["vice_principal", {}, "staff", "Vice principal"],
      ["other", { roleOther: "Lab technician" }, "staff", "Lab technician"],
    ];
    let n = 0;
    for (const [role, extra, loginRole, label] of expected) {
      const made = await add(s.token, { name: `Kind ${++n}`, role, ...extra });
      expect(made.status, role).toBe(201);
      const signed = await login(usernameOf(made));
      expect(signed.body.data.user, role).toMatchObject({ role: loginRole, roleLabel: label });
      expect((await User.findOne({ username: usernameOf(made) }).lean())?.role, role).toBe(loginRole);
    }
  });

  it("plain staff reaches the calendar and nothing of the people who run the school", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await add(s.token, { ...PERSON, role: "librarian" });
    const token = (await login(usernameOf(made))).body.data.accessToken as string;
    expect((await request(app).get("/api/v1/classroom/calendar?year=2026").set(auth(token))).status).not.toBe(403);
    expect((await list(token)).status).toBe(403);
    expect((await request(app).get("/api/v1/staff/teachers").set(auth(token))).status).toBe(403);
    expect((await request(app).get("/api/v1/academics/structure").set(auth(token))).status).toBe(403);
  });

  it("no staff login can ask for a reset link: the school sets their passwords, whatever their role", async () => {
    // The forgot-password email is for nobody the school made a login for (teachers and parents before, now staff).
    const s = await createSchool("Sunrise Public School");
    for (const [role, email] of [["principal", "p@school.example"], ["accountant", "a@school.example"], ["management", "m@school.example"], ["librarian", "l@school.example"]] as const) {
      await add(s.token, { name: `Who ${role}`, role, email });
    }
    for (const email of ["p@school.example", "a@school.example", "m@school.example", "l@school.example"]) {
      expect((await request(app).post("/api/v1/auth/forgot-password").send({ email })).status).toBe(200);
    }
    await PasswordService.idle();
    expect(await AuthToken.countDocuments({ type: "password_reset" })).toBe(0);
  });
});

describe("a staff member who also teaches", () => {
  const TEACHING = { name: "Meera Iyer", role: "management", email: "meera@school.example", mobile: "9876500001", gender: "Female", designation: "Coordinator", employeeCode: "st-07", address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" } };

  it("is a teacher of the school at once, with their details and the subjects, and signs in as a teacher (the staff role stays as their title)", async () => {
    const s = await createSchool("Sunrise Public School");
    const maths = await addSubject(s.token, "Mathematics");
    const res = await add(s.token, { ...TEACHING, alsoTeacher: true, subjectIds: [maths] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ role: "management", alsoTeacher: true, subjectIds: [maths], isTeacher: true });

    const teacher = await Teacher.findOne({ tenantId: s.tenantId, name: "Meera Iyer" }).lean();
    expect(teacher).toMatchObject({ mobile: "9876500001", email: "meera@school.example", employeeCode: "ST-07", designation: "Coordinator", gender: "Female", isActive: true });
    expect(teacher?.subjectIds.map(String)).toEqual([maths]);
    expect(teacher?.address).toMatchObject({ city: "Bhopal" });
    const user = await User.findOne({ username: usernameOf(res) }).lean();
    expect(user).toMatchObject({ role: "teacher", roleLabel: "Management" });
    expect(String(teacher?.userId)).toBe(String(user?._id));
    // The Teacher page shows them with the same login.
    expect((await teachers(s.token)).map((t) => [t.name, t.login?.username])).toEqual([["Meera Iyer", usernameOf(res)]]);

    // Their own pages are a teacher's.
    const signed = await login(usernameOf(res));
    expect(signed.body.data.user).toMatchObject({ role: "teacher", roleLabel: "Management" });
    const token = signed.body.data.accessToken as string;
    expect((await request(app).get("/api/v1/staff/teachers/me").set(auth(token))).body.data.name).toBe("Meera Iyer");
    expect((await request(app).get("/api/v1/classroom/my-classes").set(auth(token))).status).toBe(200);
    expect((await list(token)).status).toBe(403);
  });

  it("a Principal or an Accountant who also teaches keeps their own login, and is a teacher of the school without a teacher login", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await add(s.token, { ...TEACHING, role: "principal", alsoTeacher: true });
    expect(made.body.data).toMatchObject({ role: "principal", alsoTeacher: true, isTeacher: true });
    expect((await login(usernameOf(made))).body.data.user).toMatchObject({ role: "principal" });
    const teacher = await Teacher.findOne({ tenantId: s.tenantId, name: "Meera Iyer" }).lean();
    expect(teacher).toMatchObject({ userId: null, email: null, isActive: true });
    expect((await teachers(s.token)).map((t) => t.name)).toEqual(["Meera Iyer"]);
    // Still the principal: the staff pages are theirs.
    const token = (await login(usernameOf(made))).body.data.accessToken as string;
    expect((await list(token)).status).toBe(200);
  });

  it("is refused before anything is made when a teacher already has the mobile or the code, or a subject is not this school's", async () => {
    const s = await createSchool("Sunrise Public School");
    const other = await createSchool("Moonrise Public School");
    await addTeacher(s.token, "Old Teacher", { mobile: "9876500001", employeeCode: "ST-07" });
    const foreign = await addSubject(other.token, "Art");
    const mobile = await add(s.token, { ...TEACHING, employeeCode: "ST-99", alsoTeacher: true });
    expect(mobile.status).toBe(409);
    expect(details(mobile)[0].path).toBe("mobile");
    const code = await add(s.token, { ...TEACHING, mobile: "9876500002", alsoTeacher: true });
    expect(code.status).toBe(409);
    expect(details(code)[0].path).toBe("employeeCode");
    const subject = await add(s.token, { ...TEACHING, mobile: "9876500002", employeeCode: "ST-99", alsoTeacher: true, subjectIds: [foreign] });
    expect(subject.status).toBe(400);
    expect(details(subject)[0].path).toBe("subjectIds");
    // Nothing was made: only the old teacher is there, and no login.
    expect(await StaffMember.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect(await User.countDocuments({ tenantId: s.tenantId, role: { $in: ["teacher", "management"] } })).toBe(0);
    // Without teaching, the same mobile and code are only a staff member's.
    expect((await add(s.token, TEACHING)).status).toBe(201);
  });

  it("a username that is taken leaves no staff member, no teacher and no login behind", async () => {
    const s = await createSchool("Sunrise Public School");
    expect((await add(s.token, { name: "Plain Person", role: "librarian", login: { username: "taken_10", password: PASSWORD } })).status).toBe(201);
    const again = await add(s.token, { ...TEACHING, alsoTeacher: true, login: { username: "taken_10", password: PASSWORD } });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("USERNAME_TAKEN");
    expect(await StaffMember.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(0);
    expect(await User.countDocuments({ tenantId: s.tenantId, role: "teacher" })).toBe(0);
  });

  it("is made inactive with their teacher record, and active again with it; a login closes at once", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await add(s.token, { ...TEACHING, alsoTeacher: true });
    const off = await patch(s.token, made.body.data.id, { isActive: false });
    expect(off.body.data.status).toBe("inactive");
    expect((await teachers(s.token))[0].isActive).toBe(false);
    expect((await login(usernameOf(made))).status).toBe(403);
    const on = await patch(s.token, made.body.data.id, { isActive: true });
    expect(on.body.data.status).toBe("active");
    expect((await teachers(s.token))[0].isActive).toBe(true);
    expect((await login(usernameOf(made))).status).toBe(200);
  });

  it("cannot be made inactive while they still have classes: nothing changes, and the school is told to give them to someone else", async () => {
    const s = await timetableSchool("Sunrise Public School");
    const maths = await addSubject(s.token, "Mathematics");
    const klass = await addClass(s.token, "Class 5");
    const made = await add(s.token, { ...TEACHING, alsoTeacher: true });
    const teacherId = (await teachers(s.token))[0].id;
    expect((await saveAllotments(s.token, { classId: klass.id, sectionId: null }, [{ subjectId: maths, periodsPerWeek: 5, teacherId }])).status).toBe(200);
    const off = await patch(s.token, made.body.data.id, { isActive: false });
    expect(off.status).toBe(409);
    expect(off.body.code).toBe("TEACHER_HAS_CLASSES");
    expect((await request(app).get(`${api}/${made.body.data.id}`).set(auth(s.token))).body.data.status).toBe("active");
    expect((await login(usernameOf(made))).status).toBe(200);
  });

  it("made inactive on the Teacher page, they show as inactive in Staff too", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await add(s.token, { ...TEACHING, alsoTeacher: true });
    const teacherId = (await teachers(s.token))[0].id;
    expect((await request(app).patch(`/api/v1/staff/teachers/${teacherId}`).set(auth(s.token)).send({ isActive: false })).status).toBe(200);
    expect((await request(app).get(`${api}/${made.body.data.id}`).set(auth(s.token))).body.data.status).toBe("inactive");
  });
});

describe("changing who also teaches", () => {
  async function receptionist() {
    const s = await createSchool("Sunrise Public School");
    const made = await add(s.token, { ...PERSON, role: "receptionist" });
    return { s, id: made.body.data.id as string, username: usernameOf(made) };
  }

  it("for a person with no login yet it can be switched on and off freely; the login makes them a teacher", async () => {
    const s = await createSchool("Sunrise Public School");
    const made = await StaffMember.create({ tenantId: s.tenantId, name: "Ravi Menon", nameKey: nameKeyOf("Ravi Menon"), email: "ravi@school.example", role: "receptionist", status: "invited" });
    const id = made._id.toString();
    expect((await patch(s.token, id, { alsoTeacher: true })).body.data).toMatchObject({ alsoTeacher: true, isTeacher: false });
    expect((await patch(s.token, id, { alsoTeacher: false })).body.data).toMatchObject({ alsoTeacher: false });
    await patch(s.token, id, { alsoTeacher: true });
    expect(await Teacher.countDocuments({ tenantId: s.tenantId })).toBe(0);
    const given = await request(app).post(`${api}/${id}/login`).set(auth(s.token)).send({ username: "ravi.menon_52", password: PASSWORD });
    expect(given.status).toBe(201);
    expect(given.body.data).toMatchObject({ isTeacher: true, status: "active" });
    expect((await login("ravi.menon_52")).body.data.user.role).toBe("teacher");
    expect((await teachers(s.token)).map((t) => t.name)).toEqual(["Ravi Menon"]);
  });

  it("for a person who has a login it can be switched on (they become a teacher at once and sign in as one), but not off: they are made inactive as a teacher instead", async () => {
    const { s, id, username } = await receptionist();
    const maths = await addSubject(s.token, "Mathematics");
    const on = await patch(s.token, id, { alsoTeacher: true, subjectIds: [maths] });
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ alsoTeacher: true, isTeacher: true });
    expect((await User.findOne({ username }).lean())?.role).toBe("teacher");
    expect((await login(username)).body.data.user.role).toBe("teacher");
    expect((await Teacher.findOne({ tenantId: s.tenantId }).lean())?.subjectIds.map(String)).toEqual([maths]);
    const off = await patch(s.token, id, { alsoTeacher: false });
    expect(off.status).toBe(409);
    expect(off.body.code).toBe("STILL_A_TEACHER");
  });

  it("a change of name, mobile, designation or subjects reaches their teacher record too", async () => {
    const { s, id, username } = await receptionist();
    const maths = await addSubject(s.token, "Mathematics");
    await patch(s.token, id, { alsoTeacher: true });
    const res = await patch(s.token, id, { name: "Asha R. Rao", mobile: "9876511111", designation: "Head of maths", subjectIds: [maths] });
    expect(res.status).toBe(200);
    const teacher = await Teacher.findOne({ tenantId: s.tenantId }).lean();
    expect(teacher).toMatchObject({ name: "Asha R. Rao", mobile: "9876511111", designation: "Head of maths" });
    expect(teacher?.subjectIds.map(String)).toEqual([maths]);
    expect((await User.findOne({ username }).lean())?.name).toBe("Asha R. Rao");
  });

  it("a mobile another teacher has is refused on the change, and nothing is changed", async () => {
    const { s, id } = await receptionist();
    await patch(s.token, id, { alsoTeacher: true });
    await addTeacher(s.token, "Old Teacher", { mobile: "9876522222" });
    const res = await patch(s.token, id, { mobile: "9876522222" });
    expect(res.status).toBe(409);
    expect(details(res)[0].path).toBe("mobile");
    expect((await request(app).get(`${api}/${id}`).set(auth(s.token))).body.data.mobile).toBe("9876543210");
  });

  it("moving between a role with its own login and one without moves the teacher login with it", async () => {
    const { s, id, username } = await receptionist();
    await patch(s.token, id, { alsoTeacher: true });
    const userId = String((await User.findOne({ username }).lean())?._id);
    const teacher = async () => (await Teacher.findOne({ tenantId: s.tenantId }).lean())!;
    expect(String((await teacher()).userId)).toBe(userId);
    // To Principal: the login is the principal's again and the teacher record keeps no login.
    await patch(s.token, id, { role: "principal" });
    expect((await User.findOne({ username }).lean())?.role).toBe("principal");
    expect(await teacher()).toMatchObject({ userId: null, email: null });
    // Back to a role without pages of its own: a teacher login again.
    await patch(s.token, id, { role: "management" });
    expect((await User.findOne({ username }).lean())?.role).toBe("teacher");
    expect(String((await teacher()).userId)).toBe(userId);
    expect((await teacher()).email).toBe(PERSON.email);
  });
});
