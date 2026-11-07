import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { StaffMember, StaffMemberStatus } from "../../../types";
import StaffDirectoryPage from "../StaffDirectory";

const member = (over: Partial<StaffMember>): StaffMember => ({
  id: "x",
  name: "Someone",
  role: "receptionist",
  roleLabel: "Receptionist",
  email: "someone@school.example",
  mobile: null,
  gender: null,
  dateOfBirth: null,
  address: { line1: null, city: null, state: null, pincode: null },
  designation: null,
  employeeCode: null,
  joiningDate: null,
  status: "active",
  invitedAt: "2026-11-01T00:00:00.000Z",
  acceptedAt: null,
  ...over,
});
const ASHA = member({ id: "asha", name: "Asha Rao", email: "asha@school.example", mobile: "9876543210", designation: "Front desk", acceptedAt: "2026-11-02T00:00:00.000Z" });
const RAVI = member({ id: "ravi", name: "Ravi Menon", email: "ravi@school.example", role: "management", roleLabel: "Management", status: "invited" });
const SUNITA = member({ id: "sunita", name: "Sunita Bose", email: "sunita@school.example", role: "accountant", roleLabel: "Accountant", status: "invited" });
const KABIR = member({ id: "kabir", name: "Kabir Khan", email: "kabir@school.example", role: "accountant", roleLabel: "Accountant", status: "inactive" });

function openPage(people: StaffMember[] = [ASHA, RAVI, SUNITA, KABIR], extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/members": (_body, query) => {
      const status = query.get("status") ?? "all";
      const role = query.get("role");
      const search = (query.get("search") ?? "").toLowerCase();
      const counts = { active: 0, invited: 0, inactive: 0 } as Record<StaffMemberStatus, number>;
      for (const p of people) counts[p.status] += 1;
      return {
        // The server sends the list sorted by name.
        items: people
          .filter((p) => (status === "all" || p.status === status) && (!role || p.role === role) && (!search || p.name.toLowerCase().includes(search) || p.email.includes(search)))
          .sort((a, b) => a.name.localeCompare(b.name)),
        counts,
      };
    },
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/staff", element: <StaffDirectoryPage /> },
      { path: "/staff/new", element: <p>Add staff page</p> },
      { path: "/staff/:id/edit", element: <p>Change staff page</p> },
      { path: "/dashboard", element: <p>The dashboard</p> },
    ],
    { initialEntries: ["/staff"] }
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

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const lists = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/staff/members");
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const rowOf = (name: string) => screen.getByRole("link", { name }).closest("tr") as HTMLElement;
const table = () => screen.getByRole("table", { name: "Staff" });
const names = () => within(table()).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("link")[0].textContent);
const server = (status: number, message: string, code?: string) => () => new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("Staff", () => {
  it("lists everyone with the role and the status, and the count of each status on the tabs; Add staff is in the header", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Staff", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add staff" })).toHaveAttribute("href", "/staff/new");
    await waitFor(() => expect(names()).toEqual(["Asha Rao", "Kabir Khan", "Ravi Menon", "Sunita Bose"]));
    expect(screen.getByRole("tab", { name: "All 4" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Active 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Invited 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inactive 1" })).toBeInTheDocument();
    expect(rowOf("Asha Rao")).toHaveTextContent("Receptionist");
    expect(rowOf("Asha Rao")).toHaveTextContent("Front desk");
    expect(rowOf("Asha Rao")).toHaveTextContent("asha@school.example");
    expect(rowOf("Asha Rao")).toHaveTextContent("Active");
    expect(rowOf("Ravi Menon")).toHaveTextContent("Invited");
    expect(rowOf("Kabir Khan")).toHaveTextContent("Inactive");
  });

  it("a tab, a role and the search are each one request answered by the server, with the counts kept", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(lists(calls)).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "Invited 2" }));
    await waitFor(() => expect(names()).toEqual(["Ravi Menon", "Sunita Bose"]));
    expect(new URLSearchParams(lists(calls).at(-1)!.query).get("status")).toBe("invited");
    expect(screen.getByRole("tab", { name: "All 4" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /(^|\s)Role$/ }));
    await user.click(await screen.findByRole("option", { name: "Accountant" }));
    await waitFor(() => expect(names()).toEqual(["Sunita Bose"]));
    expect(new URLSearchParams(lists(calls).at(-1)!.query).get("role")).toBe("accountant");
    await user.type(screen.getByLabelText("Search staff"), "zzz");
    expect(await screen.findByText("No staff matches.")).toBeInTheDocument();
    await waitFor(() => expect(new URLSearchParams(lists(calls).at(-1)!.query).get("search")).toBe("zzz"));
  });

  it("says so when the school has no staff yet, with the way to add them", async () => {
    openPage([]);
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add staff" }).every((l) => l.getAttribute("href") === "/staff/new")).toBe(true);
  });

  it("opens the change form from the name and from the pencil", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(screen.getByRole("link", { name: "Change Asha Rao" })).toHaveAttribute("href", "/staff/asha/edit");
    await user.click(screen.getByRole("link", { name: "Asha Rao" }));
    expect(router.state.location.pathname).toBe("/staff/asha/edit");
  });

  it("sends an invitation again from the list, in one request, and a window says it went", async () => {
    const { calls, user } = openPage([ASHA, RAVI], {
      "POST /staff/members/ravi/resend-invite": () => ({ ...RAVI, emailSent: true, inviteExpiresAt: "2026-11-09T00:00:00.000Z" }),
    });
    await screen.findByRole("table", { name: "Staff" });
    expect(within(rowOf("Asha Rao")).queryByRole("button", { name: /Resend invite/ })).not.toBeInTheDocument();
    await user.click(within(rowOf("Ravi Menon")).getByRole("button", { name: "Resend invite to Ravi Menon" }));
    const done = await screen.findByRole("dialog", { name: "Invitation sent again" });
    expect(done).toHaveTextContent("A new invitation was emailed to ravi@school.example");
    expect(writes(calls)).toHaveLength(1);
  });

  it("says when the email could not be sent, and in development shows the link", async () => {
    const { user } = openPage([RAVI], {
      "POST /staff/members/ravi/resend-invite": () => ({ ...RAVI, emailSent: false, inviteExpiresAt: "2026-11-09T00:00:00.000Z", devInviteLink: "http://localhost:5173/accept-invite?token=abc" }),
    });
    await user.click(await screen.findByRole("button", { name: "Resend invite to Ravi Menon" }));
    const done = await screen.findByRole("dialog", { name: "The email could not be sent" });
    expect(done).toHaveTextContent("accept-invite?token=abc");
  });

  it("says why when an invitation could not be sent", async () => {
    const { user } = openPage([RAVI], { "POST /staff/members/ravi/resend-invite": server(409, "Ravi Menon has already accepted the invitation.", "INVALID_STATE") });
    await user.click(await screen.findByRole("button", { name: "Resend invite to Ravi Menon" }));
    const failed = await screen.findByRole("dialog", { name: "Invitation not sent" });
    expect(failed).toHaveTextContent("Ravi Menon has already accepted the invitation.");
  });

  it("takes an invitation back after asking, and a window says it is gone", async () => {
    const { calls, user } = openPage([ASHA, RAVI], { "DELETE /staff/members/ravi": () => ({}) });
    await screen.findByRole("table", { name: "Staff" });
    await user.click(within(rowOf("Ravi Menon")).getByRole("button", { name: "Take back the invitation of Ravi Menon" }));
    const ask = await screen.findByRole("dialog", { name: "Take back the invitation?" });
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Take it back" }));
    expect(await screen.findByRole("dialog", { name: "Invitation taken back" })).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "DELETE", path: "/staff/members/ravi" });
  });

  it("makes a person inactive after asking (their login closes) and active again with one click", async () => {
    const { calls, user } = openPage([ASHA, KABIR], {
      "PATCH /staff/members/asha": () => ({ ...ASHA, status: "inactive" }),
      "PATCH /staff/members/kabir": () => ({ ...KABIR, status: "active" }),
    });
    await screen.findByRole("table", { name: "Staff" });
    await user.click(within(rowOf("Asha Rao")).getByRole("button", { name: "Make Asha Rao inactive" }));
    const ask = await screen.findByRole("dialog", { name: "Make Asha Rao inactive?" });
    expect(ask).toHaveTextContent("cannot sign in");
    await user.click(within(ask).getByRole("button", { name: "Make inactive" }));
    expect(await screen.findByRole("dialog", { name: "Asha Rao is inactive" })).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/members/asha", body: { isActive: false } });
    await user.click(within(screen.getByRole("dialog", { name: "Asha Rao is inactive" })).getByRole("button", { name: "OK" }));

    await user.click(within(rowOf("Kabir Khan")).getByRole("button", { name: "Make Kabir Khan active" }));
    expect(await screen.findByRole("dialog", { name: "Kabir Khan is active again" })).toBeInTheDocument();
    expect(writes(calls)[1]).toMatchObject({ path: "/staff/members/kabir", body: { isActive: true } });
  });

  it("says why when the list could not be read, with a way to try again", async () => {
    const { user } = openPage([], { "GET /staff/members": server(500, "The staff could not be read.") });
    expect(await screen.findByText("The staff could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
  });
});
