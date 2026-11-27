import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool, LOGIN_PASSWORD, signInAs } from "../../../test/classroom";
import { emailOf, postStaff } from "../../../test/logins";
import { addColleague } from "../../../test/schools";
import { auth } from "../../../test/timetable";
import { Tenant } from "../../tenants/models/Tenant";
import { PersonPhoto } from "../models/PersonPhoto";

/**
 * Profile photos (docs/profiles.md): optional, for the person who runs the school, a teacher and a staff member. The school sets a teacher's
 * or a staff member's; each of them sets their own. Never at a public address: a picture comes inside the answer to someone who may see it.
 */

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const startsWith = (type: string) => expect.stringMatching(new RegExp(`^data:image/${type};base64,`));

const MINE = "/api/v1/profile/photo";
const teacherPhoto = (id: string) => `/api/v1/staff/teachers/${id}/photo`;
const staffPhoto = (id: string) => `/api/v1/staff/members/${id}/photo`;
const get = (path: string, token: string) => request(app).get(path).set(auth(token));
const put = (path: string, token: string, file = PNG) => request(app).put(path).set(auth(token)).attach("photo", file, "me.png");
const del = (path: string, token: string) => request(app).delete(path).set(auth(token));
const photoAt = async (path: string, token: string) => (await get(path, token)).body.data.photo as string | null;

/** The school of the tests, with a receptionist (login) and a principal. */
async function school() {
  const s = await classroomSchool();
  const made = await postStaff(s.token, { name: "Rita Das", role: "receptionist", login: { username: "sun.rita", password: LOGIN_PASSWORD } });
  expect(made.status).toBe(201);
  return { ...s, rita: made.body.data.id as string, ritaToken: await signInAs(emailOf("sun.rita")) };
}

beforeEach(async () => {
  await seedSuperAdmin();
});

describe("a person's own photo", () => {
  it("the school's administrator: none to begin with, then saved, changed and taken away", async () => {
    const s = await school();
    expect(await photoAt(MINE, s.token)).toBeNull();
    expect((await put(MINE, s.token)).body.data.photo).toEqual(startsWith("png"));
    expect((await put(MINE, s.token, JPEG)).body.data.photo).toEqual(startsWith("jpeg"));
    expect(await photoAt(MINE, s.token)).toEqual(startsWith("jpeg"));
    expect(await PersonPhoto.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect((await del(MINE, s.token)).body.data.photo).toBeNull();
    expect(await photoAt(MINE, s.token)).toBeNull();
  });

  it("can be added during onboarding, before the school is approved, and while it waits", async () => {
    const s = await school();
    for (const approvalStatus of ["onboarding", "pending"]) {
      await Tenant.updateOne({ _id: s.tenantId }, { $set: { approvalStatus } });
      expect((await put(MINE, s.token)).status, approvalStatus).toBe(200);
    }
  });

  it("a teacher's own is the photo the school sees on the teacher, and the school's is the teacher's own", async () => {
    const s = await school();
    await put(MINE, s.tokens.meena);
    expect(await photoAt(teacherPhoto(s.meena), s.token)).toEqual(startsWith("png"));
    await put(teacherPhoto(s.meena), s.token, JPEG);
    expect(await photoAt(MINE, s.tokens.meena)).toEqual(startsWith("jpeg"));
    await del(MINE, s.tokens.meena);
    expect(await photoAt(teacherPhoto(s.meena), s.token)).toBeNull();
  });

  it("a staff member's the same", async () => {
    const s = await school();
    await put(staffPhoto(s.rita), s.token);
    expect(await photoAt(MINE, s.ritaToken)).toEqual(startsWith("png"));
    await put(MINE, s.ritaToken, JPEG);
    expect(await photoAt(staffPhoto(s.rita), s.token)).toEqual(startsWith("jpeg"));
  });

  it("a staff member who also teaches has one photo, from either page", async () => {
    const s = await school();
    const made = await postStaff(s.token, { name: "Vik Nair", role: "management", alsoTeacher: true, subjectIds: [s.maths], mobile: "9811122233", login: { username: "sun.vik", password: LOGIN_PASSWORD } });
    expect(made.status).toBe(201);
    const id = made.body.data.id as string;
    const teacher = (await get("/api/v1/staff/teachers", s.token)).body.data.items.find((t: { name: string }) => t.name === "Vik Nair") as { id: string };
    await put(staffPhoto(id), s.token);
    expect(await photoAt(teacherPhoto(teacher.id), s.token)).toEqual(startsWith("png"));
    await put(teacherPhoto(teacher.id), s.token, JPEG);
    expect(await photoAt(staffPhoto(id), s.token)).toEqual(startsWith("jpeg"));
    expect(await photoAt(MINE, await signInAs(emailOf("sun.vik")))).toEqual(startsWith("jpeg"));
  });

  it("refuses what is not a picture, a big file and no file", async () => {
    const s = await school();
    expect((await put(MINE, s.token, Buffer.from("MZ a program"))).body.code).toBe("PHOTO_NOT_IMAGE");
    expect((await put(MINE, s.token, Buffer.concat([PNG, Buffer.alloc(400 * 1024, 1)]))).body.code).toBe("PHOTO_TOO_BIG");
    expect((await request(app).put(MINE).set(auth(s.token))).body.code).toBe("PHOTO_MISSING");
    expect((await put(teacherPhoto(s.meena), s.token, Buffer.from("<svg/>"))).body.code).toBe("PHOTO_NOT_IMAGE");
  });

  it("is not for a parent or the platform's own admin, and needs a sign-in", async () => {
    const s = await school();
    expect((await get(MINE, s.tokens.ravi)).status).toBe(403);
    expect((await put(MINE, s.tokens.ravi)).status).toBe(403);
    expect((await request(app).get(MINE)).status).toBe(401);
  });
});

describe("the school's photos of teachers and staff", () => {
  it("only who may see the teacher or the staff member sees the photo; only who may add or change sets it", async () => {
    const s = await school();
    await put(teacherPhoto(s.meena), s.token);
    expect((await get(teacherPhoto(s.meena), s.tokens.dev)).status).toBe(403);
    expect((await put(teacherPhoto(s.meena), s.tokens.dev)).status).toBe(403);
    expect((await put(staffPhoto(s.rita), s.tokens.dev)).status).toBe(403);
    expect((await get(teacherPhoto(s.meena), s.tokens.ravi)).status).toBe(403);
    const principal = await addColleague(s.tenantId, "principal");
    expect((await put(staffPhoto(s.rita), principal)).status).toBe(200);
  });

  it("someone who may only add teachers gives a new teacher a photo, and cannot replace one", async () => {
    const s = await school();
    const saved = await request(app).put("/api/v1/permissions/receptionist").set(auth(s.token)).send({ permissions: ["teachers.view", "teachers.add"] });
    expect(saved.status).toBe(200);
    expect((await put(teacherPhoto(s.dev), s.ritaToken)).status).toBe(200);
    const again = await put(teacherPhoto(s.dev), s.ritaToken, JPEG);
    expect(again.status).toBe(403);
    expect(await photoAt(teacherPhoto(s.dev), s.token)).toEqual(startsWith("png"));
    expect((await del(teacherPhoto(s.dev), s.ritaToken)).status).toBe(403);
  });

  it("says not found for someone who is not there", async () => {
    const s = await school();
    const nobody = "64b000000000000000000001";
    expect((await get(teacherPhoto(nobody), s.token)).status).toBe(404);
    expect((await put(staffPhoto(nobody), s.token)).status).toBe(404);
    expect((await put(teacherPhoto(nobody), s.token)).body.code).toBe("TEACHER_NOT_FOUND");
  });

  it("a staff member taken away takes the photo along", async () => {
    const s = await school();
    const made = await request(app).post("/api/v1/staff/members").set(auth(s.token)).send({ name: "Old Hand", role: "receptionist" });
    await put(staffPhoto(made.body.data.id), s.token);
    expect(await PersonPhoto.countDocuments({ tenantId: s.tenantId })).toBe(1);
    expect((await del(`/api/v1/staff/members/${made.body.data.id}`, s.token)).status).toBe(200);
    expect(await PersonPhoto.countDocuments({ tenantId: s.tenantId })).toBe(0);
  });
});
