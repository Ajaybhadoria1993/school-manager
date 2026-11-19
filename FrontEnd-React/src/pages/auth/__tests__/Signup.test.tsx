import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { authApi } from "../../../redux/api/authApi";
import store from "../../../redux/store";
import { authChecked, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../../test/fakeApi";
import SignupPage from "../Signup";

function openPage() {
  const calls = fakeApi({ "POST /auth/signup": () => ({ ttlHours: 24 }) });
  const router = createMemoryRouter([{ path: "/signup", element: <SignupPage /> }], { initialEntries: ["/signup"] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("Register your school: the email box", () => {
  it("keeps the email in small letters, even when capitals are typed", async () => {
    const { user } = openPage();
    const box = await screen.findByLabelText(/Your email/);
    await user.type(box, "Principal.Meena@Sunrise-School.IN");
    expect(box).toHaveValue("principal.meena@sunrise-school.in");
  });

  it("does not touch the school name: it keeps its capital letters", async () => {
    const { user } = openPage();
    const box = await screen.findByLabelText(/School name/);
    await user.type(box, "Sunrise Public School");
    expect(box).toHaveValue("Sunrise Public School");
  });

  it("sends the email in small letters, and says so on the 'check your email' screen", async () => {
    const { calls, user } = openPage();
    await user.type(await screen.findByLabelText(/School name/), "Sunrise Public School");
    await user.type(screen.getByLabelText(/Your email/), "Principal.Meena@Sunrise-School.IN");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ schoolName: "Sunrise Public School", email: "principal.meena@sunrise-school.in" });
    expect(await screen.findByText("principal.meena@sunrise-school.in")).toBeInTheDocument();
  });
});
