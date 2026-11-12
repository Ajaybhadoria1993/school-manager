import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
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
  it("has a plain header with the numbers of the class, the classes before and after it, and the page's buttons", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Class 5", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("22 students · 2 sections · 20 of 42 seats left · Primary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("href", "/school-class");
    expect(screen.getByRole("link", { name: "Previous class: Class 1" })).toHaveAttribute("href", "/school-class/c1");
    expect(screen.getByRole("link", { name: "Next class: Class 6" })).toHaveAttribute("href", "/school-class/c6");
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new?class=c5");
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/school/students/export?class=c5");
    // The numbers are the server's, for this class only.
    expect(calls.find((c) => c.path === "/students/class-overview")?.query).toBe("?classId=c5");
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
    expect(screen.getByRole("heading", { name: /Students of Class 5 - B/ })).toBeInTheDocument();
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
    expect(screen.getByText("1 student · no sections · Primary")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /Sections of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which section's students?" })).not.toBeInTheDocument();
  });

  it("a class with ONE section needs no section card and asks nothing: its students are listed at once, and the buttons still use that section", async () => {
    const gita = { ...ASHA, id: "s3", firstName: "Gita", lastName: "Nair", name: "Gita Nair", place: { ...ASHA.place!, classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A" } };
    const { calls } = openPage("/school-class/c6", { "GET /students": (_body, query) => ({ ...studentsFor(query), items: [gita], total: 1 }) });
    expect(await screen.findByText("Gita Nair")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /Sections of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Which section's students?" })).not.toBeInTheDocument();
    // "Students of Class 6" and the count, with no "- A": the one section is the class.
    expect(screen.getByRole("heading", { name: "Students of Class 61" })).toBeInTheDocument();
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
