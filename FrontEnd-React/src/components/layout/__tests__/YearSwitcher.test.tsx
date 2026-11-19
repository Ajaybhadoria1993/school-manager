import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted } from "../../../redux/slices/authSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi } from "../../../test/fakeApi";
import { AppThemeProvider } from "../../../theme/AppThemeProvider";
import { clearTokens, setTokens } from "../../../utils/auth";
import type { AcademicYear } from "../../../types";
import { Topbar } from "../Topbar";
import { YearViewBanner } from "../YearViewBanner";

/**
 * Looking at a past academic year (2026-11-08): a school admin picks a year that is over from the top bar, the screens show it, and a
 * bar says which year is open with one click back to the running one. A school that has no year that is over has nothing to pick.
 */

const year = (id: string, name: string, status: AcademicYear["status"]): AcademicYear => ({ id, name, startDate: "2026-04-01", endDate: "2027-03-31", status, activatedAt: null });
const RUNNING = year("y27", "2027-2028", "active");
const OVER = year("y26", "2026-2027", "closed");
const OLDER = year("y25", "2025-2026", "closed");
const WAITING = year("y28", "2028-2029", "pending");

const signIn = (role: string) =>
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@sunrise.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );

function openApp(years: AcademicYear[]) {
  const calls = fakeApi({
    "GET /academics/academic-years": () => years,
    "GET /notifications": () => ({ items: [], unread: 0, hasMore: false }),
  });
  render(
    <Provider store={store}>
      <AppThemeProvider>
        <ToastProvider>
          <MemoryRouter>
            <Topbar title="Students" onMenuClick={() => {}} />
            <YearViewBanner />
          </MemoryRouter>
        </ToastProvider>
      </AppThemeProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

const picker = () => screen.findByRole("button", { name: /academic year/i });
const listWasAsked = (calls: { path: string }[]) => calls.some((c) => c.path === "/academics/academic-years");

beforeEach(() => {
  setTokens("token-1", "refresh-1");
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(yearViewChanged(null));
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearTokens();
});

describe("the year picker in the top bar", () => {
  it("is not there for a school that has no year that is over: there is nothing to pick", async () => {
    signIn("school_admin");
    const { calls } = openApp([RUNNING, WAITING]);
    await waitFor(() => expect(listWasAsked(calls)).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /academic year/i })).toBeNull();
    expect(screen.queryByText(/^Viewing/)).toBeNull();
  });

  it("shows the running year, and lists every year that has started, newest first (a year that waits is not one to look at)", async () => {
    signIn("school_admin");
    const { user } = openApp([WAITING, RUNNING, OVER, OLDER]);
    const button = await picker();
    expect(button).toHaveTextContent("2027-2028");
    await user.click(button);
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["2027-2028Current", "2026-2027", "2025-2026"]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(items[1]).toHaveAttribute("aria-checked", "false");
  });

  it("choosing a year that is over opens it: the top bar and a bar under it say so, and one click goes back to the running year", async () => {
    signIn("school_admin");
    const { user } = openApp([RUNNING, OVER]);
    await user.click(await picker());
    await user.click(screen.getByRole("menuitemradio", { name: /2026-2027/ }));

    expect(store.getState().yearView.yearId).toBe("y26");
    expect(await picker()).toHaveTextContent("2026-2027");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Viewing 2026-2027")).toBeInTheDocument();
    expect(screen.getByText("Read only")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to 2027-2028" }));
    expect(store.getState().yearView.yearId).toBeNull();
    expect(screen.queryByText(/^Viewing/)).toBeNull();
    expect(await picker()).toHaveTextContent("2027-2028");
  });

  it("choosing the running year in the list is the same as going back", async () => {
    signIn("school_admin");
    const { user } = openApp([RUNNING, OVER]);
    store.dispatch(yearViewChanged("y26"));
    await user.click(await picker());
    await user.click(screen.getByRole("menuitemradio", { name: /2027-2028/ }));
    expect(store.getState().yearView.yearId).toBeNull();
  });

  it("is also for the principal", async () => {
    signIn("principal");
    openApp([RUNNING, OVER]);
    expect(await picker()).toBeInTheDocument();
  });

  it("is not for a teacher: no picker, no bar, and the list of years is not even asked for", async () => {
    signIn("teacher");
    const { calls } = openApp([RUNNING, OVER]);
    await waitFor(() => expect(calls.some((c) => c.path === "/notifications")).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /academic year/i })).toBeNull();
    expect(listWasAsked(calls)).toBe(false);
  });

  it("drops a remembered year that is not one of this school's, once the list is known", async () => {
    signIn("school_admin");
    store.dispatch(yearViewChanged("somebody-elses-year"));
    openApp([RUNNING, OVER]);
    await waitFor(() => expect(store.getState().yearView.yearId).toBeNull());
    expect(screen.queryByText(/^Viewing/)).toBeNull();
  });

  it("keeps a remembered year that is one of this school's: a reload stays on the year", async () => {
    signIn("school_admin");
    store.dispatch(yearViewChanged("y26"));
    openApp([RUNNING, OVER]);
    expect(await screen.findByText("Viewing 2026-2027")).toBeInTheDocument();
    expect(store.getState().yearView.yearId).toBe("y26");
  });
});
