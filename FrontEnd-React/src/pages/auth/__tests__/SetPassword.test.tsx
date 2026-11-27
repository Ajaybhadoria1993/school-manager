import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { authApi } from "../../../redux/api/authApi";
import store from "../../../redux/store";
import { authChecked, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import SetPassword from "../SetPassword";

/**
 * `/set-password?token=` (2026-11-26): the invitation a teacher or a staff member gets when their school gives them login access. They see the
 * school and their email, choose a password, and are signed in; the login is then no longer Pending.
 */
const LINK = { name: "Meena Singh", email: "meena@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-29T00:00:00.000Z" };
const SESSION = {
  user: { id: "u7", name: "Meena Singh", email: "meena@school.example", username: null, role: "teacher", tenantId: "t1", emailVerifiedAt: "2026-11-26T00:00:00.000Z" },
  tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
  accessToken: "access",
  refreshToken: "refresh",
  token: "access",
};
const GOOD_PASSWORD = "Sch00l@Teach1";

function openPage(extra: Record<string, Handler> = {}, at = "/set-password?token=abc123") {
  const calls = fakeApi({
    "POST /auth/login-invite/check": () => LINK,
    "POST /auth/login-invite/accept": () => SESSION,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/set-password", element: <SetPassword /> },
      { path: "/dashboard", element: <p>The dashboard</p> },
      { path: "/login", element: <p>Sign in</p> },
    ],
    { initialEntries: [at] }
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

beforeEach(() => {
  store.dispatch(signedOut());
  store.dispatch(authChecked());
});

afterEach(() => {
  cleanup();
  store.dispatch(authApi.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
  document.cookie.split(";").forEach((c) => (document.cookie = `${c.split("=")[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`));
});

const accepts = (calls: Call[]) => calls.filter((c) => c.path === "/auth/login-invite/accept");
const server = (status: number, message: string, code: string) => () =>
  new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("Set your password (a teacher's or a staff member's login invitation)", () => {
  it("shows the school and the email they will sign in with, and asks for nothing but a password; the token is checked in a POST body", async () => {
    const { calls, router } = openPage();
    expect(await screen.findByRole("heading", { name: "Set your password" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^School/)).toHaveValue("Sunrise Public School");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("meena@school.example");
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.queryByLabelText(/Username/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/)).not.toBeInTheDocument();
    expect(calls).toEqual([expect.objectContaining({ method: "POST", path: "/auth/login-invite/check", body: { token: "abc123" } })]);
    // The one-time token leaves the address at once.
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("holds a password that breaks the rules, or two that differ, and sends nothing", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Set your password" });
    await user.type(screen.getByLabelText(/^Password/, { selector: "input" }), "weak");
    await user.type(screen.getByLabelText(/^Confirm password/, { selector: "input" }), "weak");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("does not meet all the requirements");
    await user.clear(screen.getByLabelText(/^Password/, { selector: "input" }));
    await user.type(screen.getByLabelText(/^Password/, { selector: "input" }), GOOD_PASSWORD);
    await user.clear(screen.getByLabelText(/^Confirm password/, { selector: "input" }));
    await user.type(screen.getByLabelText(/^Confirm password/, { selector: "input" }), "Sch00l@Teach2");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("The two passwords do not match.")).toBeInTheDocument();
    expect(accepts(calls)).toHaveLength(0);
  });

  it("sets the password with the token and signs them in", async () => {
    const { calls, router, user } = openPage();
    await screen.findByRole("heading", { name: "Set your password" });
    await user.type(screen.getByLabelText(/^Password/, { selector: "input" }), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/, { selector: "input" }), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(accepts(calls)).toEqual([expect.objectContaining({ method: "POST", body: { token: "abc123", password: GOOD_PASSWORD } })]);
    expect(store.getState().auth.user).toMatchObject({ email: "meena@school.example", role: "teacher" });
  });

  it("says plainly when the link has expired or was already used, with the way to sign in", async () => {
    openPage({ "POST /auth/login-invite/check": server(400, "This link has expired. Ask your school to send it again.", "INVITE_EXPIRED") });
    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    expect(screen.getByText("This link has expired. Ask your school to send it again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
    cleanup();
    store.dispatch(authApi.util.resetApiState());

    openPage({ "POST /auth/login-invite/check": server(409, "This link was already used. Sign in with your email and password.", "ALREADY_REGISTERED") });
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
  });

  it("a link that goes bad between the check and the password (sent again by the school) is said the same way", async () => {
    const { user } = openPage({ "POST /auth/login-invite/accept": server(400, "This link is invalid. Ask your school to send it again.", "INVITE_INVALID") });
    await screen.findByRole("heading", { name: "Set your password" });
    await user.type(screen.getByLabelText(/^Password/, { selector: "input" }), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/, { selector: "input" }), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(screen.getByText("This link is invalid. Ask your school to send it again.")).toBeInTheDocument();
  });

  it("says the link is incomplete when it has no token, and asks the server nothing", async () => {
    const { calls } = openPage({}, "/set-password");
    expect(await screen.findByRole("heading", { name: "This link doesn't work" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
