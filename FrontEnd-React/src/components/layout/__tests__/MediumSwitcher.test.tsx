import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { useGetStructureQuery } from "../../../redux/api/academicsApi";
import store from "../../../redux/store";
import { sessionStarted } from "../../../redux/slices/authSlice";
import { MEDIUM_KEY, mediumChanged } from "../../../redux/slices/mediumSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { clearTokens, setTokens } from "../../../utils/auth";
import { MediumSwitcher } from "../MediumSwitcher";

/**
 * A school that teaches in more than one medium runs each on its own. Its administrator moves between them from the top bar: the requests
 * name the side (`X-School-Medium`), and everything on screen is read again for it.
 */

const SIDES = [
  { id: "t1", label: "English Medium" },
  { id: "t2", label: "Hindi Medium" },
];

const signIn = (role: string, mediums = SIDES) =>
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@sunrise.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true, mediums },
    } as never)
  );

/** A screen that shows something of the school, and says which side each request asked for. */
function Page() {
  const { data } = useGetStructureQuery();
  const { pathname } = useLocation();
  return (
    <>
      <p>Classes: {data?.data.classes.length ?? "..."}</p>
      <p>At {pathname}</p>
    </>
  );
}

function openApp(path = "/school/classes") {
  const asked: (string | null)[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const side = request.headers.get("X-School-Medium");
    asked.push(side);
    if (side === "gone") return new Response(JSON.stringify({ success: false, message: "That medium is not part of your school.", code: "MEDIUM_NOT_FOUND" }), { status: 403, headers: { "Content-Type": "application/json" } });
    const classes = Array.from({ length: side === "t2" ? 3 : 7 }, (_, i) => ({ id: `c${i}`, name: `Class ${i + 1}`, sections: [] }));
    return new Response(JSON.stringify({ success: true, data: { academicYear: null, settings: {}, departments: [], classes, totals: {} } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <MediumSwitcher />
        <Page />
      </MemoryRouter>
    </Provider>
  );
  return { asked, user: userEvent.setup() };
}

const switcher = () => screen.findByRole("button", { name: "Medium" });

beforeEach(() => {
  setTokens("token-1", "refresh-1");
  sessionStorage.clear();
  store.dispatch(mediumChanged(null));
  store.dispatch(yearViewChanged(null));
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearTokens();
});

describe("the medium switch in the top bar", () => {
  it("is not there for a school with one medium: there is nothing to switch", async () => {
    signIn("school_admin", []);
    openApp();
    await screen.findByText("Classes: 7");
    expect(screen.queryByRole("button", { name: "Medium" })).not.toBeInTheDocument();
  });

  it("is only for the school's administrator", async () => {
    signIn("principal");
    openApp();
    await screen.findByText("Classes: 7");
    expect(screen.queryByRole("button", { name: "Medium" })).not.toBeInTheDocument();
  });

  it("is there for a teacher who teaches in two mediums, and moves them too", async () => {
    signIn("teacher");
    const { user, asked } = openApp();
    expect(await switcher()).toHaveTextContent("English Medium");
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "Hindi Medium" }));
    await screen.findByText("Classes: 3");
    expect(asked.at(-1)).toBe("t2");
  });

  it("is not there for a teacher of one medium", async () => {
    signIn("teacher", []);
    openApp();
    await screen.findByText("Classes: 7");
    expect(screen.queryByRole("button", { name: "Medium" })).not.toBeInTheDocument();
  });

  it("starts on the first medium, and sends nothing extra for it", async () => {
    signIn("school_admin");
    const { asked } = openApp();
    expect(await switcher()).toHaveTextContent("English Medium");
    await screen.findByText("Classes: 7");
    expect(asked).toEqual([null]);
  });

  it("lists both mediums, with the open one ticked", async () => {
    signIn("school_admin");
    const { user } = openApp();
    await user.click(await switcher());
    expect(screen.getByRole("menuitemradio", { name: "English Medium" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Hindi Medium" })).toHaveAttribute("aria-checked", "false");
  });

  it("moving to the other medium reads everything again for it", async () => {
    signIn("school_admin");
    const { user, asked } = openApp();
    await screen.findByText("Classes: 7");
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "Hindi Medium" }));
    await screen.findByText("Classes: 3");
    expect(asked.at(-1)).toBe("t2");
    expect(await switcher()).toHaveTextContent("Hindi Medium");
  });

  it("goes to the dashboard: a page open on one medium means nothing on the other", async () => {
    signIn("school_admin");
    const { user } = openApp("/school-class/abc");
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "Hindi Medium" }));
    await screen.findByText("At /dashboard");
  });

  it("coming back to the first medium stops naming a side", async () => {
    store.dispatch(mediumChanged("t2"));
    signIn("school_admin");
    const { user, asked } = openApp();
    await screen.findByText("Classes: 3");
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "English Medium" }));
    await screen.findByText("Classes: 7");
    expect(asked.at(-1)).toBeNull();
    expect(store.getState().medium.mediumId).toBeNull();
  });

  it("closes a past year that was open: that year is the other medium's", async () => {
    store.dispatch(yearViewChanged("y25"));
    signIn("school_admin");
    const { user } = openApp();
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "Hindi Medium" }));
    await waitFor(() => expect(store.getState().yearView.yearId).toBeNull());
  });

  it("the tab remembers the medium, so a reload stays on it", async () => {
    signIn("school_admin");
    const { user } = openApp();
    await user.click(await switcher());
    await user.click(screen.getByRole("menuitemradio", { name: "Hindi Medium" }));
    await waitFor(() => expect(sessionStorage.getItem(MEDIUM_KEY)).toBe("t2"));
  });

  it("a remembered medium this school does not have is forgotten", async () => {
    store.dispatch(mediumChanged("other-school"));
    signIn("school_admin");
    openApp();
    expect(await switcher()).toHaveTextContent("English Medium");
    await waitFor(() => expect(store.getState().medium.mediumId).toBeNull());
  });

  it("goes back to the first medium when the server refuses the one that was open", async () => {
    store.dispatch(mediumChanged("gone"));
    signIn("school_admin", [...SIDES, { id: "gone", label: "Regional Medium" }]);
    openApp();
    await screen.findByText("Classes: 7");
    expect(store.getState().medium.mediumId).toBeNull();
  });
});

describe("the medium list is in the look of the top bar's menus", () => {
  it("opens under a small heading, with the medium in use ticked", async () => {
    signIn("school_admin");
    const { user } = openApp();
    await user.click(await switcher());
    const menu = screen.getByRole("menu", { name: "Mediums" });
    expect(within(menu).getByText("Switch medium")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "English Medium" })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: "Hindi Medium" })).toHaveAttribute("aria-checked", "false");
    expect(await switcher()).toHaveAttribute("aria-expanded", "true");
  });
});
