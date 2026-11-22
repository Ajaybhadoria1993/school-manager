import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { authApi } from "../../../redux/api/authApi";
import store from "../../../redux/store";
import { authChecked, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import AcceptInvite from "../AcceptInvite";
import ForgotPassword from "../ForgotPassword";
import ResetPassword from "../ResetPassword";
import Signup from "../Signup";

/**
 * Forgot password, Register your school, Choose a new password and Set up the school's account all stand in the same frame as the sign-in
 * page (2026-11-21): the school's picture, and the form on its circle. The old split screen (a campus photo with "One place for your whole
 * school" and three points) is gone. A form that is too tall for a circle (a password, its rules, a confirmation) is a round-cornered card
 * on the same spot instead.
 */

const SCHOOL_LINK = { kind: "invite", email: "admin@school.example", schoolName: "Sunrise Public School", expiresAt: "2026-11-09T00:00:00.000Z" };

function open(path: string, element: React.ReactNode, handlers: Record<string, Handler> = {}) {
  const calls = fakeApi({ "POST /auth/forgot-password": () => ({ ttlMinutes: 30 }), "POST /auth/invite/check": () => SCHOOL_LINK, ...handlers });
  const router = createMemoryRouter(
    [
      { path: path.split("?")[0], element },
      { path: "/login", element: <p>Sign in</p> },
      { path: "/forgot-password", element: <p>Forgot</p> },
      { path: "/signup", element: <p>Register</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
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
});

const PICTURE = 'img[src="/images/School%20Login.webp"]';
const frameOf = (heading: string) => screen.getByRole("heading", { name: heading, level: 1 }).closest("main");

/** What the old split screen had, none of which is left. */
function expectNoOldSplitScreen() {
  expect(screen.queryByText(/One place for your whole/)).not.toBeInTheDocument();
  expect(screen.queryByText("EduShiksha Portal")).not.toBeInTheDocument();
  expect(screen.queryByText(/Coming to your school|What happens next/)).not.toBeInTheDocument();
  expect(document.querySelector('img[src="/images/hero-campus.jpg"]')).toBeNull();
}

describe("Forgot your password?: the form is on the picture's circle", () => {
  it("stands in the sign-in page's frame: the school's picture, a round form, no old split screen", async () => {
    open("/forgot-password", <ForgotPassword />);
    expect(await screen.findByRole("heading", { name: "Forgot your password?", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    const frame = frameOf("Forgot your password?");
    expect(frame?.className).toContain("login-main");
    expect(frame?.className).not.toContain("login-main--tall");
    expect(frame?.closest(".login-page")).not.toBeNull();
    expectNoOldSplitScreen();
  });

  it("keeps what it did: the email box, Send reset link, and the way back to sign in", async () => {
    open("/forgot-password", <ForgotPassword />);
    expect(await screen.findByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });

  it("sends the link in one request and says so, with the same wording whether or not the account exists", async () => {
    const { calls, user } = open("/forgot-password", <ForgotPassword />);
    await user.type(await screen.findByLabelText("Email"), "meena@school.example");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1));
    expect(calls.find((c) => c.path === "/auth/forgot-password")?.body).toEqual({ email: "meena@school.example" });
    expect(await screen.findByRole("heading", { name: "Check your email", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/If an account exists for/)).toHaveTextContent("meena@school.example");
    expect(screen.getByText(/expires in 30 minutes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled();
    expectNoOldSplitScreen();
  });

  it("refuses an address that is not an email without asking the server", async () => {
    const { calls, user } = open("/forgot-password", <ForgotPassword />);
    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});

describe("Register your school: the form is on the picture's circle", () => {
  it("stands in the same frame, with the same words as before and no old split screen", async () => {
    open("/signup", <Signup />);
    expect(await screen.findByRole("heading", { name: "Register your school", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    const frame = frameOf("Register your school");
    expect(frame?.className).toContain("login-main");
    expect(frame?.className).not.toContain("login-main--tall");
    expect(screen.getByLabelText(/School name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your email/)).toBeInTheDocument();
    // No lines of help under the boxes: the boxes say what to type (2026-11-21, the user asked for them to go).
    expect(screen.queryByText(/Add the city if the name is common/)).not.toBeInTheDocument();
    expect(screen.queryByText(/We send the confirmation link here/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expectNoOldSplitScreen();
  });

  it("the 'check your email' screen is in the same frame too", async () => {
    const { user } = open("/signup", <Signup />, { "POST /auth/signup": () => ({ ttlHours: 24 }) });
    await user.type(await screen.findByLabelText(/School name/), "Sunrise Public School");
    await user.type(screen.getByLabelText(/Your email/), "principal@sunrise.example");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Check your email", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    expect(screen.getByRole("button", { name: /Send again in \d+s|Send the link again/ })).toBeInTheDocument();
    expectNoOldSplitScreen();
  });
});

describe("The two screens an email link opens: the same picture, the form on a card too tall for a circle", () => {
  it("Choose a new password is a card on the circle's spot, with the rules of a password", async () => {
    open("/reset-password?token=abc", <ResetPassword />);
    expect(await screen.findByRole("heading", { name: "Choose a new password", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    const frame = frameOf("Choose a new password");
    expect(frame?.className).toContain("login-main--tall");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Password requirements" })).toBeInTheDocument();
    expectNoOldSplitScreen();
  });

  it("a link that does not work says so in the same frame, with the way to a new link", async () => {
    open("/reset-password", <ResetPassword />);
    expect(await screen.findByRole("heading", { name: "This link doesn't work", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    expect(screen.getByRole("link", { name: "Get a new link" })).toHaveAttribute("href", "/forgot-password");
    expectNoOldSplitScreen();
  });

  it("Set up the school's account is a card on the circle's spot too: the school, the email, the name, the password", async () => {
    open("/accept-invite?token=abc123", <AcceptInvite />);
    expect(await screen.findByRole("heading", { name: "Set up Sunrise Public School", level: 1 })).toBeInTheDocument();
    expect(document.querySelector(PICTURE)).not.toBeNull();
    expect(frameOf("Set up Sunrise Public School")?.className).toContain("login-main--tall");
    expect(screen.getByLabelText(/^Your full name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create my account" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Already have an account\? Sign in/ })).toHaveAttribute("href", "/login");
    expectNoOldSplitScreen();
  });
});

describe("The old split screen is gone", () => {
  it("is not a component any more: the folder holds the one shell of the family, and the pieces of a password box", () => {
    const files = Object.keys(import.meta.glob("../../../components/auth/*.tsx")).map((p) => p.split("/").pop());
    expect(files.sort()).toEqual(["AuthShell.tsx", "PasswordChecklist.tsx", "PasswordInput.tsx"]);
  });
});
