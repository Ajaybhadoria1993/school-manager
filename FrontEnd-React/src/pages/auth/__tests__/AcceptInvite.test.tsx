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
import AcceptInvite from "../AcceptInvite";

const STAFF_LINK = { kind: "staff", email: "asha@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-09T00:00:00.000Z", name: "Asha Rao", roleLabel: "Receptionist" };
const SCHOOL_LINK = { kind: "invite", email: "admin@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-09T00:00:00.000Z" };
const SESSION = {
  user: { id: "u9", name: "Asha Rao", email: "asha@school.example", username: null, role: "receptionist", tenantId: "t1", emailVerifiedAt: "2026-11-07T00:00:00.000Z" },
  tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
  accessToken: "access",
  refreshToken: "refresh",
  token: "access",
};
const GOOD_PASSWORD = "Sch00l@Desk1";

function openPage(check: unknown = STAFF_LINK, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "POST /auth/invite/check": () => check,
    "POST /auth/accept-invite": () => SESSION,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/accept-invite", element: <AcceptInvite /> },
      { path: "/dashboard", element: <p>The dashboard</p> },
      { path: "/signup", element: <p>Register</p> },
      { path: "/login", element: <p>Sign in</p> },
    ],
    { initialEntries: ["/accept-invite?token=abc123"] }
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

/** The check of the link is a POST too (the token stays out of the address): what counts is the one that accepts. */
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET" && c.path !== "/auth/invite/check");
const server = (status: number, message: string, code: string) => () =>
  new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("Accept a staff invitation", () => {
  it("greets the person by school and role, with the name filled in, the email fixed and a button that accepts", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Join Sunrise Public School" })).toBeInTheDocument();
    expect(screen.getByText(/You are invited as Receptionist/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Your full name/)).toHaveValue("Asha Rao");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("asha@school.example");
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeInTheDocument();
    // The token travels in the body of one check, never in the address.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/invite/check", body: { token: "abc123" } });
  });

  it("does not show the school-registration side panel (confirm email, four steps, approved by a person) to a staff member", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Join Sunrise Public School" });
    expect(screen.queryByText("What happens next")).not.toBeInTheDocument();
    expect(screen.queryByText("Approved by a person")).not.toBeInTheDocument();
  });

  it("sets the password in one request, signs the person in and opens the dashboard", async () => {
    const { calls, router, user } = openPage();
    await user.type(await screen.findByLabelText(/^Password\*$/), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/auth/accept-invite", body: { token: "abc123", name: "Asha Rao", password: GOOD_PASSWORD } });
    expect(store.getState().auth.user).toMatchObject({ role: "receptionist", email: "asha@school.example" });
  });

  it("sends the name as it was corrected", async () => {
    const { calls, user } = openPage();
    const name = await screen.findByLabelText(/^Your full name/);
    await user.clear(name);
    await user.type(name, "  Asha R. Rao ");
    await user.type(screen.getByLabelText(/^Password\*$/), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ name: "Asha R. Rao" });
  });

  it("will not accept a weak password, or two that differ, and sends nothing", async () => {
    const { calls, user } = openPage();
    await user.type(await screen.findByLabelText(/^Password\*$/), "weak");
    await user.type(screen.getByLabelText(/^Confirm password/), "weak");
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText("The password does not meet all the requirements below.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Confirm password/));
    await user.type(screen.getByLabelText(/^Confirm password/), "weak2");
    expect((await screen.findAllByText("The passwords do not match.")).length).toBeGreaterThan(0);
    expect(writes(calls)).toHaveLength(0);
  });

  it("says a link that has expired has, and tells the person to ask the school for a new invitation", async () => {
    openPage(undefined, { "POST /auth/invite/check": server(410, "This invitation has expired.", "INVITE_EXPIRED") });
    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    expect(screen.getByText("This invitation has expired.")).toBeInTheDocument();
    expect(screen.getByText(/Ask your school to send the invitation again/)).toBeInTheDocument();
  });

  it("says a link that is used already is, and opens sign-in", async () => {
    openPage(undefined, { "POST /auth/invite/check": server(409, "This invitation was already accepted.", "ALREADY_REGISTERED") });
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("when the link is used up between the check and the button, shows that instead of the form", async () => {
    const { user } = openPage(undefined, { "POST /auth/accept-invite": server(409, "This invitation was already accepted.", "ALREADY_REGISTERED") });
    await user.type(await screen.findByLabelText(/^Password\*$/), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
  });
});

describe("Accept the school administrator's invitation (unchanged)", () => {
  it("still says Set up and Create my account, with the registration side panel", async () => {
    openPage(SCHOOL_LINK);
    expect(await screen.findByRole("heading", { name: "Set up Sunrise Public School" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create my account" })).toBeInTheDocument();
    expect(screen.queryByText(/You are invited as/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Your full name/)).toHaveValue("");
    expect(screen.getByText("What happens next")).toBeInTheDocument();
  });
});
