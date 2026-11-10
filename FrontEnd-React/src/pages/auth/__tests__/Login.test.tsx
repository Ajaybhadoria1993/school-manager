import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { authApi } from "../../../redux/api/authApi";
import store from "../../../redux/store";
import { authChecked, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../../test/fakeApi";
import LoginPage from "../Login";

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
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/auth/login", body: { identifier: "meena.singh", password: "Sch00l@Teach1" } });
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("still signs in with an email", async () => {
    const { calls, user } = openPage();
    await user.type(await screen.findByLabelText("Email or username"), "Admin@School.example");
    await user.type(screen.getByLabelText("Password"), "Sch00l@Admin");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
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
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address or username.")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("shows the server's words when the sign-in is refused", async () => {
    const { user } = openPage({
      "POST /auth/login": () => new Response(JSON.stringify({ success: false, message: "Invalid email/username or password" }), { status: 401, headers: { "Content-Type": "application/json" } }),
    });
    await user.type(await screen.findByLabelText("Email or username"), "meena.singh");
    await user.type(screen.getByLabelText("Password"), "Wrong@1234");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid email/username or password")).toBeInTheDocument();
  });
});
