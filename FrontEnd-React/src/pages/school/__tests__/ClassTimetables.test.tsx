import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
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
/** The list of classes, in the box on top that opens it (2026-11-23, the second reference picture: no list beside the week). */
async function openPicker() {
  if (!screen.queryByRole("dialog", { name: "Choose the class" })) fireEvent.click(await screen.findByRole("button", { name: "Choose the class" }));
  return screen.findByRole("dialog", { name: "Choose the class" });
}
const classList = async () => {
  await openPicker();
  return within(await screen.findByRole("list", { name: "Classes" }));
};
/** Closes the box of classes (Escape): while it is open, the rest of the page is hidden from a screen reader. */
async function closePicker() {
  fireEvent.keyDown(await screen.findByRole("dialog", { name: "Choose the class" }), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose the class" })).not.toBeInTheDocument());
}
const noUnits = { units: 0, withSubjects: 0, withTiming: 0, none: 0, draft: 0, published: 0 };

describe("Class timetables: a page of its own (2026-11-09: it was a tab of the Timetable page)", () => {
  it("has its own title, and the tabs of the class (not School timings: that is another entry of the menu)", async () => {
    openPage();
    // 2026-11-23, the reference picture: the page is Class timetables, the class picked is the card on top.
    expect(await screen.findByRole("heading", { name: "Class timetables", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
    expect(within(screen.getByRole("tablist", { name: "What to manage" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Class Timetable", "Class Settings"]);
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
    // The title is drawn again when the loaded page replaces the loading one, so it is asked for after the boxes are there.
    expect(await screen.findByLabelText("Usual day: school starts")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "School timings", level: 1 })).toBeInTheDocument();
    // Its own tabs only (2026-11-23: Usual / Class / Department / Special Day Timings); no tab leads to the class timetables.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Usual Timings", "Class Timings", "Department Timings", "Special Day Timings"]);
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
    // Active once every subject has a teacher (2026-11-23, user: "subject aur teacher assign hai to Active, nahi to Inactive").
    expect(list.getAllByRole("button").map((b) => b.textContent)).toEqual(["Class 5 - AInactive", "Class 5 - BActive", "Class 1Inactive"]);
    expect(within(list.getByRole("button", { name: /Class 5 - A/ })).getByText("Inactive")).toHaveAttribute("title", "1 subject has no teacher");
    expect(within(list.getByRole("button", { name: /Class 1/ })).getByText("Inactive")).toHaveAttribute("title", "No subjects yet");
    expect(list.getByRole("button", { name: /Class 5 - A/ })).toHaveAttribute("aria-current", "true");
    await closePicker();
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

  it("asks the server for the typed name once the typing stops", async () => {
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
    // The class shown stays the one first opened while the list is searched.
    await closePicker();
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    const { user } = openPage((query) => ({ ...OVERVIEW, units: query.get("search") ? [] : OVERVIEW.units }));
    await classList();
    await user.type(screen.getByLabelText("Search classes"), "zzz");
    expect(await within(screen.getByRole("dialog", { name: "Choose the class" })).findByText("No class matches.")).toBeInTheDocument();
    // The week shown stays.
    await closePicker();
    expect(await screen.findByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "Choose the class" })).toBeInTheDocument();
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

/** 2026-11-23, the second reference picture: the class is chosen in a box on top beside three cards of its week; the filter is at the right of the tabs. */
describe("Class timetables: the class's box on top, the filter beside the tabs", () => {
  const headerOf = async () => screen.findByRole("region", { name: "The class" });

  // 2026-11-23, user: "Students jaise tabs; status hatao; dropdown neeche Class Settings ki line mein; upar 4 normal cards, zyada data".
  it("four cards of the class's week on top, each with a line more; no status there; the class's box is in the line of the tabs", async () => {
    openPage();
    const header = await headerOf();
    expect(await within(header).findByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
    expect(header).toHaveTextContent("Total periods40");
    // How many have a lesson, from the week on screen (the line over the week was taken away, 2026-11-23).
    expect(header).toHaveTextContent("Total periods400 filled · 40 empty");
    expect(header).toHaveTextContent("Subjects21 without a teacher");
    expect(header).toHaveTextContent("School time08:30 – 14:20Mon to Fri");
    // Class time takes the place of Lunch break (2026-11-23, user: "lunch break hata do, yahan class time rakho"); with no arrival or assembly it starts with school.
    expect(header).toHaveTextContent("Class time08:30 – 14:20From when school starts");
    expect(header).not.toHaveTextContent("Lunch break");
    for (const word of ["Not started", "Draft", "Published", "2026-2027"]) expect(within(header).queryByText(word)).not.toBeInTheDocument();
    // The box that chooses the class, in the line of the tabs (the Students page's tabs).
    const box = screen.getByRole("button", { name: "Choose the class" });
    expect(box).toHaveTextContent("Class 5 - A");
    expect(header).not.toContainElement(box);
    expect(screen.getByRole("tablist", { name: "What to manage" }).parentElement).toContainElement(box);
    // Said once.
    expect(screen.getAllByRole("heading", { name: "Class 5 - A" })).toHaveLength(1);
  });

  // 2026-11-23, user: "class change karte hi page load jaisa lagta hai, smooth karo".
  it("while another class's week is read, the one shown stays (no empty page in between), then the new one takes its place", async () => {
    let answer: (() => void) | null = null;
    const slow = (_body: unknown, query: URLSearchParams) => {
      const view = { ...GRID, unit: { ...GRID.unit, sectionId: query.get("sectionId"), label: query.get("sectionId") === "c5-B" ? "Class 5 - B" : "Class 5 - A" } };
      if (query.get("sectionId") !== "c5-B") return view;
      return new Promise((done) => {
        answer = () => done(view);
      });
    };
    const { user } = openPage(OVERVIEW, "/school/timetable", { "GET /timetable/grid": slow });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click((await classList()).getByRole("button", { name: /Class 5 - B/ }));
    // The box closes; the week of Class 5 - A stays, faded, while Class 5 - B's is read.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose the class" })).not.toBeInTheDocument());
    expect(screen.getByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Weekly timetable" }).closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(answer).not.toBeNull());
    answer!();
    expect(await screen.findByRole("heading", { name: "Class 5 - B", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Weekly timetable" }).closest("[aria-busy]")).toBeNull();
    expect((await classList()).getByRole("button", { name: /Class 5 - B/ })).toHaveAttribute("aria-current", "true");
  });

  // 2026-11-23, user: "Class time jaise School timings mein dikhta hai": the time to come in and the assembly come before the first period.
  it("Class time says what comes before the first period (Arrival, Assembly), and School time starts with it", async () => {
    const early = (_body: unknown, query: URLSearchParams) => ({
      ...GRID,
      unit: { ...GRID.unit, sectionId: query.get("sectionId"), label: "Class 5 - A" },
      days: GRID.days.map((d) => ({
        ...d,
        slots: [{ kind: "break" as const, label: "Arrival", start: "08:10", end: "08:15", period: null }, { kind: "break" as const, label: "Assembly", start: "08:15", end: "08:30", period: null }, ...d.slots],
      })),
    });
    openPage(OVERVIEW, "/school/timetable", { "GET /timetable/grid": early });
    const header = await headerOf();
    await within(header).findByRole("heading", { name: "Class 5 - A", level: 2 });
    expect(header).toHaveTextContent("School time08:10 – 14:20Mon to Fri");
    expect(header).toHaveTextContent("Class time08:30 – 14:20Arrival 08:10–08:15 · Assembly 08:15–08:30");
  });

  it("the card follows the class picked from the list", async () => {
    const { user } = openPage();
    await headerOf();
    await user.click((await classList()).getByRole("button", { name: /Class 5 - B/ }));
    expect(await screen.findByRole("heading", { name: "Class 5 - B", level: 2 })).toBeInTheDocument();
  });

  // 2026-11-23, user: "All classes / Not started / Draft / Published hatao".
  it("has no filter of the classes: the box at the right of the tabs is the one way to another class", async () => {
    const { calls } = openPage();
    await headerOf();
    expect(screen.queryByRole("radiogroup", { name: "Which timetables to show" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "What to manage" });
    const box = screen.getByRole("button", { name: "Choose the class" });
    expect(tabs.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overviewCalls(calls).every((c) => c.query === "?status=all")).toBe(true);
  });
});

/** A year that is over is only looked at (2026-11-22, user: "purane mein edit na ho paye"): the week as it was, nothing to change. */
describe("Class timetables: a year that is over", () => {
  afterEach(() => {
    store.dispatch(yearViewChanged(null));
  });

  it("shows the class's week to read, without the editor (no Fill, no Save, no period to click)", async () => {
    store.dispatch(yearViewChanged("y25"));
    openPage();
    expect(await screen.findByText("Read only")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Weekly timetable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save the timetable|Publish the timetable/ })).not.toBeInTheDocument();
  });
});
