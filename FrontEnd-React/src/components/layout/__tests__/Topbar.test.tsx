import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { mediumChanged } from "../../../redux/slices/mediumSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi } from "../../../test/fakeApi";
import { clearTokens, setTokens } from "../../../utils/auth";
import { AppThemeProvider } from "../../../theme/AppThemeProvider";
import { Topbar } from "../Topbar";

/**
 * The bar above every page, in the look of Infinity Medisetu's: the page name at the left; at the right the New button, the time and date,
 * the medium, the bell and the account.
 */

function openBar() {
  setTokens("token-1", "refresh-1");
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@sunrise.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: {
        id: "t1",
        name: "Sunrise Public School",
        approvalStatus: "approved",
        isActive: true,
        mediums: [
          { id: "t1", label: "English Medium" },
          { id: "t2", label: "Hindi Medium" },
        ],
      },
    } as never)
  );
  fakeApi({ "GET /notifications": () => ({ items: [], unread: 0, hasMore: false }), "GET /academics/academic-years": () => [] });
  return render(
    <Provider store={store}>
      <AppThemeProvider>
        <ToastProvider>
          <MemoryRouter>
            <Topbar title="Students" onMenuClick={() => {}} />
          </MemoryRouter>
        </ToastProvider>
      </AppThemeProvider>
    </Provider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  store.dispatch(mediumChanged(null));
  store.dispatch(yearViewChanged(null));
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});
afterEach(() => {
  cleanup();
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
  clearTokens();
});

const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("the top bar", () => {
  it("names the school and the page at the left", async () => {
    openBar();
    expect(await screen.findByText("Sunrise Public School")).toBeInTheDocument();
    expect(screen.getByText("Students")).toBeInTheDocument();
  });

  it("has, at the right and in this order: New, the time and date, the medium, the bell, the account", async () => {
    const { container } = openBar();
    const add = await screen.findByRole("button", { name: "New" });
    const clock = container.querySelector("time")!;
    const medium = await screen.findByRole("button", { name: "Medium" });
    const bell = await screen.findByRole("button", { name: /^Notifications/ });
    const account = screen.getByRole("button", { name: "Account menu" });
    expect(clock).not.toBeNull();
    expect(clock.textContent).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    expect(before(add, clock)).toBe(true);
    expect(before(clock, medium)).toBe(true);
    expect(before(medium, bell)).toBe(true);
    expect(before(bell, account)).toBe(true);
  });

  it("the old date chip is gone: the date is under the time now, once", async () => {
    const { container } = openBar();
    await screen.findByRole("button", { name: "New" });
    const today = container.querySelector("time")!.textContent!;
    expect(today.match(/\b20\d\d\b/g)).toHaveLength(1);
  });
});
