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

describe("a department's screen, renaming and deleting the department", () => {
  it("is done from the pencil beside the name: one window with the name and Delete department, which asks first", async () => {
    department();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Rename or delete Primary" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Department name")).toBeInTheDocument();
    expect(within(dialog).getByText("Pick a name from the list, or choose Other... to type your own.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete department" }));
    expect(await screen.findByText("Delete Primary?")).toBeInTheDocument();
    expect(screen.getByText("Its 2 classes stay in your school, in no department.")).toBeInTheDocument();
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
