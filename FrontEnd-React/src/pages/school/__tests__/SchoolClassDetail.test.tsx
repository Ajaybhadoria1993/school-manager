import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { ASHA, STRUCTURE, classOverviewFor, studentsFor } from "../../../test/schoolClass";
import SchoolClassDetailPage from "../SchoolClassDetail";

function openPage(path = "/school-class/c5", extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query),
    "GET /students": (_body, query) => studentsFor(query),
    // The teachers box of a picked section (its own tests: SchoolClassTeachers.test.tsx).
    "GET /subjects/allotments": () => ({ unit: null, rows: [], siblings: [], totals: { periods: 0, available: null } }),
    "GET /staff/teachers": () => ({ items: [] }),
    "GET /subjects": () => ({ items: [] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school-class", element: <p>All classes</p> },
      { path: "/school-class/:classId", element: <SchoolClassDetailPage /> },
      { path: "/school/students/new", element: <p>The admission form</p> },
      { path: "/school/students/import", element: <p>The bulk upload</p> },
    ],
    { initialEntries: [path] }
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
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const lists = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/students");
const sections = () => screen.getByRole("navigation", { name: "Sections of Class 5" });

describe("Add student on a class's page", () => {
  it("opens the form and says it came from this class, so the menu stays on Classes and the way back leads to this class", async () => {
    const { router, user } = openPage();
    await screen.findByRole("heading", { name: "Class 5", level: 1 });
    await user.click(screen.getByRole("link", { name: "Add student" }));
    expect(await screen.findByText("The admission form")).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ cameFrom: { href: "/school-class/c5", label: "Class 5" } });
  });
});

describe("one class of School Class", () => {
  it("has a plain header, the name and the class teacher with the classes before and after it, and no line of numbers under the title", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Class 5", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/seats left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22 students/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Students of/ })).not.toBeInTheDocument();
    const header = screen.getByRole("heading", { name: "Class 5", level: 1 }).closest("header")!;
    expect(within(header).getByRole("link", { name: "Previous class: Class 1" })).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Next class: Class 6" })).toBeInTheDocument();
    // The buttons are not in the header: they sit with the search box.
    expect(within(header).queryByRole("link", { name: "Add student" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Export" })).not.toBeInTheDocument();
  });

  it("the search box and the page's buttons are one row, under the sections", async () => {
    signInAs();
    const { calls } = openPage("/school-class/c5?section=c5-A");
    await screen.findByText("Asha Verma");
    const tools = screen.getByRole("group", { name: "Search and actions" });
    expect(within(tools).getByRole("textbox", { name: "Search the students of Class 5 - A" })).toBeInTheDocument();
    for (const name of ["Timetable & teachers", "Class work", "Export", "Bulk upload", "Add student"]) {
      expect(within(tools).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("href", "/school-class");
    expect(within(tools).getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new?class=c5&section=c5-A");
    expect(within(tools).getByRole("link", { name: "Export" })).toHaveAttribute("href", "/school/students/export?class=c5&section=c5-A");
    // The numbers are the server's, for this class only.
    expect(calls.find((c) => c.path === "/students/class-overview")?.query).toBe("?classId=c5");
  });

  it("a class with sections and none picked still has its buttons (no search box: there is nobody listed yet)", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Which section's students?" });
    const tools = screen.getByRole("group", { name: "Search and actions" });
    expect(within(tools).getByRole("link", { name: "Timetable & teachers" })).toBeInTheDocument();
    expect(within(tools).getByRole("link", { name: "Add student" })).toBeInTheDocument();
    expect(within(tools).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("asks which section first: the cards are there, the students are not listed until one is picked", async () => {
    const { calls } = openPage();
    const cards = within(await screen.findByRole("navigation", { name: "Sections of Class 5" })).getAllByRole("link");
    expect(cards.map((c) => c.textContent)).toEqual(["All sections22students in the whole class", "Section AOpen20of 40 seats filledRoom 5A", "Section BFull2of 2 seats filled"]);
    expect(cards.every((c) => !c.hasAttribute("aria-current"))).toBe(true);
    expect(screen.getByRole("heading", { name: "Which section's students?" })).toBeInTheDocument();
    expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument();
    expect(lists(calls)).toHaveLength(0);
  });

  it("picking a section shows the students of that section with one request; All sections shows the whole class", async () => {
    const { calls, user, router } = openPage();
    await screen.findByRole("heading", { name: "Which section's students?" });
    await user.click(within(sections()).getByRole("link", { name: /Section B/ }));
    expect(await screen.findByText("Bina Rao")).toBeInTheDocument();
    expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument();
    expect(router.state.location.search).toBe("?section=c5-B");
    expect(screen.getByRole("region", { name: "Students of Class 5 - B" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Students of/ })).not.toBeInTheDocument();
    expect(lists(calls)).toHaveLength(1);
    expect(lists(calls)[0].query).toContain("classId=c5");
    expect(lists(calls)[0].query).toContain("sectionId=c5-B");
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new?class=c5&section=c5-B");
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/school/students/export?class=c5&section=c5-B");
    // The class and its sections were read once: picking a section asks only for the students.
    expect(calls.filter((c) => c.path === "/students/class-overview")).toHaveLength(1);

    await user.click(within(sections()).getByRole("link", { name: /All sections/ }));
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.getByText("Bina Rao")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?section=all");
    expect(lists(calls).at(-1)?.query).not.toContain("sectionId");
    expect(within(sections()).getByRole("link", { name: /All sections/ })).toHaveAttribute("aria-current", "page");
  });

  it("opens straight on the section a link names (a section chip of the class card); a wrong one asks again", async () => {
    openPage("/school-class/c5?section=c5-A");
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.queryByText("Bina Rao")).not.toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class/c5?section=nope");
    expect(await screen.findByRole("heading", { name: "Which section's students?" })).toBeInTheDocument();
  });

  it("a search narrows the students, one request once typing stops, and says so when nobody matches", async () => {
    const { calls, user } = openPage("/school-class/c5?section=all");
    await screen.findByText("Asha Verma");
    await user.type(screen.getByRole("textbox", { name: "Search the students of Class 5" }), "bina");
    await waitFor(() => expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument());
    expect(screen.getByText("Bina Rao")).toBeInTheDocument();
    expect(lists(calls).at(-1)?.query).toContain("q=bina");
    await user.clear(screen.getByRole("textbox", { name: "Search the students of Class 5" }));
    await user.type(screen.getByRole("textbox", { name: "Search the students of Class 5" }), "zzz");
    expect(await screen.findByRole("heading", { name: "Nobody matches" })).toBeInTheDocument();
  });

  it("a class without sections shows its students at once, with no section cards and no question", async () => {
    openPage("/school-class/c1");
    expect(await screen.findByText("Dev Rao")).toBeInTheDocument();
    expect(screen.queryByText(/no sections/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /Sections of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which section's students?" })).not.toBeInTheDocument();
  });

  it("a class with ONE section needs no section card and asks nothing: its students are listed at once, and the buttons still use that section", async () => {
    const gita = { ...ASHA, id: "s3", firstName: "Gita", lastName: "Nair", name: "Gita Nair", place: { ...ASHA.place!, classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A" } };
    const { calls } = openPage("/school-class/c6", { "GET /students": (_body, query) => ({ ...studentsFor(query), items: [gita], total: 1 }) });
    expect(await screen.findByText("Gita Nair")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /Sections of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which section's students?" })).not.toBeInTheDocument();
    // The list is "Students of Class 6", with no "- A": the one section is the class. No heading and no count above it.
    expect(screen.getByRole("region", { name: "Students of Class 6" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Students of/ })).not.toBeInTheDocument();
    // The whole class is listed (the one section is all of it) ...
    expect(lists(calls)).toHaveLength(1);
    expect(lists(calls)[0].query).toContain("classId=c6");
    expect(lists(calls)[0].query).not.toContain("sectionId");
    // ... and a student is still admitted into that one section, and its class teacher is named.
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new?class=c6&section=c6-A");
    expect(screen.getByText("Class teacher: N/A")).toBeInTheDocument();
  });

  it("a class that is not in the school says so, with a way back", async () => {
    openPage("/school-class/nope");
    expect(await screen.findByRole("heading", { name: "This class is not in your school" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Classes" })).toHaveAttribute("href", "/school-class");
  });
});

describe("the arrows to the classes before and after", () => {
  const titleRow = async (name: string) => within((await screen.findByRole("heading", { name, level: 1 })).parentElement!);

  it("sit right beside the title (not alone at the far edge of the page), the one before and the one after together", async () => {
    openPage("/school-class/c5");
    const row = await titleRow("Class 5");
    const before = row.getByRole("link", { name: "Previous class: Class 1" });
    const after = row.getByRole("link", { name: "Next class: Class 6" });
    expect(before).toHaveAttribute("href", "/school-class/c1");
    expect(after).toHaveAttribute("href", "/school-class/c6");
    // The previous one comes first, then the next one.
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the first class has a dimmed arrow where the one before would be, so the pair never moves", async () => {
    openPage("/school-class/c1");
    const row = await titleRow("Class 1");
    expect(row.queryByRole("link", { name: /^Previous class/ })).toBeNull();
    expect(row.getByLabelText("No class before this one")).toHaveAttribute("aria-disabled", "true");
    expect(row.getByRole("link", { name: "Next class: Class 5" })).toBeInTheDocument();
    // The class teacher's badge stays with them (a class without sections names it at once).
    expect(row.getByText("Class teacher: N/A")).toBeInTheDocument();
  });

  it("the last class has one where the next would be", async () => {
    // Class 6 is the last class of this school.
    openPage("/school-class/c6", { "GET /academics/structure": () => ({ ...STRUCTURE, classes: STRUCTURE.classes.slice(0, 3) }) });
    const row = await titleRow("Class 6");
    expect(row.getByRole("link", { name: "Previous class: Class 5" })).toBeInTheDocument();
    expect(row.queryByRole("link", { name: /^Next class/ })).toBeNull();
    expect(row.getByLabelText("No class after this one")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Bulk upload on a class page", () => {
  it("opens the bulk upload for this class and says it came from this class, so the menu stays on Classes and the way back leads here", async () => {
    signInAs();
    const { router, user } = openPage();
    await screen.findByRole("heading", { name: "Class 5", level: 1 });
    const link = screen.getByRole("link", { name: "Bulk upload" });
    expect(link).toHaveAttribute("href", "/school/students/import?class=c5");
    await user.click(link);
    expect(await screen.findByText("The bulk upload")).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ cameFrom: { href: "/school-class/c5", label: "Class 5" } });
  });

  it("goes with the picked section, and with the only section of a class that has just one", async () => {
    signInAs();
    openPage("/school-class/c5?section=c5-B");
    await screen.findByRole("heading", { name: "Class 5", level: 1 });
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import?class=c5&section=c5-B");
    cleanup();
    openPage("/school-class/c6");
    await screen.findByRole("heading", { name: "Class 6", level: 1 });
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import?class=c6&section=c6-A");
  });

  it("an empty class offers it beside Add a student", async () => {
    signInAs();
    openPage("/school-class/c1", { "GET /students": () => ({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 }) });
    await screen.findByRole("heading", { name: "No students in Class 1 yet" });
    expect(screen.getAllByRole("link", { name: "Bulk upload" })).toHaveLength(2);
  });

  it("is for the people who may admit students: a person who may only look does not see it", async () => {
    signInAs("staff", ["students.view"]);
    openPage();
    await screen.findByRole("heading", { name: "Class 5", level: 1 });
    expect(screen.queryByRole("link", { name: "Bulk upload" })).not.toBeInTheDocument();
  });
});
