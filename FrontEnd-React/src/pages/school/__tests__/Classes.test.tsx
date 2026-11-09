import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/fixtures";
import { STRUCTURE as WITH_DEPARTMENTS } from "../../../test/schoolClass";
import ClassesPage from "../Classes";

function openPage(structure = STRUCTURE): { calls: Call[]; user: ReturnType<typeof userEvent.setup> } {
  const calls = fakeApi({
    "GET /academics/structure": () => structure,
    "POST /academics/classes": (body) => ({ id: "new", name: (body as { name: string }).name, order: 9, departmentId: null, capacity: (body as { capacity: number }).capacity, sections: [] }),
  });
  const router = createMemoryRouter([{ path: "/school/classes", element: <ClassesPage /> }], { initialEntries: ["/school/classes"] });
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
  vi.restoreAllMocks();
});

/** The person asked for less motion, so a tile shows its number at once instead of counting up to it (no timing to wait for). */
function reduceMotion() {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...original(query), matches: /reduce/.test(query) }));
}

describe("Classes & Sections, the top of the page", () => {
  it("is a plain header like Students: the title, a line under it, and Guide, Create department, Add class on the right", async () => {
    openPage();
    const title = await screen.findByRole("heading", { name: "Classes & Sections", level: 1 });
    const header = title.closest("header")!;
    expect([...header.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean)).toEqual([
      "Guide",
      "Create department",
      "Add class",
    ]);
  });

  it("has no blue banner: no 'Manage school' pill and no Department / Class / Section sample tiles", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Classes & Sections", level: 1 });
    expect(screen.queryByText("Manage school")).not.toBeInTheDocument();
    expect(screen.queryByText("for example Primary")).not.toBeInTheDocument();
    expect(document.querySelector(".from-navy")).toBeNull();
  });

  it("still shows the school at a glance and its classes", async () => {
    openPage();
    expect(await screen.findByText("Class 6")).toBeInTheDocument();
    expect(screen.getByText("Departments")).toBeInTheDocument();
    expect(screen.getByText("Seats")).toBeInTheDocument();
  });
});

describe("Classes & Sections, a department's heading", () => {
  it("has only Manage: renaming and deleting the department are done inside it", async () => {
    openPage(WITH_DEPARTMENTS);
    const group = await screen.findByRole("region", { name: "Primary" });
    expect(within(group).getByRole("link", { name: "Manage Primary" })).toHaveAttribute("href", "/school/classes/departments/d1");
    expect(within(group).queryByRole("button", { name: /Rename|Delete/ })).toBeNull();
  });

  it("keeps a class card quiet: a class with no sections says so once, with no extra chip or help icon", async () => {
    openPage();
    const one = (await screen.findByRole("heading", { name: "Class 1" })).closest("article")!;
    expect(one.textContent?.match(/No sections/g)).toHaveLength(1);
    expect(within(one).queryByRole("button", { name: "Does a class need sections?" })).toBeNull();
  });
});

describe("Classes & Sections, the seats of each class", () => {
  const withSeats = { ...STRUCTURE, classes: STRUCTURE.classes.map((c, i) => ({ ...c, capacity: i === 0 ? 40 : 100 })), totals: { ...STRUCTURE.totals, seats: 140 } };

  it("says each card's seats, even for a class with no sections, and the school's total in the Seats tile", async () => {
    reduceMotion();
    openPage(withSeats);
    const one = (await screen.findByRole("heading", { name: "Class 1" })).closest("article")!;
    expect(one).toHaveTextContent("No sections · 40 seats");
    expect((await screen.findByRole("heading", { name: "Class 6" })).closest("article")).toHaveTextContent("1 section · 100 seats");
    const tile = screen.getByText("Across all your classes").closest(".group")!;
    await waitFor(() => expect(tile).toHaveTextContent(/Seatss*140/));
  });

  it("says plainly when a class has no seats yet, and counts those classes in the tile", async () => {
    openPage();
    const one = (await screen.findByRole("heading", { name: "Class 1" })).closest("article")!;
    expect(one).toHaveTextContent("Seats not set");
    expect(screen.getByText("2 classes without seats yet")).toBeInTheDocument();
  });
});

describe("Classes & Sections, adding a class", () => {
  async function openDialog() {
    const page = openPage();
    await screen.findByRole("heading", { name: "Class 1" });
    await page.user.click(screen.getByRole("button", { name: "Add class" }));
    const dialog = await screen.findByRole("dialog");
    return { ...page, dialog };
  }

  it("asks for the class's seats: without them nothing is added and the box says so", async () => {
    const { calls, user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: "Nursery" }));
    await user.click(within(dialog).getByRole("button", { name: "Add class" }));
    expect(await within(dialog).findByText("Enter the seats of the class.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await user.type(within(dialog).getByRole("textbox", { name: /Seats/ }), "0");
    await user.click(within(dialog).getByRole("button", { name: "Add class" }));
    expect(await within(dialog).findByText("Seats must be a whole number from 1 to 2000.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("sends the seats with the class, whether or not it starts with sections", async () => {
    const { calls, user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("radio", { name: "Nursery" }));
    await user.type(within(dialog).getByRole("textbox", { name: /Seats/ }), "120");
    await user.click(within(dialog).getByRole("radio", { name: "None" }));
    await user.click(within(dialog).getByRole("button", { name: "Add class" }));

    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/academics/classes", body: { name: "Nursery", capacity: 120, sectionCount: 0 } });
  });
});
