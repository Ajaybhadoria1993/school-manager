import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { useLiveNotifications } from "../../../hooks/useLiveNotifications";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { clearTokens, setTokens } from "../../../utils/auth";
import type { NotificationItem } from "../../../types";
import { Topbar } from "../Topbar";

/**
 * The bell (docs/notifications.md): the unread count, the newest first, one click opens a notification's page (and marks it read), Mark
 * all as read; new ones arrive live on the socket with a toast, and reading in another tab is heard here too.
 */

// A stand-in for the socket: the test fires its events by hand.
const fake = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: (event: string, fn: (...args: unknown[]) => void) => {
      handlers.set(event, fn);
      return socket;
    },
    connect: () => socket,
    disconnect: () => socket,
    removeAllListeners: () => socket,
  };
  return { handlers, socket, options: null as null | { auth?: (cb: (data: object) => void) => void }, connects: 0 };
});
vi.mock("socket.io-client", () => ({
  io: (_url: unknown, options: typeof fake.options) => {
    fake.options = options;
    fake.socket.connect = () => {
      fake.connects += 1;
      return fake.socket;
    };
    return fake.socket;
  },
}));

const fire = (event: string, ...args: unknown[]) => act(() => fake.handlers.get(event)?.(...args));

const item = (id: string, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  kind: "leave.applied",
  title: `Leave request: Child ${id}`,
  body: "Class 5 - A · 12 Nov · Fever",
  link: "/leaves",
  childId: null,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
});
const FIRST = item("n1");
const SECOND = item("n2", { kind: "calendar.added", title: "Holiday: Diwali", body: "8 Nov to 10 Nov", link: "/calendar", readAt: "2026-11-03T10:00:00.000Z" });

function Shell() {
  useLiveNotifications();
  return (
    <>
      <Topbar title="Dashboard" onMenuClick={() => {}} />
      <Outlet />
    </>
  );
}

function openApp(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /notifications": (_body, query) => (query.get("before") ? { items: [item("n0", { title: "Older one", readAt: "2026-11-01T10:00:00.000Z" })], unread: 1, hasMore: false } : { items: [FIRST, SECOND], unread: 1, hasMore: true }),
    "POST /notifications/n1/read": () => ({ unread: 0 }),
    "POST /notifications/read-all": () => ({ unread: 0 }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: "/", element: <p>Home page</p> },
          { path: "/leaves", element: <p>Leave requests page</p> },
        ],
      },
    ],
    { initialEntries: ["/"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

const bell = () => screen.findByRole("button", { name: /^Notifications/ });
const badge = async () => within(await bell()).queryByTestId("unread-count");

beforeEach(() => {
  fake.handlers.clear();
  fake.options = null;
  fake.connects = 0;
  setTokens("token-1", "refresh-1");
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Meena Singh", email: null, username: "meena", role: "teacher", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
});

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  clearTokens();
  vi.unstubAllGlobals();
});

describe("the bell", () => {
  it("shows the unread count; one click on a notification opens its page and marks it read", async () => {
    const { calls, router, user } = openApp();
    await waitFor(async () => expect(await badge()).toHaveTextContent("1"));
    await user.click(await bell());
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    const rows = within(panel).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Leave request: Child n1");
    expect(rows[1]).toHaveTextContent("Holiday: Diwali");

    await user.click(within(rows[0]).getByRole("button"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/notifications/n1/read")).toBe(true));
    expect(router.state.location.pathname).toBe("/leaves");
    expect(await screen.findByText("Leave requests page")).toBeInTheDocument();
    await waitFor(async () => expect(await badge()).toBeNull());
    expect(calls.filter((c) => c.method === "GET" && c.path === "/notifications")).toHaveLength(1);
  });

  it("Mark all as read clears the count", async () => {
    const { calls, user } = openApp();
    await waitFor(async () => expect(await badge()).toHaveTextContent("1"));
    await user.click(await bell());
    await user.click(screen.getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/notifications/read-all")).toBe(true));
    await waitFor(async () => expect(await badge()).toBeNull());
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  it("Show older brings the next page", async () => {
    const { calls, user } = openApp();
    await user.click(await bell());
    await user.click(await screen.findByRole("button", { name: "Show older" }));
    expect(await screen.findByText("Older one")).toBeInTheDocument();
    expect(calls.find((c) => c.query.includes("before="))?.query).toContain("before=n2");
    expect(screen.queryByRole("button", { name: "Show older" })).not.toBeInTheDocument();
  });

  it("says when there is nothing", async () => {
    const { user } = openApp({ "GET /notifications": () => ({ items: [], unread: 0, hasMore: false }) });
    await user.click(await bell());
    expect(await screen.findByText("You are all caught up")).toBeInTheDocument();
  });
});

describe("live, on the socket", () => {
  it("signs in with the current token", async () => {
    openApp();
    await waitFor(() => expect(fake.options).not.toBeNull());
    const got = await new Promise<object>((resolve) => fake.options!.auth!(resolve));
    expect(got).toEqual({ token: "token-1" });
    expect(fake.connects).toBe(1);
  });

  it("a new notification: the count goes up, it is first in the list, and a toast says it", async () => {
    const { user } = openApp();
    await waitFor(async () => expect(await badge()).toHaveTextContent("1"));
    await fire("notification", item("n9", { kind: "diary.saved", title: "Homework in English", body: "Learn the poem", link: "/my-children/s1" }));
    await waitFor(async () => expect(await badge()).toHaveTextContent("2"));
    expect(screen.getByRole("status")).toHaveTextContent("Homework in English");
    await user.click(await bell());
    expect(within(screen.getByRole("dialog", { name: "Notifications" })).getAllByRole("listitem")[0]).toHaveTextContent("Homework in English");
  });

  it("reading in another tab is heard here", async () => {
    openApp();
    await waitFor(async () => expect(await badge()).toHaveTextContent("1"));
    await fire("notifications:unread", { unread: 0 });
    await waitFor(async () => expect(await badge()).toBeNull());
  });

  it("an old token: it gets a new one and connects again", async () => {
    const { calls } = openApp({ "POST /auth/refresh": () => ({ accessToken: "token-2", refreshToken: "refresh-2" }) });
    await waitFor(() => expect(fake.connects).toBe(1));
    await fire("connect_error", new Error("TOKEN_INVALID"));
    await waitFor(() => expect(fake.connects).toBe(2));
    expect(calls.some((c) => c.path === "/auth/refresh")).toBe(true);
    const got = await new Promise<object>((resolve) => fake.options!.auth!(resolve));
    expect(got).toEqual({ token: "token-2" });
  });
});
