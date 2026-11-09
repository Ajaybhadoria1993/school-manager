import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import app from "../../../app";
import { startRealtime, stopRealtime } from "../../../realtime/socket";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { addTiming, auth } from "../../../test/timetable";
import { clock } from "../../../utils/clock";

/** A teacher marking themselves present reaches the school's open sheets at once (a quiet push, not a bell line), and nobody else's. */

let server: Server;
let url = "";
const opened: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  startRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await stopRealtime();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(async () => {
  await seedSuperAdmin();
});
afterEach(() => {
  for (const s of opened.splice(0)) s.disconnect();
  vi.restoreAllMocks();
});

function open(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    opened.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}
const heard = (socket: Socket, event: string) => {
  const got: unknown[] = [];
  socket.on(event, (p) => got.push(p));
  return got;
};

describe("the school's open sheet hears a teacher mark themselves present", () => {
  it("every open tab of the school's admin hears it with the day and the teacher; the teacher's own tab, a parent and another school do not", async () => {
    const s = await classroomSchool();
    const moon = await classroomSchool("Moonrise Public School", "moon.");
    await addTiming(s.token);
    const admin1 = heard(await open(s.token), "attendance:teacher");
    const admin2 = heard(await open(s.token), "attendance:teacher");
    const teacher = heard(await open(s.tokens.meena), "attendance:teacher");
    const parent = heard(await open(s.tokens.ravi), "attendance:teacher");
    const other = heard(await open(moon.token), "attendance:teacher");

    vi.spyOn(clock, "now").mockReturnValue(new Date("2026-11-05T08:10:00+05:30"));
    const res = await request(app).post("/api/v1/attendance/teachers/me/present").set(auth(s.tokens.meena));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await new Promise((r) => setTimeout(r, 200));

    expect(admin1).toEqual([{ date: "2026-11-05", teacherId: s.meena }]);
    expect(admin2).toEqual([{ date: "2026-11-05", teacherId: s.meena }]);
    expect(teacher).toEqual([]);
    expect(parent).toEqual([]);
    expect(other).toEqual([]);

    // Tapping again is the same mark: nothing is pushed twice.
    await request(app).post("/api/v1/attendance/teachers/me/present").set(auth(s.tokens.meena));
    await new Promise((r) => setTimeout(r, 200));
    expect(admin1).toHaveLength(1);
  });
});
