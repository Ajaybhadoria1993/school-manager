import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { addColleague, createSchool } from "../../../test/schools";
import { Student } from "../models/Student";

const api = "/api/v1/students";
const academics = "/api/v1/academics";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const YEAR = { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" };

/** Valid Aadhaar numbers (their last digit is the Verhoeff check digit). */
const AADHAAR = ["234567890124", "345678901238", "456789012341"];

async function school(name = "Sunrise Public School") {
  const s = await createSchool(name);
  await request(app).post(`${academics}/academic-years/initial`).set(auth(s.token)).send(YEAR);
  const class5 = (await request(app).post(`${academics}/classes`).set(auth(s.token)).send({ name: "Class 5", capacity: 2000, sectionCount: 0 })).body.data;
  const a = (await request(app).post(`${academics}/classes/${class5.id}/sections`).set(auth(s.token)).send({ name: "A", capacity: 40, room: "5A" })).body.data;
  return { ...s, class5: class5.id as string, a: a.id as string };
}

/** One row of a real import, to put a student in the school. */
const admit = async (s: { token: string; class5: string; a: string }, over: Record<string, unknown> = {}, mobile = "9876543210", admissionNumber?: string) => {
  const res = await request(app)
    .post(`${api}/import`)
    .set(auth(s.token))
    .send({
      dryRun: false,
      rows: [
        {
          row: 2,
          ...(admissionNumber ? { admissionNumber } : {}),
          student: {
            firstName: "Asha",
            lastName: "Verma",
            gender: "Female",
            dateOfBirth: "2016-05-14",
            admissionDate: "2026-06-01",
            address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
            previousSchool: { name: "Little Flower School" },
            classId: s.class5,
            sectionId: s.a,
            guardians: [{ name: "Ravi Verma", relation: "Father", isPrimary: true, mobile }],
            ...over,
          },
        },
      ],
    });
  expect(res.body.data.results[0], JSON.stringify(res.body)).toMatchObject({ ok: true });
  return res.body.data.results[0].student as { id: string; name: string; admissionNumber: string };
};

/** A row of a file as the screen sends it to be matched. */
const line = (n: number, over: Record<string, unknown> = {}) => ({ row: n, firstName: "Asha", lastName: "Verma", dateOfBirth: "2016-05-14", mobile: "9876543210", ...over });
const match = (token: string, rows: unknown[]) => request(app).post(`${api}/import/match`).set(auth(token)).send({ rows });
const found = (res: request.Response) => res.body.data.matches as { row: number; kind: string; student: Record<string, unknown> }[];
const kinds = (res: request.Response) => found(res).map((m) => [m.row, m.kind]);

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("which rows of a file are students the school already has", () => {
  it("finds the same student by name, date of birth and the parent's mobile, whatever the capitals and spaces, and says who and where", async () => {
    const s = await school();
    const asha = await admit(s);
    const res = await match(s.token, [line(2), line(3, { firstName: "  ASHA ", lastName: "verma  " })]);
    expect(res.status).toBe(200);
    expect(kinds(res)).toEqual([
      [2, "same"],
      [3, "same"],
    ]);
    expect(found(res)[0].student).toEqual({
      id: asha.id,
      name: "Asha Verma",
      admissionNumber: asha.admissionNumber,
      dateOfBirth: "2016-05-14",
      className: "Class 5",
      sectionName: "A",
      inactive: false,
    });
  });

  it("answers only for the rows that match: a new student has no entry, and nothing is written", async () => {
    const s = await school();
    await admit(s);
    const before = await Student.countDocuments({ tenantId: s.tenantId });
    const res = await match(s.token, [line(2), line(3, { firstName: "Meera", dateOfBirth: "2015-01-01", mobile: "9111111111" })]);
    expect(kinds(res)).toEqual([[2, "same"]]);
    expect(await Student.countDocuments({ tenantId: s.tenantId })).toBe(before);
  });

  it("two students with the same name are not the same student: another birthday, or another parent AND birthday", async () => {
    const s = await school();
    await admit(s);
    const res = await match(s.token, [
      // Same name, another birthday (and the same parent: a brother or sister with the same name does not happen, a cousin does).
      line(2, { dateOfBirth: "2014-03-02" }),
      // Same name, another birthday, another parent.
      line(3, { dateOfBirth: "2013-01-09", mobile: "9000000001" }),
    ]);
    expect(found(res)).toEqual([]);
  });

  it("twins and brothers (the same birthday and parent, another name) are not matches", async () => {
    const s = await school();
    await admit(s);
    const res = await match(s.token, [line(2, { firstName: "Esha" }), line(3, { firstName: "Kabir", dateOfBirth: "2019-02-02" })]);
    expect(found(res)).toEqual([]);
  });

  it("the same name and birthday with another parent's mobile (or none) is only a maybe: it may be a different child", async () => {
    const s = await school();
    const asha = await admit(s);
    const res = await match(s.token, [line(2, { mobile: "9000000001" }), line(3, { mobile: undefined }), line(4, { mobile: "" })]);
    expect(kinds(res)).toEqual([
      [2, "maybe"],
      [3, "maybe"],
      [4, "maybe"],
    ]);
    expect(found(res)[0].student).toMatchObject({ id: asha.id, name: "Asha Verma" });
  });

  it("a school's own admission number: the same child with a new mobile number is the same student; another child's number is 'number'", async () => {
    const s = await school();
    const asha = await admit(s, {}, "9876543210", "2019/45");
    const res = await match(s.token, [
      // The parent changed the number; the register's number and the child are the same.
      line(2, { mobile: "9000000001", admissionNumber: "2019/45" }),
      // The number is the register's own spelling: any case, extra spaces.
      line(3, { mobile: "9000000001", admissionNumber: " 2019/45 " }),
      // Somebody else is given this number.
      line(4, { firstName: "Meera", dateOfBirth: "2015-01-01", mobile: "9111111111", admissionNumber: "2019/45" }),
    ]);
    expect(kinds(res)).toEqual([
      [2, "same"],
      [3, "same"],
      [4, "number"],
    ]);
    expect(found(res)[2].student).toMatchObject({ id: asha.id, name: "Asha Verma", admissionNumber: "2019/45" });
  });

  it("an Aadhaar number is one child: the same child is the same student, another child with it is 'aadhaar'", async () => {
    const s = await school();
    await admit(s, { aadhaarNumber: AADHAAR[0] });
    const res = await match(s.token, [
      line(2, { mobile: "9000000001", aadhaarNumber: AADHAAR[0] }),
      // Typed with spaces, as on the card.
      line(3, { mobile: "9000000001", aadhaarNumber: "2345 6789 0124" }),
      line(4, { firstName: "Meera", dateOfBirth: "2015-01-01", mobile: "9111111111", aadhaarNumber: AADHAAR[0] }),
      // A number nobody has, and one that is not a number at all.
      line(5, { firstName: "Zoya", dateOfBirth: "2015-02-02", mobile: "9222222222", aadhaarNumber: AADHAAR[1] }),
      line(6, { firstName: "Neel", dateOfBirth: "2015-03-03", mobile: "9333333333", aadhaarNumber: "abc" }),
    ]);
    expect(kinds(res)).toEqual([
      [2, "same"],
      [3, "same"],
      [4, "aadhaar"],
    ]);
  });

  it("the same student wins over a number, an Aadhaar or a maybe that points at somebody else", async () => {
    const s = await school();
    const asha = await admit(s, { aadhaarNumber: AADHAAR[0] }, "9876543210", "2019/45");
    const meera = await admit(s, { firstName: "Meera", lastName: "Joshi", dateOfBirth: "2015-01-01", aadhaarNumber: AADHAAR[1] }, "9111111111", "2019/46");
    // Name, birthday and mobile are Asha's; the number is Meera's and the Aadhaar is Meera's.
    const res = await match(s.token, [line(2, { admissionNumber: "2019/46", aadhaarNumber: AADHAAR[1] })]);
    expect(found(res)).toHaveLength(1);
    expect(found(res)[0]).toMatchObject({ kind: "same", student: { id: asha.id } });
    // Meera's number on a row whose child is nobody here, but whose Aadhaar is Asha's: the number is the first reason.
    const clash = await match(s.token, [line(3, { firstName: "Zoya", dateOfBirth: "2012-12-12", mobile: "9444444444", admissionNumber: "2019/46", aadhaarNumber: AADHAAR[0] })]);
    expect(found(clash)[0]).toMatchObject({ kind: "number", student: { id: meera.id } });
  });

  it("finds an inactive student too, and says so (they are made active again, not admitted twice)", async () => {
    const s = await school();
    const asha = await admit(s);
    const off = await request(app).post(`${api}/deactivate`).set(auth(s.token)).send({ ids: [asha.id], reason: "Left" });
    expect(off.status).toBe(200);
    const res = await match(s.token, [line(2)]);
    expect(found(res)[0]).toMatchObject({ kind: "same", student: { id: asha.id, inactive: true } });
  });

  it("sees only this school's students: another school's Asha Verma is nobody here", async () => {
    const mine = await school("Sunrise Public School");
    const theirs = await school("Moonlight Public School");
    await admit(theirs, { aadhaarNumber: AADHAAR[0] }, "9876543210", "2019/45");
    const res = await match(mine.token, [line(2, { admissionNumber: "2019/45", aadhaarNumber: AADHAAR[0] })]);
    expect(found(res)).toEqual([]);
    // Their Asha is theirs: the school that has her finds her, mine does not.
    expect(kinds(await match(theirs.token, [line(2)]))).toEqual([[2, "same"]]);
  });

  it("is for the people who admit students: a teacher or an accountant is refused, and so is a visitor", async () => {
    const s = await school();
    expect((await match(await addColleague(s.tenantId, "teacher"), [line(2)])).status).toBe(403);
    expect((await match(await addColleague(s.tenantId, "accountant"), [line(2)])).status).toBe(403);
    expect((await request(app).post(`${api}/import/match`).send({ rows: [line(2)] })).status).toBe(401);
    expect((await match(await addColleague(s.tenantId, "principal"), [line(2)])).status).toBe(200);
  });

  it("checks what it is given: rows are a list of 1 to 1000, each with a row number, a name and a birthday", async () => {
    const s = await school();
    const details = (res: request.Response) => res.body.details as { path: string; message: string }[];
    expect((await match(s.token, [])).status).toBe(400);
    const tooMany = await match(s.token, Array.from({ length: 1001 }, (_, i) => line(i + 1)));
    expect(tooMany.status).toBe(400);
    expect(details(tooMany)).toEqual([{ path: "rows", message: "Send up to 1000 rows at a time" }]);
    const bad = await match(s.token, [line(2, { dateOfBirth: "14-05-2016" }), line(3, { firstName: "" }), { row: 0, firstName: "A", lastName: "B", dateOfBirth: "2016-05-14" }]);
    expect(bad.status).toBe(400);
    expect(details(bad).map((d) => d.path)).toEqual(["rows.0.dateOfBirth", "rows.1.firstName", "rows.2.row"]);
  });

  it("a whole file in one request: 1000 rows, the few that are already there found among them", async () => {
    const s = await school();
    await admit(s);
    const rows = Array.from({ length: 1000 }, (_, i) =>
      i === 499 ? line(i + 2) : line(i + 2, { firstName: `Kid${i}`, dateOfBirth: "2015-01-01", mobile: `90000${String(i).padStart(5, "0")}` })
    );
    const res = await match(s.token, rows);
    expect(res.status).toBe(200);
    expect(kinds(res)).toEqual([[501, "same"]]);
  });
});
