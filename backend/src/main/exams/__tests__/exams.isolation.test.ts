import { beforeEach } from "vitest";
import request from "supertest";
import app from "../../../app";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { addClass, addSubject, auth } from "../../../test/timetable";

const api = "/api/v1/exams";

beforeEach(async () => {
  await seedSuperAdmin();
});

itKeepsSchoolsApart("exams", {
  seed: async (a) => {
    await request(app).post("/api/v1/academics/academic-years/initial").set(auth(a.token)).send({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" });
    const klass = await addClass(a.token, "Class 5");
    const subjectId = await addSubject(a.token, "Mathematics");
    const exam = (await request(app).post(api).set(auth(a.token)).send({ name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26" })).body.data;
    const paper = (
      await request(app)
        .post(`${api}/${exam.id}/papers`)
        .set(auth(a.token))
        .send({ classIds: [klass.id], papers: [{ subjectId, date: "2026-09-15", startTime: "09:00", durationMinutes: 180, maxMarks: 50 }] })
    ).body.data.items[0];
    return { examId: exam.id as string, paperId: paper.id as string, classId: klass.id as string, subjectId };
  },

  snapshot: async (a, c) => ({
    list: (await request(app).get(api).set(auth(a.token))).body.data,
    exam: (await request(app).get(`${api}/${c.examId}`).set(auth(a.token))).body.data,
    classExams: (await request(app).get(`${api}/class?classId=${c.classId}&sectionId=none`).set(auth(a.token))).body.data,
    sheet: (await request(app).get(`${api}/papers/${c.paperId}/marks?classId=${c.classId}&sectionId=none`).set(auth(a.token))).body.data,
  }),

  lists: [{ name: "the exams", path: api, showsRecords: (body) => body.data.items.length > 0 }],

  probes: [
    { name: "reading its exam", method: "get", path: (c) => `${api}/${c.examId}` },
    { name: "changing its exam", method: "patch", path: (c) => `${api}/${c.examId}`, body: () => ({ name: "Hacked" }) },
    { name: "taking its exam away", method: "delete", path: (c) => `${api}/${c.examId}` },
    {
      name: "adding a paper to its exam",
      method: "post",
      path: (c) => `${api}/${c.examId}/papers`,
      body: (c) => ({ classIds: [c.classId], papers: [{ subjectId: c.subjectId, date: "2026-09-16", startTime: "09:00", durationMinutes: 60 }] }),
    },
    { name: "changing its paper", method: "patch", path: (c) => `${api}/${c.examId}/papers/${c.paperId}`, body: () => ({ topic: "Hacked" }) },
    { name: "taking its paper away", method: "delete", path: (c) => `${api}/${c.examId}/papers/${c.paperId}` },
    // The teachers' side: a class's exams, and the marks (2026-11-06).
    { name: "reading the exams of its class", method: "get", path: (c) => `${api}/class?classId=${c.classId}&sectionId=none` },
    { name: "reading the marks sheet of its paper", method: "get", path: (c) => `${api}/papers/${c.paperId}/marks?classId=${c.classId}&sectionId=none` },
    {
      name: "entering marks in its paper",
      method: "put",
      path: (c) => `${api}/papers/${c.paperId}/marks`,
      body: (c) => ({ classId: c.classId, sectionId: null, marks: [] }),
    },
  ],
});
