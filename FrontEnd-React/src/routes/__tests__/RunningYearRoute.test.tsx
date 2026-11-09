import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { allApiSlices } from "../../redux/api/apiRoot";
import store from "../../redux/store";
import { sessionStarted } from "../../redux/slices/authSlice";
import { yearViewChanged } from "../../redux/slices/yearViewSlice";
import { fakeApi } from "../../test/fakeApi";
import { clearTokens, setTokens } from "../../utils/auth";
import RunningYearRoute from "../RunningYearRoute";

/**
 * A page that only makes sense in the running year (admitting a student, a bulk upload): while a year that is over is open it says so and
 * offers the way back, instead of letting the school fill in a form the server would refuse at the end.
 */

const YEARS = [
  { id: "y27", name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31", status: "active", activatedAt: null },
  { id: "y26", name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "closed", activatedAt: null },
];

function openApp() {
  fakeApi({ "GET /academics/academic-years": () => YEARS });
  const router = createMemoryRouter([{ element: <RunningYearRoute />, children: [{ path: "/new", element: <p>The admission form</p> }] }], { initialEntries: ["/new"] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return userEvent.setup();
}

beforeEach(() => {
  setTokens("token-1", "refresh-1");
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(yearViewChanged(null));
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearTokens();
  store.dispatch(yearViewChanged(null));
});

describe("a page for the running year", () => {
  it("opens as usual while the running year is open", async () => {
    openApp();
    expect(await screen.findByText("The admission form")).toBeInTheDocument();
  });

  it("while a year that is over is open it says so, and the form is not shown", async () => {
    store.dispatch(yearViewChanged("y26"));
    openApp();
    expect(await screen.findByRole("heading", { name: "2026-2027 is over" })).toBeInTheDocument();
    expect(screen.queryByText("The admission form")).not.toBeInTheDocument();
  });

  it("Back to the running year goes back to it, and the page opens", async () => {
    store.dispatch(yearViewChanged("y26"));
    const user = openApp();
    await user.click(await screen.findByRole("button", { name: "Back to 2027-2028" }));
    expect(await screen.findByText("The admission form")).toBeInTheDocument();
    await waitFor(() => expect(store.getState().yearView.yearId).toBeNull());
  });
});
