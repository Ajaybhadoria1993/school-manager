/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { authApi } from "../../../redux/api/authApi";
import store from "../../../redux/store";
import { authChecked, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../../test/fakeApi";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import LoginPage from "../Login";

// The sign-in page's geometry is written in the stylesheet: it is read as text (a window with a size is not available here).
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const SESSION = (over: object = {}) => ({
  user: { id: "u1", name: "Meena Singh", email: null, username: "meena.singh", role: "teacher", tenantId: "t1", emailVerifiedAt: null, ...over },
  tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
  accessToken: "access",
  refreshToken: "refresh",
  token: "access",
});

function openPage(handlers: Record<string, () => unknown> = {}) {
  const calls = fakeApi({ "POST /auth/login": () => SESSION(), ...handlers });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/dashboard", element: <p>The dashboard</p> },
    ],
    { initialEntries: ["/login"] }
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return { calls, user: userEvent.setup(), router };
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("The sign-in page's look (the school's new picture, the form in its circle)", () => {
  it("is the form in the picture's circle: the picture is decoration, the form is one round `main` with the words of the design", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Login to Your Account", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Access your dashboard and explore more")).toBeInTheDocument();
    // The new picture has the logo in it, so the round form has none; a small screen (no circle) keeps the logo in the card.
    expect(screen.getByRole("img", { name: "EduShiksha" })).toHaveAttribute("src", "/images/EduShiksha_logo.png");
    expect(screen.queryByRole("link", { name: "EduShiksha home" })).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/brand/logo-mark.svg"]')).toBeNull();
    const picture = document.querySelector<HTMLImageElement>('img[src="/images/School%20Login.webp"]');
    expect(picture).not.toBeNull();
    expect(picture).toHaveAttribute("alt", "");
    // The old picture is not used any more.
    expect(document.querySelector('img[src="/images/School%20Login.png"]')).toBeNull();
    const card = screen.getByRole("heading", { name: "Login to Your Account" }).closest("main");
    expect(card?.className).toContain("login-main");
    expect(card?.closest(".login-page")).not.toBeNull();
    expect(card?.querySelector(".login-content")).not.toBeNull();
  });

  it("fits the picture to the window by its own rule (a squeeze or stretch of 5% at most, then a trim), not by a plain stretch, cover or contain; no blur, no fading edges, no margins", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Login to Your Account" });
    const copies = [...document.querySelectorAll<HTMLImageElement>('img[src="/images/School%20Login.webp"]')];
    expect(copies).toHaveLength(1);
    // The size and place come from `.login-picture` in index.css (a 15% stretch made the faces look pulled wide).
    expect(copies[0].className).toContain("login-picture");
    expect(copies[0].className).not.toMatch(/object-fill|object-cover|object-contain|size-full/);
    expect(copies[0].className).not.toMatch(/blur|mask|scale-/);
    expect(copies[0]).toHaveAttribute("alt", "");
    // Its own size, so the browser knows the shape before it has loaded.
    expect(copies[0]).toHaveAttribute("width", "3952");
    expect(copies[0]).toHaveAttribute("height", "1882");
    // Nothing narrows the page to a box of its own (the margins of the earlier stage are gone).
    expect(document.querySelector(".login-stage")).toBeNull();
  });

  it("puts the round form on the picture's circle by the picture's own numbers (3952 x 1882, the circle at 76.75% across and half way down), so it stays in the circle however the window is shaped", () => {
    // The geometry lives in index.css; a window is not available here, so what is checked is that it is written from the picture's own size.
    expect(css).toContain("calc(3952 / 1882)");
    expect(css).toMatch(/--cx:[^;]*0\.7675/);
    expect(css).toMatch(/--cy:[^;]*0\.5/);
    expect(css).toMatch(/\.login-main\s*\{[^}]*border-radius:\s*9999px/);
    // A circle only where there is room for one: a window wide (3:2 at least) and tall enough; a phone or a 4:3 window gets the card.
    expect(css).toMatch(/@media \(min-width: 1024px\) and \(min-height: 560px\) and \(min-aspect-ratio: 3\/2\)/);
  });

  it("sizes the form by the height of the screen (a window on a laptop is not tall), so it never fills it", async () => {
    openPage();
    const card = (await screen.findByRole("heading", { name: "Login to Your Account" })).closest("main");
    expect(card?.closest(".login-card")).not.toBeNull();
    // The form takes its sizes from the variables the screen's height sets.
    expect(card?.className).toContain("var(--lp-pt)");
    expect(screen.getByRole("button", { name: "Login" }).className).toContain("var(--lp-btn)");
    expect(screen.getByLabelText("Email or username").className).toContain("var(--lp-field)");
    expect(screen.getByLabelText("Password").className).toContain("var(--lp-field)");
  });

  it("has the boxes the design has, with the words of the sign-in the school already used", async () => {
    openPage();
    expect(await screen.findByPlaceholderText("Email or username")).toBe(screen.getByLabelText("Email or username"));
    expect(screen.getByPlaceholderText("Password")).toBe(screen.getByLabelText("Password"));
    expect(screen.getByRole("checkbox", { name: "Remember me" })).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByRole("button", { name: "Login" })).toBeDisabled();
  });

  it("the way to a new school is here now (there is no landing page): Register your school leads to the sign-up", async () => {
    openPage();
    expect(await screen.findByRole("link", { name: "Register your school" })).toHaveAttribute("href", "/signup");
  });

  it("offers no Login as Student: students have no login of their own", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Login to Your Account" });
    expect(screen.queryByText(/login as student/i)).not.toBeInTheDocument();
  });

  it("shows the reason a person was sent back here", async () => {
    fakeApi({});
    const router = createMemoryRouter([{ path: "/login", element: <LoginPage /> }], { initialEntries: ["/login?reason=expired"] });
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Your session has expired. Please sign in again.");
  });
});

describe("Sign in: email or username", () => {
  it("asks for an email or a username in one box", async () => {
    openPage();
    expect(await screen.findByLabelText("Email or username")).toBeInTheDocument();
    expect(screen.getByLabelText("Email or username")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Email or username")).toHaveAttribute("autocomplete", "username");
  });

  it("signs a teacher in with a username, in one request, and opens the dashboard", async () => {
    const { calls, user, router } = openPage();
    await user.type(await screen.findByLabelText("Email or username"), " Meena.Singh ");
    await user.type(screen.getByLabelText("Password"), "Sch00l@Teach1");
    await user.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/auth/login", body: { identifier: "meena.singh", password: "Sch00l@Teach1" } });
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("still signs in with an email", async () => {
    const { calls, user } = openPage();
    await user.type(await screen.findByLabelText("Email or username"), "Admin@School.example");
    await user.type(screen.getByLabelText("Password"), "Sch00l@Admin");
    await user.click(screen.getByRole("button", { name: "Login" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ identifier: "admin@school.example" });
  });

  it("shows what is typed in small letters (an email or a username is never kept in capitals)", async () => {
    const { user } = openPage();
    const box = await screen.findByLabelText("Email or username");
    await user.type(box, "Admin@School.example");
    expect(box).toHaveValue("admin@school.example");
  });

  it("says what is wrong with the box before anything is sent", async () => {
    const { calls, user } = openPage();
    await user.type(await screen.findByLabelText("Email or username"), "two words");
    await user.type(screen.getByLabelText("Password"), "x");
    await user.click(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByText("Enter a valid email address or username.")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("shows the server's words when the sign-in is refused", async () => {
    const { user } = openPage({
      "POST /auth/login": () => new Response(JSON.stringify({ success: false, message: "Invalid email/username or password" }), { status: 401, headers: { "Content-Type": "application/json" } }),
    });
    await user.type(await screen.findByLabelText("Email or username"), "meena.singh");
    await user.type(screen.getByLabelText("Password"), "Wrong@1234");
    await user.click(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByText("Invalid email/username or password")).toBeInTheDocument();
  });
});
