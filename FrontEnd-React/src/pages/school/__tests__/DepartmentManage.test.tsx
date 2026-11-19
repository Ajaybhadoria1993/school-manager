import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { ClassItem } from "../../../types";
import { fakeApi } from "../../../test/fakeApi";
import { STRUCTURE as BASE } from "../../../test/schoolClass";
import DepartmentManagePage from "../DepartmentManage";

/** Primary holds Class 1 (40 seats, no sections) and Class 5 (100 seats, sections A 40 and B 2); Middle holds Class 6, which has no seats set yet. */
const SEATS: Record<string, number | null> = { c1: 40, c5: 100, c6: null };
const STRUCTURE = {
  ...BASE,
  classes: BASE.classes.map((c) => (c.id in SEATS ? { ...c, capacity: SEATS[c.id] } : c)),
};
const classOf = (id: string): ClassItem => STRUCTURE.classes.find((c) => c.id === id)!;

/** `more`: the server says the department has this many classes in all (so the list has several pages), though it sends only these. */
function department(entry = "/school/classes/departments/d1", more?: number) {
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /academics/classes": (_body, query) => {
      const items = STRUCTURE.classes.filter((c) => c.departmentId === (query.get("departmentId") === "none" ? null : query.get("departmentId")));
      const total = more ?? items.length;
      return { items, page: 1, limit: 10, total, totalPages: Math.ceil(total / 10) };
    },
    "GET /academics/classes/c1": () => classOf("c1"),
    "GET /academics/classes/c5": () => classOf("c5"),
    "GET /academics/classes/c6": () => classOf("c6"),
    "POST /academics/departments/d1/classes": () => ({ department: { id: "d1", name: "Primary", classCount: 3 }, moved: 0, created: 1 }),
    "PATCH /academics/classes/c1": (body) => ({ ...classOf("c1"), ...(body as object) }),
    "PATCH /academics/classes/c5": (body) => ({ ...classOf("c5"), ...(body as object) }),
  });
  const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], { initialEntries: [entry] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("a department's screen, the top of the page", () => {
  it("is a plain header like Students: the name, what is in it, a way back, and the neighbouring department", async () => {
    department();
    const title = await screen.findByRole("heading", { name: "Primary", level: 1 });
    const header = title.closest("header")!;
    expect(header).toHaveTextContent("2 classes");
    expect(header).toHaveTextContent("2 sections");
    // The department's seats are those of its classes: 40 + 100.
    expect(header).toHaveTextContent("140 seats");
    expect(within(header).getByRole("link", { name: "Classes & Sections" })).toHaveAttribute("href", "/school/classes");
    expect(within(header).getByRole("link", { name: /Middle/ })).toHaveAttribute("href", "/school/classes/departments/d2");
    // No deep-blue banner.
    expect(document.querySelector(".from-navy")).toBeNull();
  });
});

describe("a department's screen, the search and the list", () => {
  it("has one slim row for the search and the sort, not a card of its own, with no titles above the boxes", async () => {
    department();
    const bar = await screen.findByRole("search");
    expect(within(bar).getByRole("textbox", { name: "Search classes by name" })).toBeInTheDocument();
    expect(bar.closest(".shadow-card")).toBeNull();
    expect(screen.queryByText("Class name")).toBeNull();
    expect(screen.queryByText("Sort by")).toBeNull();
    expect(within(bar).getByRole("button", { name: "Sorted lowest first: press for highest first" })).toHaveTextContent("Lowest first");
  });

  it("shows no paging controls for a short list: 'Showing 1 to 2 of 2' says nothing the list does not", async () => {
    department();
    await screen.findByRole("button", { name: /Class 1/ });
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("shows them when the list has more than one page", async () => {
    department("/school/classes/departments/d1", 25);
    await screen.findByRole("button", { name: /Class 1/ });
    expect(await screen.findByText("Showing 1 to 2 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });
});

describe("a department's screen, the seats of each class", () => {
  it("shows every class's seats in the list, even a class with no sections, and says so when they are not set", async () => {
    department();
    const rows = await screen.findAllByRole("button", { name: /Class (1|5)/ });
    expect(rows[0]).toHaveTextContent("Class 1");
    expect(rows[0]).toHaveTextContent("No sections · 40 seats");
    expect(rows[1]).toHaveTextContent("2 sections · 100 seats");

    cleanup();
    department("/school/classes/departments/d2");
    const middle = await screen.findByRole("button", { name: /Class 6/ });
    expect(middle).toHaveTextContent("Seats not set");
  });

  it("opens the class with its seats in a box beside the name, and says how the sections share them", async () => {
    department("/school/classes/departments/d1?class=c5");
    const seats = await screen.findByRole("textbox", { name: "Seats of Class 5" });
    expect(seats).toHaveValue("100");
    expect(screen.getByText("42 of 100 seats are in sections, 58 free.")).toBeInTheDocument();
  });

  it("adds no note under a class with no sections: its seats are in the box and that is all there is to say", async () => {
    department("/school/classes/departments/d1?class=c1");
    expect(await screen.findByRole("textbox", { name: "Seats of Class 1" })).toHaveValue("40");
    expect(screen.queryByText(/for the whole class/)).toBeNull();
    expect(screen.queryByText(/of 40 seats/)).toBeNull();
  });

  it("asks for the seats of a class that has none yet, without holding a rename back", async () => {
    department("/school/classes/departments/d2?class=c6");
    const seats = await screen.findByRole("textbox", { name: "Seats of Class 6" });
    expect(seats).toHaveValue("");
    expect(screen.getByText("Seats not set. Enter them and press Save.")).toBeInTheDocument();
  });

  it("changes the seats with the one Save, and sends only the seats", async () => {
    const { calls, user } = department("/school/classes/departments/d1?class=c1");
    const seats = await screen.findByRole("textbox", { name: "Seats of Class 1" });
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    await user.clear(seats);
    await user.type(seats, "55");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/academics/classes/c1", body: { capacity: 55 } });
  });

  it("will not save empty seats, says why, and sends nothing", async () => {
    const { calls, user } = department("/school/classes/departments/d1?class=c1");
    const seats = await screen.findByRole("textbox", { name: "Seats of Class 1" });
    await user.clear(seats);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the seats of the class.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("will not save seats the sections already hold more than (the server would say the same)", async () => {
    const { calls, user } = department("/school/classes/departments/d1?class=c5");
    const seats = await screen.findByRole("textbox", { name: "Seats of Class 5" });
    await user.clear(seats);
    await user.type(seats, "30");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/The sections would hold 42 seats, more than the class's 30/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });
});

describe("a department's screen, the class on the right", () => {
  it("says a class with no sections has none and puts the one button that adds one in the middle of that box, not twice", async () => {
    department("/school/classes/departments/d1?class=c1");
    expect(await screen.findByText("No sections yet")).toBeInTheDocument();
    expect(screen.getByText("Add sections (A, B, C) only if this class is split into groups.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add section A to Class 1" })).toHaveLength(1);
    // The old long explanations are gone.
    expect(screen.queryByText(/sits together/)).toBeNull();
    expect(screen.queryByText(/Not split into sections/)).toBeNull();
  });

  it("keeps the Section button in the header once the class has sections", async () => {
    department("/school/classes/departments/d1?class=c5");
    expect(await screen.findByRole("button", { name: "Add section C to Class 5" })).toBeInTheDocument();
    expect(screen.queryByText("No sections yet")).toBeNull();
  });

  it("does not repeat itself for a class that is already in a department", async () => {
    department("/school/classes/departments/d1?class=c1");
    await screen.findByRole("textbox", { name: "Seats of Class 1" });
    expect(screen.queryByText(/It is in no department yet/)).toBeNull();
  });
});

describe("a department's screen, renaming the department and making it inactive", () => {
  it("is done from the pencil beside the name: one window with the name, and no way to delete anything", async () => {
    department();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rename or make Primary inactive" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Department name")).toBeInTheDocument();
    expect(within(dialog).getByText("Pick a name from the list, or choose Other... to type your own.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Delete/)).toBeNull();
  });

  it("will not make a department with active classes inactive: it says how many, and the button is off", async () => {
    department();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rename or make Primary inactive" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("It still has 2 active classes. Make them inactive first.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Make inactive" })).toBeDisabled();
  });

  it("asks first, then makes a department with no active class inactive and goes back to the classes", async () => {
    const calls = fakeApi({
      "GET /academics/structure": () => ({ ...STRUCTURE, departments: [{ id: "d1", name: "Primary", classCount: 0 }] }),
      "GET /academics/classes": () => ({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 }),
      "POST /academics/departments/d1/deactivate": () => ({ id: "d1", name: "Primary", classCount: 0, status: "inactive" }),
    });
    const router = createMemoryRouter(
      [
        { path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> },
        { path: "/school/classes", element: <p>The classes list</p> },
      ],
      { initialEntries: ["/school/classes/departments/d1"] }
    );
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rename or make Primary inactive" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make inactive" }));

    expect(await screen.findByText("Make Primary inactive?")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make inactive" }));
    expect(await screen.findByText("The classes list")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/academics/departments/d1/deactivate"]);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });
});

describe("a department's screen, a class is made inactive, never deleted", () => {
  it("has Make inactive and no Delete, and asks first, saying nothing is deleted", async () => {
    department("/school/classes/departments/d1?class=c1");
    const user = userEvent.setup();
    expect(await screen.findByRole("button", { name: "Make Class 1 inactive" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete Class 1/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Make Class 1 inactive" }));
    expect(await screen.findByText("Make Class 1 inactive?")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(screen.getByText(/still has students cannot be made inactive/)).toBeInTheDocument();
  });

  it("sends only the deactivate request (never a delete)", async () => {
    const { calls, user } = department("/school/classes/departments/d1?class=c1");
    await user.click(await screen.findByRole("button", { name: "Make Class 1 inactive" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make inactive" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/academics/classes/c1/deactivate"]);
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  });

  it("a class that still has students is refused: the server's words are shown in the window, and the class stays", async () => {
    fakeApi({
      "GET /academics/structure": () => STRUCTURE,
      "GET /academics/classes": () => ({ items: [classOf("c1")], page: 1, limit: 10, total: 1, totalPages: 1 }),
      "GET /academics/classes/c1": () => classOf("c1"),
      "POST /academics/classes/c1/deactivate": () =>
        new Response(JSON.stringify({ success: false, message: "Class 1 has 12 students. Move them to another class, or make them inactive, first.", code: "CLASS_HAS_STUDENTS" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], {
      initialEntries: ["/school/classes/departments/d1?class=c1"],
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Make Class 1 inactive" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make inactive" }));
    expect(await within(await screen.findByRole("dialog")).findByText("Class 1 has 12 students. Move them to another class, or make them inactive, first.")).toBeInTheDocument();
    // Still on the class: the window is open over it and nothing left the screen (the page behind a window is hidden from a screen reader).
    expect(screen.getByRole("textbox", { name: "Seats of Class 1", hidden: true })).toBeInTheDocument();
  });

  it("shows an inactive class read-only, with who made it inactive and Make active", async () => {
    const inactive: ClassItem = { ...classOf("c1"), status: "inactive", inactive: { at: "2026-11-10T10:00:00.000Z", by: { name: "Meena Rao", role: "school_admin" } } };
    fakeApi({
      "GET /academics/structure": () => STRUCTURE,
      "GET /academics/classes": () => ({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 }),
      "GET /academics/classes/c1": () => inactive,
      "POST /academics/classes/c1/reactivate": () => ({ ...inactive, status: "active", inactive: null }),
    });
    const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], {
      initialEntries: ["/school/classes/departments/d1?class=c1"],
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    expect(await screen.findByText(/made inactive by Meena Rao on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make Class 1 active" })).toBeInTheDocument();
    // Read-only: nothing to type in, nothing to save, nothing to make inactive.
    expect(screen.queryByRole("textbox", { name: "Seats of Class 1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make Class 1 inactive" })).toBeNull();
  });
});

describe("a department's screen, adding a class to it", () => {
  async function typeANewClass() {
    const page = department();
    await screen.findByRole("heading", { name: "Primary", level: 1 });
    await page.user.click(screen.getByRole("button", { name: "Add class" }));
    const name = await screen.findByRole("combobox", { name: "Add a class to Primary" });
    await page.user.type(name, "Class 2");
    // The list of classes stays open while a name that is in it is typed, and hides the rest of the page from a screen reader: close it.
    await page.user.keyboard("{Escape}");
    return page;
  }

  it("needs the seats of a class that is new: a Seats box appears, and without it nothing is sent", async () => {
    const { calls, user } = await typeANewClass();
    expect(await screen.findByRole("textbox", { name: "Seats of Class 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add this class" }));
    expect(await screen.findByText("Enter the seats of the class.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("sends the seats with the new class", async () => {
    const { calls, user } = await typeANewClass();
    await user.type(await screen.findByRole("textbox", { name: "Seats of Class 2" }), "45");
    await user.click(screen.getByRole("button", { name: "Add this class" }));

    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/academics/departments/d1/classes",
      body: { classIds: [], names: ["Class 2"], capacity: 45, sectionCount: 0 },
    });
  });
});

describe("a department's screen, adding a section to a class that has seats", () => {
  it("says how many of the class's seats are left, and will not take more", async () => {
    const { calls, user } = department("/school/classes/departments/d1?class=c5");
    await user.click(await screen.findByRole("button", { name: "Add section C to Class 5" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Class 5 has 58 of its 100 seats left for sections/)).toBeInTheDocument();

    await user.type(within(dialog).getByRole("textbox", { name: /Seats/ }), "80");
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    expect(await within(dialog).findByText("At most 58 seats are left in the class.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

describe("a department's screen, a class with students in it cannot get a first section by hand", () => {
  const REFUSED = () =>
    new Response(
      JSON.stringify({
        success: false,
        message: "Class 1 has 40 students who are not in a section. Divide the class into sections instead: the students are shared out between them.",
        code: "CLASS_HAS_UNSECTIONED_STUDENTS",
        details: [{ path: "classId", message: "40 students are not in a section", enrolled: 40 }],
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );

  async function openAddSection(handlers: Parameters<typeof fakeApi>[0] = {}) {
    const calls = fakeApi({
      "GET /academics/structure": () => ({ ...STRUCTURE, classes: STRUCTURE.classes.map((c) => (c.id === "c1" ? { ...c, capacity: 100 } : c)) }),
      "GET /academics/classes": () => ({ items: [classOf("c1")], page: 1, limit: 10, total: 1, totalPages: 1 }),
      "GET /academics/classes/c1": () => ({ ...classOf("c1"), capacity: 100 }),
      "POST /academics/classes/c1/sections": REFUSED,
      ...handlers,
    });
    const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], {
      initialEntries: ["/school/classes/departments/d1?class=c1"],
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add section A to Class 1" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Seats/ }), "40");
    await user.click(within(dialog).getByRole("button", { name: "Add section" }));
    return { calls, user };
  }

  it("says why, and offers to divide the class instead", async () => {
    await openAddSection();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Class 1 has 40 students who are not in a section/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Divide Class 1 into sections" })).toBeInTheDocument();
  });

  it("divides it: the window shows where the 40 students would go, and one request makes the sections", async () => {
    const { calls, user } = await openAddSection({
      "POST /academics/classes/c1/divide": () => ({
        class: classOf("c1"),
        sections: [
          { id: "n1", name: "A", capacity: 25, room: null, students: 20 },
          { id: "n2", name: "B", capacity: 25, room: null, students: 20 },
        ],
        moved: 40,
        classSeats: { from: 100, to: 100 },
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Divide Class 1 into sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Divide Class 1 into sections" });
    expect(within(dialog).getByText("A: 20 students · B: 20 students")).toBeInTheDocument();
    // No newcomer here: 20 students need 20 seats, rounded up to 20.
    expect(within(dialog).getByRole("textbox", { name: "Seats in each section" })).toHaveValue("20");
    expect(within(dialog).queryByText(/The new student goes/)).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Make sections" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/academics/classes/c1/divide")).toBe(true));
    expect(calls.find((c) => c.path === "/academics/classes/c1/divide")).toMatchObject({ method: "POST", body: { count: 2, capacity: 20 } });
    expect(await screen.findByText(/Class 1 is divided into A, B. 40 students shared out./)).toBeInTheDocument();
  });

  it("will not take seats too few for the students, and sends nothing", async () => {
    const { calls, user } = await openAddSection();
    await user.click(await screen.findByRole("button", { name: "Divide Class 1 into sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Divide Class 1 into sections" });
    const each = within(dialog).getByRole("textbox", { name: "Seats in each section" });
    await user.clear(each);
    await user.type(each, "10");
    await user.click(within(dialog).getByRole("button", { name: "Make sections" }));
    expect(await within(dialog).findAllByText(/At least 20 seats each/)).not.toHaveLength(0);
    expect(calls.filter((c) => c.path.endsWith("/divide"))).toHaveLength(0);
  });
});

describe("a department's screen, a class made inactive stays in the list", () => {
  /** Class 1 can be made inactive and active again; the server's answers follow its status, as the real one does. */
  function withStatus(start: "active" | "inactive") {
    let status: "active" | "inactive" = start;
    const c1 = () => ({ ...classOf("c1"), status, inactive: status === "inactive" ? { at: "2026-11-10T10:00:00.000Z", by: { name: "Meena Rao", role: "school_admin" } } : null });
    const calls = fakeApi({
      "GET /academics/structure": () => STRUCTURE,
      "GET /academics/classes": (_body, query) => {
        const wanted = query.get("status") ?? "active";
        const items = [c1(), classOf("c5")].filter((c) => (wanted === "all" ? true : (c.status ?? "active") === wanted));
        return { items, page: 1, limit: 10, total: items.length, totalPages: 1 };
      },
      "GET /academics/classes/c1": () => c1(),
      "GET /academics/classes/c5": () => classOf("c5"),
      "POST /academics/classes/c1/deactivate": () => {
        status = "inactive";
        return c1();
      },
      "POST /academics/classes/c1/reactivate": () => {
        status = "active";
        return c1();
      },
    });
    const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], {
      initialEntries: ["/school/classes/departments/d1?class=c1"],
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    return { calls, router, user: userEvent.setup() };
  }
  const classList = () => screen.getAllByRole("list")[0];
  const listed = (name: string) => within(classList()).getByText(name).closest("li") as HTMLElement;

  it("the list asks for every class, active and inactive, and marks an inactive one", async () => {
    const { calls } = withStatus("inactive");
    expect(await screen.findByText("Inactive", { selector: "span.rounded-full" })).toBeInTheDocument();
    const asked = calls.find((c) => c.method === "GET" && c.path === "/academics/classes");
    expect(new URLSearchParams(asked?.query).get("status")).toBe("all");
    // Greyed: its name is muted and it still has its place in the list, next to the active class.
    expect(within(listed("Class 1")).getByText("Inactive")).toBeInTheDocument();
    expect(within(listed("Class 5")).queryByText("Inactive")).toBeNull();
  });

  it("Make inactive keeps the class where it was: still in the list, still open, now marked inactive, with Make active", async () => {
    const { user } = withStatus("active");
    await user.click(await screen.findByRole("button", { name: "Make Class 1 inactive" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make inactive" }));

    // The class on the right says it is inactive and offers Make active; the list still has it, marked.
    expect(await screen.findByRole("button", { name: "Make Class 1 active" })).toBeInTheDocument();
    expect(within(listed("Class 1")).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText(/made inactive by Meena Rao on/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Seats of Class 1" })).toBeNull();
    expect(screen.getByText(/It stays in the list/)).toBeInTheDocument();
  });

  it("Make active brings it back to a class that can be changed, still in its place", async () => {
    const { user, calls } = withStatus("inactive");
    await user.click(await screen.findByRole("button", { name: "Make Class 1 active" }));
    expect(await screen.findByRole("textbox", { name: "Seats of Class 1" })).toBeInTheDocument();
    expect(within(listed("Class 1")).queryByText("Inactive")).toBeNull();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/academics/classes/c1/reactivate"]);
  });

  it("an inactive class can be picked from the list like any other, to be opened", async () => {
    const { user } = withStatus("inactive");
    await user.click(await within((await screen.findAllByRole("list"))[0]).findByText("Class 5"));
    expect(await screen.findByRole("textbox", { name: "Seats of Class 5" })).toBeInTheDocument();
    await user.click(within(listed("Class 1")).getByRole("button"));
    expect(await screen.findByRole("button", { name: "Make Class 1 active" })).toBeInTheDocument();
  });

  it("the header says how many classes of the department are inactive", async () => {
    fakeApi({
      "GET /academics/structure": () => ({ ...STRUCTURE, inactiveClasses: [{ ...classOf("c1"), id: "c10", name: "Class 10", status: "inactive" }] }),
      "GET /academics/classes": () => ({ items: [classOf("c5")], page: 1, limit: 10, total: 1, totalPages: 1 }),
      "GET /academics/classes/c5": () => classOf("c5"),
    });
    const router = createMemoryRouter([{ path: "/school/classes/departments/:departmentId", element: <DepartmentManagePage /> }], { initialEntries: ["/school/classes/departments/d1"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const title = await screen.findByRole("heading", { name: "Primary", level: 1 });
    expect(title.closest("header")).toHaveTextContent("1 inactive");
  });

  it("a Status box shows all classes, only the active ones or only the inactive ones, and Clear brings back all", async () => {
    const { user, calls } = withStatus("inactive");
    await screen.findAllByRole("list");
    await user.click(screen.getByRole("button", { name: /Show classes/ }));
    await user.click(await screen.findByRole("option", { name: "Inactive only" }));
    await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.path === "/academics/classes" && new URLSearchParams(c.query).get("status") === "inactive")).toBe(true));
    expect(within(classList()).queryByText("Class 5")).toBeNull();
    expect(within(classList()).getByText("Class 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(within(classList()).getByText("Class 5")).toBeInTheDocument());
  });
});
