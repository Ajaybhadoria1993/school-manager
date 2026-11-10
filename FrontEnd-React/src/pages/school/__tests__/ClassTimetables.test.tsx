import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { GRID, OVERVIEW, REGULAR } from "../../../test/timetableFixtures";
import type { TimetableOverview } from "../../../types";
import ClassTimetablesPage from "../ClassTimetables";
import SchoolTimingsPage from "../SchoolTimings";
import TimetableRedirect from "../TimetableRedirect";

function openPage(overview: TimetableOverview | ((query: URLSearchParams) => TimetableOverview) = OVERVIEW, entry = "/school/timetable", extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /timetable/overview": (_body, query) => (typeof overview === "function" ? overview(query) : overview),
    "GET /timetable/grid": (_body, query) => ({ ...GRID, unit: { ...GRID.unit, sectionId: query.get("sectionId"), label: query.get("sectionId") === "c5-B" ? "Class 5 - B" : "Class 5 - A" } }),
    "GET /timetable/schedules": () => ({ items: [REGULAR] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/timetable", element: <ClassTimetablesPage /> },
      { path: "/school/timings", element: <SchoolTimingsPage /> },
      { path: "/school/timetable/timings", element: <TimetableRedirect /> },
      { path: "/school/timetable/class-subjects", element: <TimetableRedirect /> },
      { path: "/school/timetable/class/:classId/:sectionId", element: <TimetableRedirect /> },
    ],
    { initialEntries: [entry] }
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

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const overviewCalls = (calls: Call[]) => calls.filter((c) => c.path === "/timetable/overview");
const withState = (over: Partial<TimetableOverview>): TimetableOverview => ({ ...OVERVIEW, ...over });
const classList = async () => within(await screen.findByRole("list", { name: "Classes" }));
const noUnits = { units: 0, withSubjects: 0, withTiming: 0, none: 0, draft: 0, published: 0 };

describe("Class timetables: a page of its own (2026-11-09: it was a tab of the Timetable page)", () => {
  it("has its own title, and no tabs: School timings is another entry of the menu, not a tab here", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Class timetables", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "School timings" })).not.toBeInTheDocument();
    // No Subjects and Teachers buttons (subjects are added where they are used), and no line of help under the title.
    expect(screen.queryByRole("link", { name: /^Subjects/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Teachers/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Set the school day once/)).not.toBeInTheDocument();
    // The old four steps are gone.
    expect(screen.queryByText("What each class studies")).not.toBeInTheDocument();
  });

  it("a school with no timings yet is told to set them first, and is not taken anywhere by itself", async () => {
    const { router } = openPage(withState({ counts: { ...OVERVIEW.counts, timings: 0 } }), "/school/timetable", { "GET /timetable/schedules": () => ({ items: [] }) });
    expect(await screen.findByText("Set the school timings first")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school/timetable");
    expect(screen.queryByLabelText("Usual day: school starts")).not.toBeInTheDocument();
  });

  it("the old address with ?tab=timings leads to the School timings page", async () => {
    const { router } = openPage(OVERVIEW, "/school/timetable?tab=timings");
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timings"));
    expect(await screen.findByLabelText("Usual day: school starts")).toBeInTheDocument();
  });
});

describe("School timings: a page of its own", () => {
  it("has its own title, no tabs, and the usual school day to set; it does not ask for the class list", async () => {
    const { calls } = openPage(OVERVIEW, "/school/timings");
    expect(await screen.findByRole("heading", { name: "School timings", level: 1 })).toBeInTheDocument();
    expect(await screen.findByLabelText("Usual day: school starts")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(overviewCalls(calls)).toHaveLength(0);
  });

  it("Now make each class's timetable goes to the Class timetables page", async () => {
    const { router, user } = openPage(OVERVIEW, "/school/timings");
    await user.click(await screen.findByRole("button", { name: /Now make each class's timetable/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timetable"));
  });
});

describe("Class timetables: the list and the week", () => {
  it("lists every class or section with where its timetable stands, and opens the first one", async () => {
    openPage();
    const list = await classList();
    expect(list.getAllByRole("button").map((b) => b.textContent)).toEqual(["Class 5 - ADraft · 7 of 40", "Class 5 - BPublished", "Class 1No subjects yet"]);
    expect(list.getByRole("button", { name: /Class 5 - A/ })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
  });

  it("opens the class picked, and keeps it in the address", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click((await classList()).getByRole("button", { name: /Class 5 - B/ }));
    expect(await screen.findByRole("heading", { name: "Class 5 - B", level: 2 })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?class=c5&section=c5-B");
  });

  it("opens the class named in the address", async () => {
    openPage(OVERVIEW, "/school/timetable?class=c5&section=c5-B");
    expect(await screen.findByRole("heading", { name: "Class 5 - B", level: 2 })).toBeInTheDocument();
    expect((await classList()).getByRole("button", { name: /Class 5 - B/ })).toHaveAttribute("aria-current", "true");
  });

  it("asks the server for the typed name once the typing stops, and for the timetables picked", async () => {
    const { calls, user } = openPage((query) => ({
      ...OVERVIEW,
      units: OVERVIEW.units.filter((u) => (query.get("status") === "published" ? u.status === "published" : true) && u.label.toLowerCase().includes((query.get("search") ?? "").toLowerCase())),
    }));
    await classList();
    expect(overviewCalls(calls).map((c) => c.query)).toEqual(["?status=all"]);
    await user.type(screen.getByLabelText("Search classes"), "class 1");
    await waitFor(() => expect(overviewCalls(calls).at(-1)!.query).toBe("?search=class+1&status=all"));
    expect(overviewCalls(calls).filter((c) => c.query.includes("search")).length).toBe(1);
    await waitFor(async () => expect((await classList()).getAllByRole("button")).toHaveLength(1));

    await user.clear(screen.getByLabelText("Search classes"));
    await user.click(screen.getByRole("button", { name: /Which timetables to show/ }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["All classes (3)", "Not started (1)", "Draft (1)", "Published (1)"]);
    await user.click(screen.getByRole("option", { name: "Published (1)" }));
    await waitFor(() => expect(overviewCalls(calls).at(-1)!.query).toBe("?status=published"));
  });

  it("says when nothing matches", async () => {
    const { user } = openPage((query) => ({ ...OVERVIEW, units: query.get("search") ? [] : OVERVIEW.units }));
    await classList();
    await user.type(screen.getByLabelText("Search classes"), "zzz");
    expect(await screen.findByText("No class matches.")).toBeInTheDocument();
  });
});

describe("Class timetables: when there is nothing to show yet", () => {
  it("asks the school to set up its running year first", async () => {
    openPage(withState({ academicYear: null, units: [], summary: noUnits }), "/school/timetable");
    expect(await screen.findByText("Your school has no running academic year yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("asks the school to add its classes first", async () => {
    openPage(withState({ units: [], summary: noUnits }));
    expect(await screen.findByText("No classes yet", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your classes" })).toHaveAttribute("href", "/school/classes");
  });

  it("asks for the school timings first, and goes there", async () => {
    const { router, user } = openPage(withState({ counts: { ...OVERVIEW.counts, timings: 0 } }), "/school/timetable");
    expect(await screen.findByText("Set the school timings first")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set the school timings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timings"));
  });

  it("says why it could not load, and tries again", async () => {
    let fail = true;
    const { calls, user } = openPage(() => (fail ? (new Response(JSON.stringify({ success: false, message: "The server is busy" }), { status: 500, headers: { "Content-Type": "application/json" } }) as unknown as TimetableOverview) : OVERVIEW));
    expect(await screen.findByText("The server is busy")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list", { name: "Classes" })).toBeInTheDocument();
    expect(overviewCalls(calls).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Timetable: the old addresses", () => {
  it("lead to the right page and class", async () => {
    const one = openPage(OVERVIEW, "/school/timetable/class/c5/c5-B");
    await waitFor(() => expect(one.router.state.location.search).toBe("?class=c5&section=c5-B"));
    expect(one.router.state.location.pathname).toBe("/school/timetable");
    cleanup();
    const two = openPage(OVERVIEW, "/school/timetable/timings");
    await waitFor(() => expect(two.router.state.location.pathname).toBe("/school/timings"));
    expect(two.router.state.location.search).toBe("");
    cleanup();
    const three = openPage(OVERVIEW, "/school/timetable/class-subjects?class=c1&section=none");
    await waitFor(() => expect(three.router.state.location.search).toBe("?class=c1&section=none"));
    expect(three.router.state.location.pathname).toBe("/school/timetable");
  });
});
