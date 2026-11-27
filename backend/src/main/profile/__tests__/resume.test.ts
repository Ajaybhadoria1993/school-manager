import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool, LOGIN_PASSWORD, signInAs } from "../../../test/classroom";
import { emailOf, postStaff } from "../../../test/logins";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { TeacherResume } from "../models/TeacherResume";

/**
 * A teacher's resume (docs/profiles.md): optional, a PDF or Word file. The school uploads it with Add teacher or later, the teacher can
 * replace their own, and it is downloaded only by someone who may see the teacher.
 */

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 1)]);
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 1)]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....[Content_Types].xml....word/document.xml....")]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....photos/me.jpg....")]);

const of = (id: string) => `/api/v1/staff/teachers/${id}/resume`;
const MINE = "/api/v1/profile/resume";
const get = (path: string, token: string) => request(app).get(path).set(auth(token));
const put = (path: string, token: string, file = PDF, name = "meena-resume.pdf") => request(app).put(path).set(auth(token)).attach("resume", file, name);
const del = (path: string, token: string) => request(app).delete(path).set(auth(token));
const download = (path: string, token: string) =>
  get(`${path}/file`, token)
    .buffer(true)
    .parse((res, done) => {
      const parts: Buffer[] = [];
      res.on("data", (part: Buffer) => parts.push(part));
      res.on("end", () => done(null, Buffer.concat(parts)));
    });

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a teacher's resume on the school's pages", () => {
  it("none to begin with; uploaded, it says its name and size, and is downloaded as it was sent", async () => {
    const s = await classroomSchool();
    expect((await get(of(s.meena), s.token)).body.data).toEqual({ resume: null });
    const saved = await put(of(s.meena), s.token);
    expect(saved.status).toBe(200);
    expect(saved.body.data.resume).toEqual({ name: "meena-resume.pdf", size: PDF.length, uploadedAt: expect.any(String) });
    const file = await download(of(s.meena), s.token);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.headers["content-disposition"]).toContain("meena-resume.pdf");
    expect(file.headers["cache-control"]).toBe("no-store");
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
  });

  it.each([
    ["Word (old)", DOC, "cv.doc", "application/msword"],
    ["Word", DOCX, "cv.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["PDF under another name", PDF, "cv.bin", "application/pdf"],
  ])("takes %s and serves it as what it really is", async (_what, file, name, type) => {
    const s = await classroomSchool();
    expect((await put(of(s.meena), s.token, file, name)).status).toBe(200);
    const got = await download(of(s.meena), s.token);
    expect(got.headers["content-type"]).toBe(type);
    // The name ends as the file really is, so the computer opens it with the right program.
    expect((await get(of(s.meena), s.token)).body.data.resume.name).toMatch(type === "application/pdf" ? /\.pdf$/ : type === "application/msword" ? /\.doc$/ : /\.docx$/);
  });

  it("refuses what is not a PDF or Word file, a big one and no file", async () => {
    const s = await classroomSchool();
    for (const [file, name] of [[Buffer.from("MZ a program"), "cv.pdf"], [ZIP, "cv.docx"], [Buffer.from("<html><script>1</script>"), "cv.html"]] as const) {
      const res = await put(of(s.meena), s.token, file, name);
      expect(res.status, name).toBe(400);
      expect(res.body.code).toBe("RESUME_NOT_DOCUMENT");
    }
    const big = await put(of(s.meena), s.token, Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024, 1)]));
    expect(big.body.code).toBe("RESUME_TOO_BIG");
    expect(big.body.message).toBe("The resume is bigger than 2 MB. Choose a smaller file.");
    expect((await request(app).put(of(s.meena)).set(auth(s.token))).body.code).toBe("RESUME_MISSING");
    expect(await TeacherResume.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });

  it("a new one replaces the old one; it can be taken away", async () => {
    const s = await classroomSchool();
    await put(of(s.meena), s.token);
    await put(of(s.meena), s.token, DOCX, "new.docx");
    expect(await TeacherResume.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect((await get(of(s.meena), s.token)).body.data.resume.name).toBe("new.docx");
    expect((await del(of(s.meena), s.token)).body.data).toEqual({ resume: null });
    expect((await download(of(s.meena), s.token)).status).toBe(404);
  });

  it("is not for another teacher or a parent; only add gives one where there is none", async () => {
    const s = await classroomSchool();
    await put(of(s.meena), s.token);
    for (const token of [s.tokens.dev, s.tokens.ravi]) {
      expect((await get(of(s.meena), token)).status).toBe(403);
      expect((await download(of(s.meena), token)).status).toBe(403);
      expect((await put(of(s.meena), token)).status).toBe(403);
      expect((await del(of(s.meena), token)).status).toBe(403);
    }
    const made = await postStaff(s.token, { name: "Rita Das", role: "receptionist", login: { username: "sun.rita", password: LOGIN_PASSWORD } });
    expect(made.status).toBe(201);
    await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["teachers.view", "teachers.add"] });
    const rita = await signInAs(emailOf("sun.rita"));
    expect((await put(of(s.dev), rita)).status).toBe(200);
    expect((await put(of(s.dev), rita)).status).toBe(403);
    expect((await del(of(s.dev), rita)).status).toBe(403);
    expect((await download(of(s.dev), rita)).status).toBe(200);
    expect((await put(of(s.kiran), await addColleague(s.tenantId, "principal"))).status).toBe(200);
  });

  it("says not found for a teacher who is not there", async () => {
    const s = await classroomSchool();
    const res = await put(of("64b000000000000000000001"), s.token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TEACHER_NOT_FOUND");
  });
});

describe("a teacher's own resume", () => {
  it("is the one the school sees: either replaces it", async () => {
    const s = await classroomSchool();
    expect((await get(MINE, s.tokens.meena)).body.data).toEqual({ resume: null });
    await put(MINE, s.tokens.meena);
    expect((await get(of(s.meena), s.token)).body.data.resume.name).toBe("meena-resume.pdf");
    await put(of(s.meena), s.token, DOCX, "from-school.docx");
    expect((await get(MINE, s.tokens.meena)).body.data.resume.name).toBe("from-school.docx");
    expect((await download(MINE, s.tokens.meena)).status).toBe(200);
    await del(MINE, s.tokens.meena);
    expect((await get(of(s.meena), s.token)).body.data.resume).toBeNull();
  });

  it("is kept for a staff member who also teaches, from either record", async () => {
    const s = await classroomSchool();
    const made = await postStaff(s.token, { name: "Vik Nair", role: "management", alsoTeacher: true, subjectIds: [s.maths], mobile: "9811122233", login: { username: "sun.vik", password: LOGIN_PASSWORD } });
    expect(made.status).toBe(201);
    const token = await signInAs(emailOf("sun.vik"));
    await put(MINE, token);
    const teacher = (await get("/api/v1/staff/teachers", s.token)).body.data.items.find((t: { name: string }) => t.name === "Vik Nair") as { id: string };
    expect((await get(of(teacher.id), s.token)).body.data.resume.name).toBe("meena-resume.pdf");
  });

  it("only someone who teaches has one", async () => {
    const s = await classroomSchool();
    const res = await put(MINE, s.token);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TEACHER_NOT_FOUND");
    expect((await get(MINE, s.tokens.ravi)).status).toBe(403);
    expect((await request(app).get(MINE)).status).toBe(401);
  });
});
