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
  roleOther: null,
  alsoTeacher: false,
  isTeacher: false,
  subjectIds: [],
  email: null,
  mobile: null,
  gender: null,
  dateOfBirth: null,
  address: { line1: null, city: null, state: null, pincode: null },
  designation: null,
  employeeCode: null,
  joiningDate: null,
  status: "active",
  login: { username: "someone_10", isActive: true },
  ...over,
});
const ASHA = member({ id: "asha", name: "Asha Rao", mobile: "9876543210", designation: "Front desk", login: { username: "asha.rao_41", isActive: true } });
// Added before the school made logins itself: no login yet.
const RAVI = member({ id: "ravi", name: "Ravi Menon", email: "ravi@school.example", role: "management", roleLabel: "Management", status: "invited", login: null });
const SUNITA = member({ id: "sunita", name: "Sunita Bose", role: "accountant", roleLabel: "Accountant", status: "invited", login: null });
const KABIR = member({ id: "kabir", name: "Kabir Khan", role: "accountant", roleLabel: "Accountant", status: "inactive", login: { username: "kabir.khan_52", isActive: false } });

function openPage(people: StaffMember[] = [ASHA, RAVI, SUNITA, KABIR], extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    "GET /staff/members": (_body, query) => {
      const status = query.get("status") ?? "all";
      const role = query.get("role");
      const search = (query.get("search") ?? "").toLowerCase();
      const counts = { active: 0, invited: 0, inactive: 0 } as Record<StaffMemberStatus, number>;
      for (const p of people) counts[p.status] += 1;
      return {
        // The server sends the list sorted by name.
        items: people
          .filter((p) => (status === "all" || p.status === status) && (!role || p.role === role) && (!search || p.name.toLowerCase().includes(search) || (p.login?.username ?? "").includes(search)))
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
const server = (status: number, message: string, code?: string, details: object[] = []) => () => new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

describe("Staff", () => {
  it("lists everyone with the role, the status and the username they sign in with, and the count of each status on the tabs; Add staff is in the header", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Staff", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add staff" })).toHaveAttribute("href", "/staff/new");
    await waitFor(() => expect(names()).toEqual(["Asha Rao", "Kabir Khan", "Ravi Menon", "Sunita Bose"]));
    expect(screen.getByRole("tab", { name: "All 4" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Active 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "No login 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Inactive 1" })).toBeInTheDocument();
    expect(rowOf("Asha Rao")).toHaveTextContent("Receptionist");
    expect(rowOf("Asha Rao")).toHaveTextContent("Front desk");
    expect(rowOf("Asha Rao")).toHaveTextContent("asha.rao_41");
    expect(rowOf("Asha Rao")).toHaveTextContent("Active");
    expect(rowOf("Kabir Khan")).toHaveTextContent("kabir.khan_52");
    expect(rowOf("Kabir Khan")).toHaveTextContent("Inactive");
    expect(rowOf("Ravi Menon")).toHaveTextContent("No login");
    expect(screen.queryByRole("tab", { name: /Invited/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/invit/i)).not.toBeInTheDocument();
  });

  it("has no No login tab when everybody has a login (the usual case: a new person is added with one)", async () => {
    openPage([ASHA, KABIR]);
    await screen.findByRole("table", { name: "Staff" });
    expect(screen.getByRole("tab", { name: "All 2" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /No login/ })).not.toBeInTheDocument();
  });

  it("a tab, a role and the search are each one request answered by the server, with the counts kept", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(lists(calls)).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "No login 2" }));
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

  it("searches by name, username or mobile", async () => {
    openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(screen.getByLabelText("Search staff")).toHaveAttribute("placeholder", "Search by name, username or mobile");
  });

  it("says so when the school has no staff yet, with the way to add them", async () => {
    openPage([]);
    expect(await screen.findByText("No staff yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add staff" }).every((l) => l.getAttribute("href") === "/staff/new")).toBe(true);
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
  });

  it("opens the change form from the name and from the pencil", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(screen.getByRole("link", { name: "Change Asha Rao" })).toHaveAttribute("href", "/staff/asha/edit");
    await user.click(screen.getByRole("link", { name: "Asha Rao" }));
    expect(router.state.location.pathname).toBe("/staff/asha/edit");
  });

  it("there is no invitation to send again or take back, and a person with a login is not removed", async () => {
    openPage();
    await screen.findByRole("table", { name: "Staff" });
    expect(screen.queryByRole("button", { name: /Resend invite/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Take back/ })).not.toBeInTheDocument();
    expect(within(rowOf("Asha Rao")).queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(within(rowOf("Asha Rao")).queryByRole("button", { name: /Make a login/ })).not.toBeInTheDocument();
  });

  it("makes a login for a person who has none: the username from the name and a password already made, shown once, in one request", async () => {
    const { calls, user } = openPage([ASHA, RAVI], {
      "POST /staff/members/ravi/login": (body) => ({ ...RAVI, status: "active", login: { username: (body as { username: string }).username, isActive: true } }),
    });
    await screen.findByRole("table", { name: "Staff" });
    expect(within(rowOf("Asha Rao")).queryByRole("button", { name: /Make a login/ })).not.toBeInTheDocument();
    await user.click(within(rowOf("Ravi Menon")).getByRole("button", { name: "Make a login for Ravi Menon" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a login for Ravi Menon" });
    expect((within(dialog).getByLabelText(/^Username/) as HTMLInputElement).value).toMatch(/^ravi\.menon_\d{2}$/);
    const username = (within(dialog).getByLabelText(/^Username/) as HTMLInputElement).value;
    const password = (within(dialog).getByLabelText(/^Password/) as HTMLInputElement).value;
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Make login" }));
    const details = await within(dialog).findByRole("region", { name: "Login details" });
    expect(within(details).getByText(username)).toBeInTheDocument();
    expect(within(details).getByText(password)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/staff/members/ravi/login", body: { username, password } });
  });

  it("gives a person a new password the school made: shown once, the old one stops", async () => {
    const { calls, user } = openPage([ASHA], { "POST /staff/members/asha/reset-password": () => ({}) });
    await screen.findByRole("table", { name: "Staff" });
    await user.click(within(rowOf("Asha Rao")).getByRole("button", { name: "New password for Asha Rao" }));
    const dialog = await screen.findByRole("dialog", { name: "New password for Asha Rao" });
    const password = (within(dialog).getByLabelText(/^Password/) as HTMLInputElement).value;
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));
    const details = await within(dialog).findByRole("region", { name: "Login details" });
    expect(within(details).getByText("asha.rao_41")).toBeInTheDocument();
    expect(within(details).getByText(password)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/staff/members/asha/reset-password", body: { password } });
  });

  it("changes a username (the password stays), and says so", async () => {
    const { calls, user } = openPage([ASHA], { "PATCH /staff/members/asha/login": (body) => ({ ...ASHA, login: { username: (body as { username: string }).username, isActive: true } }) });
    await screen.findByRole("table", { name: "Staff" });
    await user.click(within(rowOf("Asha Rao")).getByRole("button", { name: "Change the username of Asha Rao" }));
    const dialog = await screen.findByRole("dialog", { name: "Change the username of Asha Rao" });
    const box = within(dialog).getByLabelText(/^Username/);
    await user.clear(box);
    await user.type(box, "asha.desk");
    await user.click(within(dialog).getByRole("button", { name: "Save username" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/members/asha/login", body: { username: "asha.desk" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Change the username of Asha Rao" })).not.toBeInTheDocument());
  });

  it("says why when a login could not be made, in the same window", async () => {
    const { user } = openPage([RAVI], { "POST /staff/members/ravi/login": server(409, "This username is taken. Try another", "USERNAME_TAKEN", [{ path: "login.username", message: "This username is taken. Try another" }]) });
    await user.click(await screen.findByRole("button", { name: "Make a login for Ravi Menon" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a login for Ravi Menon" });
    await user.click(within(dialog).getByRole("button", { name: "Make login" }));
    expect(await within(dialog).findByText("This username is taken. Try another")).toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "Login details" })).not.toBeInTheDocument();
  });

  it("removes a person who has no login after asking, and a window says they are gone", async () => {
    const { calls, user } = openPage([ASHA, RAVI], { "DELETE /staff/members/ravi": () => ({}) });
    await screen.findByRole("table", { name: "Staff" });
    await user.click(within(rowOf("Ravi Menon")).getByRole("button", { name: "Remove Ravi Menon" }));
    const ask = await screen.findByRole("dialog", { name: "Remove Ravi Menon?" });
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("dialog", { name: "Ravi Menon is removed" })).toBeInTheDocument();
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
    const again = await screen.findByRole("dialog", { name: "Kabir Khan is active again" });
    expect(again).toHaveTextContent("username and password");
    expect(writes(calls)[1]).toMatchObject({ path: "/staff/members/kabir", body: { isActive: true } });
  });

  it("says why when the list could not be read, with a way to try again", async () => {
    const { user } = openPage([], { "GET /staff/members": server(500, "The staff could not be read.") });
    expect(await screen.findByText("The staff could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
  });
});

describe("Staff: the roles and who also teaches (2026-11-08)", () => {
  const LATA = member({ id: "lata", name: "Lata Das", role: "other", roleLabel: "Lab technician", roleOther: "Lab technician" });
  const MEERA = member({ id: "meera", name: "Meera Iyer", role: "management", roleLabel: "Management", alsoTeacher: true, isTeacher: true });
  const VIKRAM = member({ id: "vikram", name: "Vikram Joshi", role: "vice_principal", roleLabel: "Vice principal", alsoTeacher: true, status: "invited", login: null });

  it("shows the role the school wrote for Other, and a Teaches mark on whoever also teaches (also with no login yet)", async () => {
    openPage([LATA, MEERA, VIKRAM, ASHA]);
    await screen.findByRole("table", { name: "Staff" });
    expect(rowOf("Lata Das")).toHaveTextContent("Lab technician");
    expect(rowOf("Lata Das")).not.toHaveTextContent("Teaches");
    expect(rowOf("Meera Iyer")).toHaveTextContent("Management");
    expect(rowOf("Meera Iyer")).toHaveTextContent("Teaches");
    expect(rowOf("Vikram Joshi")).toHaveTextContent("Vice principal");
    expect(rowOf("Vikram Joshi")).toHaveTextContent("Teaches");
    expect(rowOf("Asha Rao")).not.toHaveTextContent("Teaches");
  });

  it("the Role filter has every kind of staff, Other included, and asks the server for the one picked", async () => {
    const { calls, user } = openPage([LATA, MEERA, VIKRAM, ASHA]);
    await screen.findByRole("table", { name: "Staff" });
    await user.click(screen.getByRole("button", { name: /(^|\s)Role$/ }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent?.trim());
    expect(options).toContain("Vice principal");
    expect(options).toContain("Librarian");
    expect(options.at(-1)).toBe("Other");
    await user.click(screen.getByRole("option", { name: "Other" }));
    await waitFor(() => expect(names()).toEqual(["Lata Das"]));
    expect(new URLSearchParams(lists(calls).at(-1)!.query).get("role")).toBe("other");
  });
});
