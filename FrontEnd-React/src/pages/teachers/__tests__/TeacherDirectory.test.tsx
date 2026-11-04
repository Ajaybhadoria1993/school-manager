import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherDirectoryPage from "../TeacherDirectory";

const ASHA: Teacher = {
  ...MEENA,
  id: "asha",
  name: "Asha Rao",
  mobile: "9000000011",
  email: "asha@school.example",
  employeeCode: "T-7",
  designation: "PGT (Post graduate teacher)",
  classTeacherOf: ["Class 5 - A"],
  login: { username: "asha.rao_12", isActive: true },
};

function openPage(path = "/teachers", extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/teachers": () => ({ items: [ASHA, DEV, MEENA] }),
    "GET /staff/teachers/summary": () => ({ teaching: 3, classTeachers: 1, withoutClasses: 1, left: 2 }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /academics/structure": () => STRUCTURE,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/teachers", element: <TeacherDirectoryPage /> },
      { path: "/teachers/new", element: <p>Add teacher</p> },
      { path: "/teachers/:id", element: <p>One teacher</p> },
      { path: "/teachers/:id/edit", element: <p>Change teacher</p> },
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

const listCalls = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/staff/teachers");
const lastQuery = (calls: Call[]) => new URLSearchParams(listCalls(calls).at(-1)?.query ?? "");
const rowsOf = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
type User = ReturnType<typeof userEvent.setup>;
/** Opens a filter (the app's dropdown: its name ends with the filter's name) and picks a row. */
async function pick(user: User, filter: string, option: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`(^|\\s)${filter}$`) }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("Teacher (the menu entry on top)", () => {
  it("has a plain header with Add teacher, and four counts on top", async () => {
    // The numbers count up, as on the dashboard; for someone who asks for less motion they are there at once (so here too).
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "All Teachers", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add teacher" })).toHaveAttribute("href", "/teachers/new");
    const counts = screen.getByRole("region", { name: "Teacher counts" });
    await waitFor(() => expect(counts).toHaveTextContent(/Teachers\s*3.*Class teachers\s*1.*Without classes\s*1.*Have left\s*2/));
    expect(calls.filter((c) => c.path === "/staff/teachers/summary")).toHaveLength(1);
  });

  it("lists every teacher: who they are, how to reach them, what they teach, their class, their username and whether they teach here", async () => {
    openPage();
    const table = await screen.findByRole("table", { name: "Teachers" });
    const rows = rowsOf(table);
    expect(rows.map((r) => within(r).getAllByRole("link")[0].textContent)).toEqual(["Asha Rao", "Dev Patel", "Meena Singh"]);
    expect(rows[0]).toHaveTextContent("PGT (Post graduate teacher)");
    expect(rows[0]).toHaveTextContent("T-7");
    expect(rows[0]).toHaveTextContent("90000 00011");
    expect(rows[0]).toHaveTextContent("asha@school.example");
    expect(rows[0]).toHaveTextContent("Class 5 - A");
    expect(rows[0]).toHaveTextContent("asha.rao_12");
    expect(within(rows[0]).getByText("Teaching")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("Mathematics");
    expect(rows[2]).toHaveTextContent("2 classes · 12 periods a week");
    expect(rows[1]).toHaveTextContent("No login");
    expect(rows[1]).toHaveTextContent("Nothing yet");
    expect(screen.getByText("3 teachers")).toBeInTheDocument();
  });

  it("opens a teacher from the name or anywhere on the row, and changes one from the pencil", async () => {
    const { user, router } = openPage();
    const table = await screen.findByRole("table", { name: "Teachers" });
    await user.click(within(table).getByRole("link", { name: "Asha Rao" }));
    expect(router.state.location.pathname).toBe("/teachers/asha");

    await router.navigate("/teachers");
    await user.click(within(await screen.findByRole("table", { name: "Teachers" })).getByText("Class 5 - A"));
    expect(router.state.location.pathname).toBe("/teachers/asha");

    await router.navigate("/teachers");
    const pencil = await screen.findByRole("link", { name: "Edit Asha Rao" });
    expect(pencil).toHaveAttribute("href", "/teachers/asha/edit");
    await user.click(pencil);
    expect(router.state.location.pathname).toBe("/teachers/asha/edit");
  });

  it("asks the server for the teaching ones first, and searches by what is typed once the typing stops", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Teachers" });
    expect(lastQuery(calls).get("status")).toBe("active");
    await user.type(screen.getByRole("textbox", { name: "Search teachers" }), "asha");
    await waitFor(() => expect(lastQuery(calls).get("search")).toBe("asha"));
    // One request for the word, not one for each letter.
    expect(listCalls(calls).filter((c) => c.query.includes("search=")).length).toBe(1);
  });

  it("has only the search and four dropdowns (Status, Subject, Class, Designation), each showing its own name (no labels)", async () => {
    openPage();
    await screen.findByRole("table", { name: "Teachers" });
    const bar = screen.getByRole("search", { name: "Find teachers" });
    expect(within(bar).getByRole("textbox", { name: "Search teachers" })).toBeInTheDocument();
    const dropdowns = within(bar).getAllByRole("button").map((b) => b.textContent?.trim());
    expect(dropdowns).toEqual(["Teaching", "Subject", "Class", "Designation"]);
    // The other filters are gone (the user asked on 2026-11-03).
    for (const gone of ["Employment", "Gender", "Login", "Class teacher"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`(^|\\s)${gone}$`) })).not.toBeInTheDocument();
    }
  });

  it("filters by what they teach, a class and their post, each a question to the server kept in the address; the counts are not asked again", async () => {
    const { calls, user, router } = openPage();
    await screen.findByRole("table", { name: "Teachers" });
    await pick(user, "Subject", "Mathematics");
    await waitFor(() => expect(lastQuery(calls).get("subjectId")).toBe("maths"));
    expect(screen.getByRole("button", { name: /(^|\s)Subject$/ })).toHaveTextContent("Mathematics");
    await pick(user, "Class", "Class 5");
    await waitFor(() => expect(lastQuery(calls).get("classId")).toBe("c5"));
    await pick(user, "Designation", "PGT (Post graduate teacher)");
    await waitFor(() => expect(lastQuery(calls).get("designation")).toBe("PGT (Post graduate teacher)"));
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toMatchObject({ subject: "maths", class: "c5", designation: "PGT (Post graduate teacher)" });
    // The counts on top are the school's: a filter does not ask for them again.
    expect(calls.filter((c) => c.path === "/staff/teachers/summary")).toHaveLength(1);

    // "All subjects" in the list takes that one filter away.
    await pick(user, "Subject", "All subjects");
    await waitFor(() => expect(lastQuery(calls).get("subjectId")).toBeNull());
    expect(screen.getByRole("button", { name: /(^|\s)Subject$/ })).toHaveTextContent("Subject");
  });

  it("a dropdown picked while the search still waits is kept when the search goes out", async () => {
    const { user, router } = openPage();
    await screen.findByRole("table", { name: "Teachers" });
    await user.type(screen.getByRole("textbox", { name: "Search teachers" }), "a");
    // Within the 300 ms the search waits, the address changes (what a dropdown does, only quicker than a click can be).
    await act(() => router.navigate("/teachers?subject=maths", { replace: true }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("q")).toBe("a"));
    expect(new URLSearchParams(router.state.location.search).get("subject")).toBe("maths");
  });

  it("starts from the filters in the address (an old address with a filter that is gone asks nothing for it), and Clear filters takes them all away", async () => {
    const { calls, user } = openPage("/teachers?subject=maths&class=c5&login=with");
    await screen.findByRole("table", { name: "Teachers" });
    expect(lastQuery(calls).get("subjectId")).toBe("maths");
    expect(lastQuery(calls).get("classId")).toBe("c5");
    expect(lastQuery(calls).get("login")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(lastQuery(calls).get("subjectId")).toBeNull());
    expect(lastQuery(calls).get("classId")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows the teachers who have left, or everyone, from the Status dropdown, each row saying which", async () => {
    const GONE: Teacher = { ...DEV, id: "gone", name: "Gone Teacher", isActive: false };
    const { calls, user } = openPage("/teachers", {
      "GET /staff/teachers": (_body, query) => ({ items: query.get("status") === "active" ? [ASHA] : query.get("status") === "inactive" ? [GONE] : [ASHA, GONE] }),
    });
    await screen.findByRole("table", { name: "Teachers" });
    expect(screen.getByRole("button", { name: /(^|\s)Status$/ })).toHaveTextContent("Teaching");
    await pick(user, "Status", "Have left");
    await waitFor(() => expect(lastQuery(calls).get("status")).toBe("inactive"));
    // (Twice in the page: the Status column, and under the name for a phone, where that column is hidden.)
    await waitFor(() => expect(within(rowsOf(screen.getByRole("table", { name: "Teachers" }))[0]).getAllByText("Left").length).toBeGreaterThan(0));
    await pick(user, "Status", "All teachers");
    await waitFor(() => expect(lastQuery(calls).get("status")).toBe("all"));
  });

  it("says so when nobody matches, with a way back", async () => {
    const { user, calls } = openPage("/teachers?designation=Coordinator", { "GET /staff/teachers": () => ({ items: [] }) });
    expect(await screen.findByText("No teacher matches")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(lastQuery(calls).get("designation")).toBeNull());
  });

  it("with no teachers at all, says so under the Add teacher button", async () => {
    openPage("/teachers", { "GET /staff/teachers": () => ({ items: [] }), "GET /staff/teachers/summary": () => ({ teaching: 0, classTeachers: 0, withoutClasses: 0, left: 0 }) });
    expect(await screen.findByText("No teachers yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add teacher" }).every((l) => l.getAttribute("href") === "/teachers/new")).toBe(true);
  });
});
