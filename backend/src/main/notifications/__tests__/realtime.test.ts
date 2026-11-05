import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import app from "../../../app";
import { startRealtime, stopRealtime } from "../../../realtime/socket";
import { seedSuperAdmin } from "../../../seed/superAdmin.seed";
import { classroomSchool } from "../../../test/classroom";
import { auth } from "../../../test/timetable";
import { Notification } from "../models/Notification";
import { NotificationService } from "../services/notification.service";

/** Notifications arrive on the person's open sockets at once (every tab of theirs), only theirs, and only with a valid sign-in. */

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
});

function open(token: string | undefined): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false, forceNew: true });
    opened.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => reject(err));
  });
}

/** Everything a socket hears of one event, collected as it comes. */
function heard<T>(socket: Socket, event: string): T[] {
  const got: T[] = [];
  socket.on(event, (payload: T) => got.push(payload));
  return got;
}

const settle = async () => {
  await NotificationService.idle();
  await new Promise((resolve) => setTimeout(resolve, 150));
};

describe("the notification socket", () => {
  it("refuses a connection without a valid sign-in", async () => {
    await expect(open(undefined)).rejects.toThrow("TOKEN_MISSING");
    await expect(open("not-a-token")).rejects.toThrow("TOKEN_INVALID");
  });

  it("a parent's leave arrives at once on every open tab of the class teacher, and on nobody else's", async () => {
    const s = await classroomSchool();
    const moon = await classroomSchool("Moonrise Public School", "moon.");
    const meenaTab1 = heard<{ title: string; kind: string; id: string }>(await open(s.tokens.meena), "notification");
    const meenaTab2 = heard<{ title: string }>(await open(s.tokens.meena), "notification");
    const dev = heard(await open(s.tokens.dev), "notification");
    const otherSchool = heard(await open(moon.tokens.meena), "notification");

    await request(app).post("/api/v1/parent/children/" + s.asha.id + "/leaves").set(auth(s.tokens.ravi)).send({ fromDate: "2026-11-12", reason: "Fever" });
    await settle();

    expect(meenaTab1).toHaveLength(1);
    expect(meenaTab1[0]).toMatchObject({ kind: "leave.applied", title: "Leave request: Asha Verma" });
    expect(meenaTab1[0].id).toMatch(/^[0-9a-f]{24}$/);
    expect(meenaTab2).toHaveLength(1);
    expect(dev).toHaveLength(0);
    expect(otherSchool).toHaveLength(0);
    // Two whole schools are made for it (about 10 s each), like the other heavy tests of the repo.
  }, 60_000);

  it("reading tells every open tab of that person the new unread count", async () => {
    const s = await classroomSchool();
    // Making the school told Meena of her class: start from an empty bell.
    await NotificationService.idle();
    await Notification.deleteMany({ tenantId: s.tenantId });
    await request(app).post("/api/v1/classroom/calendar").set(auth(s.tokens.admin)).send({ title: "Diwali", kind: "holiday", startDate: "2026-11-08" });
    await NotificationService.idle();
    const tab1 = heard<{ unread: number }>(await open(s.tokens.meena), "notifications:unread");
    const tab2 = heard<{ unread: number }>(await open(s.tokens.meena), "notifications:unread");
    const dev = heard(await open(s.tokens.dev), "notifications:unread");

    await request(app).post("/api/v1/classroom/calendar").set(auth(s.tokens.admin)).send({ title: "Holi", kind: "holiday", startDate: "2027-03-14" });
    await NotificationService.idle();
    const newest = (await request(app).get("/api/v1/notifications").set(auth(s.tokens.meena))).body.data.items[0].id as string;
    await request(app).post(`/api/v1/notifications/${newest}/read`).set(auth(s.tokens.meena));
    await settle();
    expect(tab1).toEqual([{ unread: 1, id: newest }]);

    await request(app).post("/api/v1/notifications/read-all").set(auth(s.tokens.meena));
    await settle();
    expect(tab1).toEqual([{ unread: 1, id: newest }, { unread: 0 }]);
    expect(tab2).toEqual([{ unread: 1, id: newest }, { unread: 0 }]);
    expect(dev).toHaveLength(0);
  });
});
