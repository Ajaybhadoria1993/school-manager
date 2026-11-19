import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { AcademicStructure, StudentCapacity } from "../../../types";
import { fakeApi, type Call } from "../../../test/fakeApi";
import { STRUCTURE, classOverviewFor, studentsFor } from "../../../test/schoolClass";
import SchoolClassPage from "../SchoolClass";

/** The school's seat counts (the tiles): 23 students in 72 seats. */
const CAPACITY: StudentCapacity = { academicYear: { id: "y1", name: "2026-2027" }, sections: [], classes: [], totals: { students: 23, seats: 72, seatsLeft: 49, fullSections: 1 } };

function openPage(entry = "/school-class", structure: AcademicStructure = STRUCTURE) {
  const calls = fakeApi({
    "GET /academics/structure": () => structure,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query),
    "GET /students": (_body, query) => studentsFor(query),
    "GET /students/capacity": () => CAPACITY,
  });
  const router = createMemoryRouter(
    [
      { path: "/school-class", element: <SchoolClassPage /> },
      { path: "/school-class/students", element: <SchoolClassPage /> },
      { path: "/school-class/:classId", element: <p>One class</p> },
      { path: "/school/students", element: <p>Manage Students</p> },
      { path: "/school/students/new", element: <p>The admission form</p> },
      { path: "/dashboard", element: <p>Dashboard</p> },
    ],
    { initialEntries: [entry] }
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const card = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name}:`) });
const box = (id: string) => document.getElementById(id) as HTMLElement;
const pick = async (user: ReturnType<typeof userEvent.setup>, id: string, option: string) => {
  await user.click(box(id));
  await user.click(await screen.findByRole("option", { name: option }));
};
const overviewCalls = (calls: Call[]) => calls.filter((c) => c.path === "/students/class-overview");
const studentCalls = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/students");

describe("School Class: laid out like the Teacher page, with filters the server answers", () => {
  it("has the plain header (title, year, breadcrumb and one blue button, Manage classes: no Add student here), no tabs and no subtitle or banner", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Classes", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
    expect(screen.queryByText(/The classes, sections and students of/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    // Classes and Students are the menu's two entries now: the page has no tabs to switch between them.
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /^Class 5:/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "School Class" })).not.toBeInTheDocument();
    const manage = screen.getByRole("link", { name: "Manage classes" });
    expect(manage).toHaveAttribute("href", "/school/classes");
    // The page's one button is in the primary colour (solid blue), like Add student on the Students page.
    expect(manage.className).toContain("bg-primary");
    expect(screen.queryByRole("link", { name: "Add student" })).not.toBeInTheDocument();
  });

  it("shows four counts of the school on top, from reads the app already has (one each)", async () => {
    // The numbers count up; for someone who asks for less motion they are there at once (so here too).
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const { calls } = openPage();
    const counts = await screen.findByRole("region", { name: "School counts" });
    await waitFor(() => expect(counts).toHaveTextContent(/Departments\s*2.*Classes\s*4.*Sections\s*3.*Students\s*23/));
    expect(calls.filter((c) => c.path === "/students/capacity")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/academics/structure")).toHaveLength(1);
  });

  it("shows each class as a card with its students, sections and how full its seats are, wing by wing", async () => {
    openPage();
    expect(await screen.findByRole("link", { name: /^Class 5: 22 students, 2 sections/ })).toBeInTheDocument();
    expect(card("Class 1")).toHaveAccessibleName("Class 1: 1 student, no sections");
    // No line of totals above the classes.
    expect(screen.queryByText(/4 classes · /)).not.toBeInTheDocument();
    const five = screen.getByRole("heading", { name: /^Class 5:/ }).closest("li")!;
    expect(five).toHaveTextContent("22 Students");
    expect(five).toHaveTextContent("2 Sections");
    // The class's seat limit, as the server counts it (its sections' seats added up).
    expect(five).toHaveTextContent("42 Seats");
    const seats = within(five).getByRole("progressbar", { name: "Seats of Class 5 filled" });
    expect(seats).toHaveAttribute("aria-valuenow", "52");
    expect(five).toHaveTextContent("52%");
    // The whole card opens the class.
    expect(card("Class 5")).toHaveAttribute("href", "/school-class/c5");
    expect(screen.getByRole("region", { name: "Primary" })).toHaveTextContent("Class 1");
    expect(screen.getByRole("region", { name: "Other classes" })).toHaveTextContent("Class 9");
  });

  it("each department is one panel: its icon and name, how many classes and which (a range), Add class and a menu; no students count line", async () => {
    openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    const primary = screen.getByRole("region", { name: "Primary" });
    expect(within(primary).getByRole("heading", { name: "Primary", level: 2 })).toBeInTheDocument();
    expect(within(primary).getByText("2 classes")).toBeInTheDocument();
    expect(within(primary).getByText("Classes 1 to 5")).toBeInTheDocument();
    // Add class opens the department's own screen, where its classes are added.
    expect(within(primary).getByRole("link", { name: "Add class to Primary" })).toHaveAttribute("href", "/school/classes/departments/d1");
    expect(within(primary).getByRole("button", { name: "More for Primary" })).toBeInTheDocument();
    // One class: its count, and no range.
    const middle = screen.getByRole("region", { name: "Middle" });
    expect(within(middle).getByText("1 class")).toBeInTheDocument();
    expect(within(middle).queryByText(/ to /)).not.toBeInTheDocument();
    // The classes of a department are cards of one list; another department has its own.
    const panelOf = (name: string) => card(name).closest("ul");
    expect(panelOf("Class 1")).not.toBeNull();
    expect(panelOf("Class 1")).toBe(panelOf("Class 5"));
    expect(panelOf("Class 6")).not.toBe(panelOf("Class 5"));
    // No "4 classes · 189 students" line (the user asked it away).
    expect(screen.queryByText(/\d+ classes? · \d+ students?/)).not.toBeInTheDocument();
    // The classes in no department take no new class from here.
    expect(within(screen.getByRole("region", { name: "Other classes" })).queryByRole("link", { name: /^Add class/ })).not.toBeInTheDocument();
  });

  it("a department's menu opens its own screen and its students; Escape closes it", async () => {
    const { user } = openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    await user.click(screen.getByRole("button", { name: "More for Primary" }));
    const menu = screen.getByRole("menu", { name: "Primary" });
    expect(within(menu).getByRole("menuitem", { name: "Manage Primary" })).toHaveAttribute("href", "/school/classes/departments/d1");
    expect(within(menu).getByRole("menuitem", { name: "View students" })).toHaveAttribute("href", "/school-class/students?department=d1");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More for Other classes" }));
    const other = screen.getByRole("menu", { name: "Other classes" });
    expect(within(other).getByRole("menuitem", { name: "Manage other classes" })).toHaveAttribute("href", "/school/classes/departments/none");
    expect(within(other).getByRole("menuitem", { name: "View students" })).toHaveAttribute("href", "/school-class/students?department=none");
  });

  it("a class without sections says only its students: no Sections part, no seats bar, no help line", async () => {
    openPage();
    const one = (await screen.findByRole("heading", { name: /^Class 1:/ })).closest("li")!;
    expect(one).toHaveTextContent("1 Student");
    expect(one).not.toHaveTextContent("Section");
    expect(within(one).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(card("Class 1")).toHaveAccessibleName("Class 1: 1 student, no sections");
    expect(one).not.toHaveTextContent("the class sits together");
    expect(screen.queryByText("View students")).not.toBeInTheDocument();
  });

  it("the department and class dropdowns are requests: the server keeps the classes, the browser keeps none away", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    expect(overviewCalls(calls)).toHaveLength(1);
    expect(overviewCalls(calls)[0].query).toBe("");

    await pick(user, "school-class-department", "Middle");
    await waitFor(() => expect(screen.queryByRole("link", { name: /^Class 5:/ })).not.toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: /^Class \d:/ }).map((a) => a.getAttribute("href"))).toEqual(["/school-class/c6"]);
    expect(overviewCalls(calls).at(-1)?.query).toBe("?departmentId=d2");

    await pick(user, "school-class-department", "Primary");
    await pick(user, "school-class-class", "Class 5");
    await waitFor(() => expect(overviewCalls(calls).at(-1)?.query).toBe("?departmentId=d1&classId=c5"));
    expect(screen.getAllByRole("link", { name: /^Class \d:/ })).toHaveLength(1);
    // Nothing else was asked: the students are not read in this view.
    expect(studentCalls(calls)).toHaveLength(0);
  });

  it("a new department forgets the class; Clear filters shows every class again", async () => {
    const { user, router } = openPage("/school-class?department=d1&class=c5");
    await screen.findByRole("link", { name: /^Class 5:/ });
    expect(screen.getAllByRole("link", { name: /^Class \d:/ })).toHaveLength(1);
    await pick(user, "school-class-department", "Middle");
    await waitFor(() => expect(router.state.location.search).toBe("?department=d2"));
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("link", { name: /^Class 1:/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
    expect(screen.getAllByRole("link", { name: /^Class \d:/ })).toHaveLength(4);
  });

  it("a search finds a class by part of its name, as a request to the server", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    await user.type(screen.getByRole("textbox", { name: "Search a class by its name" }), "6");
    await waitFor(() => expect(overviewCalls(calls).at(-1)?.query).toBe("?q=6"));
    expect(screen.getAllByRole("link", { name: /^Class \d:/ }).map((a) => a.getAttribute("href"))).toEqual(["/school-class/c6"]);
  });

  it("the filters are one row with no labels: each dropdown shows its own name", async () => {
    openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    const bar = screen.getByRole("search", { name: "Find classes" });
    expect(within(bar).getByRole("textbox", { name: "Search a class by its name" })).toBeInTheDocument();
    expect(within(bar).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Department", "Class"]);
    // The names are for the eye inside the box; no label sits over a box.
    expect(screen.queryByText("Search a class", { selector: "label" })).not.toBeInTheDocument();
  });

  it("a picked filter shows what was picked, and its list's first row takes it away", async () => {
    const { user, router } = openPage();
    await screen.findByRole("link", { name: /^Class 5:/ });
    await pick(user, "school-class-department", "Middle");
    await waitFor(() => expect(box("school-class-department")).toHaveTextContent("Middle"));
    await pick(user, "school-class-department", "All departments");
    // Every class again (the first answer is still fresh, so it is shown without asking again).
    expect(await screen.findByRole("link", { name: /^Class 5:/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe("");
    expect(box("school-class-department")).toHaveTextContent("Department");
  });

  it("says so when no class matches", async () => {
    openPage("/school-class?department=d2&class=c5");
    expect(await screen.findByRole("heading", { name: "No class matches" })).toBeInTheDocument();
  });
});

describe("School Class: the Students page (/school-class/students, the menu's Students)", () => {
  it("has its own title and no tabs, the school's four counts, and one blue button, Add student: no Manage classes here", async () => {
    openPage("/school-class/students");
    expect(await screen.findByRole("heading", { name: "Students", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(await screen.findByRole("region", { name: "School counts" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage classes" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add student" }).className).toContain("bg-primary");
    await screen.findByText("Dev Rao");
    expect(screen.queryByRole("link", { name: /^Class 5:/ })).not.toBeInTheDocument();
  });

  it("Add student goes to the Manage Students page (2026-11-09), with the chosen class and section in the address", async () => {
    const { router, user } = openPage("/school-class/students?class=c5&section=c5-B");
    await screen.findByText("Bina Rao");
    await user.click(screen.getByRole("link", { name: "Add student" }));
    expect(await screen.findByText("Manage Students")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school/students");
    expect(router.state.location.search).toBe("?class=c5&section=c5-B");
  });

  it("an old address (/school-class?view=students&...) goes to the new one with its filters", async () => {
    const { router } = openPage("/school-class/students?class=c5&section=c5-B");
    expect(await screen.findByText("Bina Rao")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school-class/students");
    expect(router.state.location.search).toBe("?class=c5&section=c5-B");
  });

  it("lists every student, class by class, with one request for them, under its own row of filters", async () => {
    const { calls } = openPage("/school-class/students");
    const bar = await screen.findByRole("search", { name: "Find students" });
    expect(within(bar).getByRole("textbox", { name: "Search students by name or admission number" })).toBeInTheDocument();
    expect(within(bar).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Department", "Class", "Section", "Gender", "Order"]);
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.getByText("Dev Rao")).toBeInTheDocument();
    expect(screen.getByText("Bina Rao")).toBeInTheDocument();
    // The count is the pager's (no second count line above the table).
    expect(screen.getByText(/of 3 students/)).toBeInTheDocument();
    expect(screen.queryByText("3 students")).not.toBeInTheDocument();
    expect(studentCalls(calls)).toHaveLength(1);
    expect(studentCalls(calls)[0].query).not.toContain("classId");
    // The classes are not read for it.
    expect(overviewCalls(calls)).toHaveLength(0);
  });

  it("the department, class, section and search are one request each, answered by the server", async () => {
    const { calls, user } = openPage("/school-class/students");
    expect(await screen.findByText("Dev Rao")).toBeInTheDocument();

    await pick(user, "school-class-department", "Primary");
    await waitFor(() => expect(studentCalls(calls).at(-1)?.query).toContain("departmentId=d1"));
    await pick(user, "school-class-class", "Class 5");
    await waitFor(() => expect(screen.queryByText("Dev Rao")).not.toBeInTheDocument());
    expect(studentCalls(calls).at(-1)?.query).toContain("classId=c5");

    await pick(user, "school-class-section", "Section B");
    await waitFor(() => expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument());
    expect(screen.getByText("Bina Rao")).toBeInTheDocument();
    expect(studentCalls(calls).at(-1)?.query).toContain("sectionId=c5-B");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Dev Rao")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search students by name or admission number" }), "bina");
    await waitFor(() => expect(screen.queryByText("Dev Rao")).not.toBeInTheDocument());
    expect(studentCalls(calls).at(-1)?.query).toContain("q=bina");
    // No class overview was read for any of it.
    expect(overviewCalls(calls)).toHaveLength(0);
  });

  it("the gender and the order are requests too, and Clear filters takes them away", async () => {
    const { calls, user, router } = openPage("/school-class/students");
    await screen.findByText("Dev Rao");
    await pick(user, "school-class-gender", "Girls (Female)");
    await waitFor(() => expect(screen.queryByText("Dev Rao")).not.toBeInTheDocument());
    expect(screen.getByText("Asha Verma")).toBeInTheDocument();
    expect(studentCalls(calls).at(-1)?.query).toContain("gender=Female");

    await pick(user, "school-class-order", "Newest admission first");
    await waitFor(() => expect(studentCalls(calls).at(-1)?.query).toContain("sort=admissionDate"));
    expect(studentCalls(calls).at(-1)?.query).toContain("dir=desc");
    expect(box("school-class-order")).toHaveTextContent("Newest admission first");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Dev Rao")).toBeInTheDocument();
    // Back to everyone (the first answer is still fresh, so it is shown without asking again).
    expect(router.state.location.pathname).toBe("/school-class/students");
    expect(router.state.location.search).toBe("");
  });

  it("the section dropdown waits for a class that has sections", async () => {
    openPage("/school-class/students?class=c1");
    await screen.findByText("Dev Rao");
    expect(box("school-class-section")).toBeDisabled();
  });

  it("Add student is a link to Manage Students with the chosen class and section (none chosen: no filters)", async () => {
    openPage("/school-class/students?class=c5&section=c5-B");
    expect(await screen.findByText("Bina Rao")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students?class=c5&section=c5-B");
    cleanup();
    openPage("/school-class/students");
    expect(await screen.findByText("Dev Rao")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students");
  });

  it("says Nobody matches, with a way back, when the filters keep nobody", async () => {
    const { user } = openPage("/school-class/students");
    await screen.findByText("Dev Rao");
    await user.type(screen.getByRole("textbox", { name: "Search students by name or admission number" }), "zzz");
    // The search waits for the typing to stop, then asks the server. Wait with a cheap text query: a role query on every change of this
    // big page is slow enough to hold the search's timer back (4 s instead of 1.5 s, 2026-11-05), then check it is the heading.
    await screen.findByText("Nobody matches", {}, { timeout: 5000 });
    expect(screen.getByRole("heading", { name: "Nobody matches" })).toBeInTheDocument();
  });

  it("a dropdown picked while the search still waits is kept when the search goes out", async () => {
    const { user, router } = openPage("/school-class/students");
    await screen.findByText("Dev Rao");
    await user.type(screen.getByRole("textbox", { name: "Search students by name or admission number" }), "a");
    // Within the 300 ms the search waits, the address changes (what a dropdown does, only quicker than a click can be).
    await act(() => router.navigate("/school-class/students?gender=Female", { replace: true }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("q")).toBe("a"));
    expect(new URLSearchParams(router.state.location.search).get("gender")).toBe("Female");
  });
});

describe("School Class: a school that is not ready", () => {
  it("with no classes it sends the person to Classes & Sections; with no academic year to the dashboard", async () => {
    openPage("/school-class", { ...STRUCTURE, classes: [], departments: [], totals: { departments: 0, classes: 0, sections: 0, seats: 0 } });
    expect(await screen.findByRole("heading", { name: "Add your classes first" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Classes & Sections" })).toHaveAttribute("href", "/school/classes");
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class", { ...STRUCTURE, academicYear: null });
    expect(await screen.findByRole("heading", { name: "Your school has no current academic year yet" })).toBeInTheDocument();
  });
});
