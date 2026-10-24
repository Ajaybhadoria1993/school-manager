import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { createSchool, type SchoolSession } from "./schools";

/**
 * The test every module that keeps a school's records must have: school B cannot see, change or delete
 * school A's records. Describe the module once and this writes the cases:
 *
 *   itKeepsSchoolsApart("students", {
 *     seed: async (a) => ({ studentId: (await post(a.token, "/students", {...})).body.data.id }),
 *     snapshot: async (a) => (await get(a.token, "/students")).body.data,
 *     lists: [{ name: "the student list", path: "/api/v1/students", showsRecords: (body) => body.data.length > 0 }],
 *     probes: [
 *       { name: "reading a student", method: "get", path: (c) => `/api/v1/students/${c.studentId}` },
 *       { name: "deleting a student", method: "delete", path: (c) => `/api/v1/students/${c.studentId}` },
 *     ],
 *   });
 *
 * Add one probe for every route that takes the id of a record (read, change, delete, and the ones that add
 * something under it). Each runs against fresh schools, so the cases do not disturb each other.
 */

type Method = "get" | "post" | "put" | "patch" | "delete";

export interface Probe<Ctx> {
  /** In words, for the test name: what school B tries on school A's record. */
  name: string;
  method: Method;
  path: (ctx: Ctx) => string;
  body?: (ctx: Ctx) => object;
  /** What school B must be told. 404 unless said otherwise: "that record does not exist", never "it is another school's". */
  status?: number;
}

export interface ListCheck {
  name: string;
  path: string;
  /** True when the response shows any record at all. School A's must (or the check proves nothing); school B's must not. */
  showsRecords: (body: any) => boolean;
}

export interface IsolationSpec<Ctx> {
  /** School A creates its records. Return whatever the probes need to point at them (ids). */
  seed: (a: SchoolSession) => Promise<Ctx>;
  /** Everything school A can see of its own records, read as school A. It is compared before and after school B's attempt. */
  snapshot: (a: SchoolSession, ctx: Ctx) => Promise<unknown>;
  probes: Probe<Ctx>[];
  lists?: ListCheck[];
}

const send = <Ctx>(token: string, probe: Probe<Ctx>, ctx: Ctx) => {
  const call = request(app)[probe.method](probe.path(ctx)).set({ Authorization: `Bearer ${token}` });
  return probe.body ? call.send(probe.body(ctx)) : call;
};

const get = (token: string, path: string) => request(app).get(path).set({ Authorization: `Bearer ${token}` });

async function twoSchools(): Promise<{ a: SchoolSession; b: SchoolSession }> {
  return { a: await createSchool("Sunrise Public School"), b: await createSchool("Moonrise Public School") };
}

export function itKeepsSchoolsApart<Ctx>(module: string, spec: IsolationSpec<Ctx>): void {
  describe(`${module}: one school cannot reach another's records`, () => {
    for (const list of spec.lists ?? []) {
      it(`${list.name}: school B sees none of school A's records`, async () => {
        const { a, b } = await twoSchools();
        await spec.seed(a);

        // Without this, a wrong path (an empty answer for everyone) would pass for the wrong reason.
        expect(list.showsRecords((await get(a.token, list.path)).body), "school A should see its own records").toBe(true);
        expect(list.showsRecords((await get(b.token, list.path)).body), "school B must not see school A's records").toBe(false);
      });
    }

    for (const probe of spec.probes) {
      const expected = probe.status ?? 404;

      it(`${probe.name}: school B is refused with ${expected}, and school A's records stay as they were`, async () => {
        const { a, b } = await twoSchools();
        const ctx = await spec.seed(a);
        const before = await spec.snapshot(a, ctx);

        const refused = await send(b.token, probe, ctx);
        expect(refused.status, `school B got ${refused.status}: ${JSON.stringify(refused.body)}`).toBe(expected);
        expect(await spec.snapshot(a, ctx), "school A's records changed").toEqual(before);

        // The same call from school A must not give that answer, or a wrong path would pass for the wrong reason.
        const own = await send(a.token, probe, ctx);
        expect(own.status, `the same call from school A got ${own.status}: ${JSON.stringify(own.body)}`).not.toBe(expected);
      });
    }
  });
}
