import request from "supertest";
import app from "../../../app";
import { itKeepsSchoolsApart } from "../../../test/tenantIsolation";
import { auth } from "../../../test/timetable";
import { NotificationService } from "../services/notification.service";

/** School B can neither list nor mark as read school A's notifications. */
itKeepsSchoolsApart("notifications", {
  seed: async (a) => {
    const adminId = (await request(app).get("/api/v1/auth/me").set(auth(a.token))).body.data.user.id as string;
    NotificationService.later(a.tenantId, null, async () => [{ to: [adminId], kind: "calendar.added", title: "Holiday: Diwali", body: "8 Nov to 10 Nov", link: "/calendar" }]);
    await NotificationService.idle();
    const id = (await request(app).get("/api/v1/notifications").set(auth(a.token))).body.data.items[0].id as string;
    return { id };
  },
  snapshot: async (a) => (await request(app).get("/api/v1/notifications").set(auth(a.token))).body.data,
  lists: [{ name: "the bell", path: "/api/v1/notifications", showsRecords: (body) => body.data.items.length > 0 }],
  probes: [{ name: "marking a notification as read", method: "post", path: (c) => `/api/v1/notifications/${c.id}/read` }],
});
