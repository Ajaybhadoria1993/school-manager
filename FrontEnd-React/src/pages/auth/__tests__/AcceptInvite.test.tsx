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

/** The email links are for the school administrator only (the platform's invitation, and the confirmation of a school registered from the sign-in page). */
const SCHOOL_LINK = { kind: "invite", email: "admin@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-09T00:00:00.000Z" };
const SIGNUP_LINK = { kind: "signup", email: "admin@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-09T00:00:00.000Z" };
const SESSION = {
  user: { id: "u9", name: "Meena Joshi", email: "admin@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: "2026-11-07T00:00:00.000Z" },
  tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "pending", isActive: true },
  accessToken: "access",
  refreshToken: "refresh",
  token: "access",
};
const GOOD_PASSWORD = "Sch00l@Desk1";

function openPage(check: unknown = SCHOOL_LINK, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "POST /auth/invite/check": () => check,
    "POST /auth/accept-invite": () => SESSION,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/accept-invite", element: <AcceptInvite /> },
      { path: "/dashboard", element: <p>The dashboard</p> },
      { path: "/onboarding", element: <p>Onboarding</p> },
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

describe("Accept the school administrator's invitation (the email link stays for the school admin)", () => {
  it("says Set up and Create my account, with the registration side panel and the name empty to fill in", async () => {
    const { calls } = openPage(SCHOOL_LINK);
    expect(await screen.findByRole("heading", { name: "Set up Sunrise Public School" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create my account" })).toBeInTheDocument();
    expect(screen.queryByText(/You are invited as/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Your full name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("admin@school.example");
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    // The token travels in the body of one check, never in the address.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/auth/invite/check", body: { token: "abc123" } });
  });

  it("confirming a school registered from the sign-in page says Confirm your email", async () => {
    openPage(SIGNUP_LINK);
    expect(await screen.findByRole("heading", { name: "Confirm your email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create my account" })).toBeInTheDocument();
  });

  it("sets the name and the password in one request and signs the administrator in", async () => {
    const { calls, user } = openPage(SCHOOL_LINK);
    await user.type(await screen.findByLabelText(/^Your full name/), "Meena Joshi");
    await user.type(screen.getByLabelText(/^Password\*$/), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/auth/accept-invite", body: { token: "abc123", name: "Meena Joshi", password: GOOD_PASSWORD } });
    await waitFor(() => expect(store.getState().auth.user).toMatchObject({ role: "school_admin", email: "admin@school.example" }));
  });

  it("will not accept a weak password, or two that differ, and sends nothing", async () => {
    const { calls, user } = openPage(SCHOOL_LINK);
    await user.type(await screen.findByLabelText(/^Your full name/), "Meena Joshi");
    await user.type(screen.getByLabelText(/^Password\*$/), "weak");
    await user.type(screen.getByLabelText(/^Confirm password/), "weak");
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByText("The password does not meet all the requirements below.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Confirm password/));
    await user.type(screen.getByLabelText(/^Confirm password/), "weak2");
    expect((await screen.findAllByText("The passwords do not match.")).length).toBeGreaterThan(0);
    expect(writes(calls)).toHaveLength(0);
  });

  it("says a link that has expired has, with the platform's words", async () => {
    openPage(SCHOOL_LINK, { "POST /auth/invite/check": server(410, "This invitation has expired.", "INVITE_EXPIRED") });
    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeInTheDocument();
    expect(screen.getByText("This invitation has expired.")).toBeInTheDocument();
    expect(screen.queryByText(/as staff/)).not.toBeInTheDocument();
  });

  it("says a link that is used already is, and opens sign-in", async () => {
    openPage(SCHOOL_LINK, { "POST /auth/invite/check": server(409, "This invitation was already accepted.", "ALREADY_REGISTERED") });
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to sign in" })).toBeInTheDocument();
  });

  it("when the link is used up between the check and the button, shows that instead of the form", async () => {
    const { user } = openPage(SCHOOL_LINK, { "POST /auth/accept-invite": server(409, "This invitation was already accepted.", "ALREADY_REGISTERED") });
    await user.type(await screen.findByLabelText(/^Your full name/), "Meena Joshi");
    await user.type(screen.getByLabelText(/^Password\*$/), GOOD_PASSWORD);
    await user.type(screen.getByLabelText(/^Confirm password/), GOOD_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create my account" }));
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
  });
});
