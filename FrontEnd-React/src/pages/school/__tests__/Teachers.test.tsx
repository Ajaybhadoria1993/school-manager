import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, spreadsheet, type Call, type Handler } from "../../../test/fakeApi";
import { DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeachersPage from "../Teachers";

function openPage(teachers: Teacher[], extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/teachers": (_body, query) => ({ items: teachers.filter((t) => (query.get("status") === "inactive" ? !t.isActive : t.isActive) && (!query.get("search") || t.name.toLowerCase().includes(query.get("search")!.toLowerCase()))) }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/teachers", element: <TeachersPage /> },
      { path: "/school/teachers/new", element: <p>Add a teacher page</p> },
      { path: "/school/teachers/import", element: <p>Bulk upload page</p> },
      { path: "/school/teachers/fields", element: <p>Teacher fields page</p> },
      { path: "/school/teachers/:id", element: <p>One teacher</p> },
      { path: "/school/teachers/:id/edit", element: <p>Change a teacher</p> },
      { path: "/school/timetable/teacher/:teacherId", element: <p>The week</p> },
    ],
    { initialEntries: ["/school/teachers"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup(), router };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const lists = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/staff/teachers");
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const pick = async (user: ReturnType<typeof userEvent.setup>, id: string, option: string) => {
  await user.click(document.getElementById(id) as HTMLElement);
  await user.click(await screen.findByRole("option", { name: option }));
};

const WITH_LOGIN: Teacher = { ...MEENA, login: { username: "meena.singh", isActive: true } };

describe("Teachers: the list", () => {
  it("shows each teacher with their code and mobile, what they can teach, what they were given and the days they do not come", async () => {
    openPage([MEENA, DEV]);
    const meena = (await screen.findByText("Meena Singh")).closest("tr")!;
    expect(meena).toHaveTextContent("T-1 · 9876543210");
    expect(meena).toHaveTextContent("Mathematics");
    expect(meena).toHaveTextContent("2 classes · 12 periods a week");
    expect(meena).toHaveTextContent("Comes every day");
    const dev = screen.getByText("Dev Patel").closest("tr")!;
    expect(dev).toHaveTextContent("No code or mobile");
    expect(dev).toHaveTextContent("Not said");
    expect(dev).toHaveTextContent("Nothing yet");
    expect(within(dev).getByText("Mon")).toBeInTheDocument();
    expect(within(meena).getByRole("link", { name: "Meena Singh's week" })).toHaveAttribute("href", "/school/timetable/teacher/meena");
  });

  it("says who can sign in: the username, or that there is no login yet", async () => {
    openPage([WITH_LOGIN, DEV]);
    const meena = (await screen.findByText("Meena Singh")).closest("tr")!;
    expect(meena).toHaveTextContent("meena.singh");
    expect(screen.getByText("Dev Patel").closest("tr")).toHaveTextContent("No login");
  });

  it("opens a teacher's page from the name, and the change form from Change", async () => {
    const { user, router } = openPage([MEENA]);
    expect(await screen.findByRole("link", { name: "Meena Singh" })).toHaveAttribute("href", "/school/teachers/meena");
    expect(screen.getByRole("link", { name: "Change Meena Singh" })).toHaveAttribute("href", "/school/teachers/meena/edit");
    await user.click(screen.getByRole("link", { name: "Meena Singh" }));
    expect(router.state.location.pathname).toBe("/school/teachers/meena");
  });

  it("warns when what a teacher was given is over their weekly limit", async () => {
    openPage([{ ...MEENA, maxPeriodsPerWeek: 10 }]);
    expect((await screen.findByText("Meena Singh")).closest("tr")).toHaveTextContent("Over their 10");
  });

  it("asks for the teachers by the typed words once the typing stops, and by the tab", async () => {
    const { calls, user } = openPage([MEENA, DEV]);
    await screen.findByText("Meena Singh");
    expect(lists(calls).map((c) => c.query)).toEqual(["?status=active"]);
    await user.type(screen.getByLabelText("Search teachers"), "dev");
    await waitFor(() => expect(lists(calls).at(-1)!.query).toBe("?status=active&search=dev"));
    expect(lists(calls).filter((c) => c.query.includes("search"))).toHaveLength(1);
    expect(await screen.findByText("Dev Patel")).toBeInTheDocument();
    expect(screen.queryByText("Meena Singh")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Left" }));
    await waitFor(() => expect(lists(calls).at(-1)!.query).toBe("?status=inactive&search=dev"));
  });

  it("is friendly when there is nobody yet, and when nobody matches", async () => {
    const { user } = openPage([]);
    expect(await screen.findByText("No teachers yet")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search teachers"), "zzz");
    expect(await screen.findByText("No teacher matches.")).toBeInTheDocument();
  });

  it("goes to the Add teacher page from the header button and from the empty page", async () => {
    const { user, router } = openPage([]);
    await screen.findByText("No teachers yet");
    const links = screen.getAllByRole("link", { name: "Add teacher" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/school/teachers/new");
    await user.click(links[0]);
    expect(router.state.location.pathname).toBe("/school/teachers/new");
  });

  it("goes to Bulk upload from the header button and from the empty page (2026-11-07)", async () => {
    const { user, router } = openPage([]);
    await screen.findByText("No teachers yet");
    const links = screen.getAllByRole("link", { name: "Bulk upload" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/school/teachers/import");
    await user.click(links[0]);
    expect(router.state.location.pathname).toBe("/school/teachers/import");
  });

  it("has Bulk upload in the header when there are teachers, before Add teacher", async () => {
    openPage([MEENA]);
    await screen.findByText("Meena Singh");
    const links = screen.getAllByRole("link", { name: "Bulk upload" });
    expect(links).toHaveLength(1);
    expect(links[0].nextElementSibling).toBe(screen.getByRole("link", { name: "Add teacher" }));
  });

  it("offers Export, before Bulk upload: the teachers of the tab and the search shown, as one Excel file (2026-11-07)", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:teachers", revokeObjectURL: () => {} }));
    const left = { ...MEENA, id: "gone", name: "Old Teacher", isActive: false };
    const { calls, user } = openPage([MEENA, left], { "GET /staff/teachers/export": () => spreadsheet("teachers-sunrise-public-school-2026-11-07.xlsx") });
    await screen.findByText("Meena Singh");
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton.nextElementSibling).toBe(screen.getByRole("link", { name: "Bulk upload" }));
    await user.click(exportButton);
    await waitFor(() => expect(saved).toEqual(["teachers-sunrise-public-school-2026-11-07.xlsx"]));
    expect(Object.fromEntries(new URLSearchParams(calls.filter((c) => c.path === "/staff/teachers/export")[0].query))).toEqual({ status: "active" });

    // The Left tab and a search: the file is those.
    await user.click(screen.getByRole("tab", { name: "Left" }));
    await screen.findByText("Old Teacher");
    await user.type(screen.getByLabelText("Search teachers"), "old");
    await waitFor(() => expect(lists(calls).at(-1)?.query).toContain("search=old"));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/staff/teachers/export")).toHaveLength(2));
    expect(Object.fromEntries(new URLSearchParams(calls.filter((c) => c.path === "/staff/teachers/export")[1].query))).toEqual({ status: "inactive", search: "old" });
  });

  it("has a Fields button, first in the header: the school's own fields for its teachers (2026-11-07)", async () => {
    const { user, router } = openPage([MEENA]);
    await screen.findByText("Meena Singh");
    const fields = screen.getByRole("link", { name: "Fields" });
    expect(fields).toHaveAttribute("href", "/school/teachers/fields");
    expect(fields.nextElementSibling).toBe(screen.getByRole("button", { name: "Export" }));
    await user.click(fields);
    expect(router.state.location.pathname).toBe("/school/teachers/fields");
  });

  it("has nothing to export while the school has no teacher", async () => {
    openPage([]);
    await screen.findByText("No teachers yet");
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("brings back a teacher who had left", async () => {
    const left = { ...MEENA, isActive: false, load: { sections: 0, periodsAllotted: 0 }, login: { username: "meena.singh", isActive: false } };
    const { calls, user } = openPage([left], { "PATCH /staff/teachers/meena": () => ({ ...left, isActive: true }) });
    await user.click(await screen.findByRole("tab", { name: "Left" }));
    expect((await screen.findByText("Meena Singh")).closest("tr")).toHaveTextContent("meena.singh");
    await user.click(await screen.findByRole("button", { name: "Bring back Meena Singh" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/teachers/meena", body: { isActive: true } });
  });
});

describe("Teachers: one who leaves", () => {
  it("a teacher with no classes is marked as left after a question that says the login closes", async () => {
    const { calls, user } = openPage([{ ...DEV, login: { username: "dev.patel", isActive: true } }], { "PATCH /staff/teachers/dev": () => ({ ...DEV, isActive: false }) });
    await user.click(await screen.findByRole("button", { name: "Dev Patel has left" }));
    const d = await screen.findByRole("dialog", { name: "Dev Patel has left?" });
    expect(d).toHaveTextContent("cannot sign in");
    await user.click(within(d).getByRole("button", { name: "Yes, they have left" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/teachers/dev", body: { isActive: false } });
  });

  it("a teacher with classes is led to give them to another teacher; the other teacher is picked and everything goes in one request", async () => {
    const { calls, user } = openPage([MEENA, DEV], { "POST /timetable/teachers/meena/replace": () => ({ allotments: 2, lessons: 1 }) });
    expect(screen.queryByRole("button", { name: "Meena Singh has left" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Give Meena Singh's classes to another teacher" }));
    const d = await screen.findByRole("dialog");
    expect(d).toHaveTextContent("Meena Singh teaches 2 classes (12 periods a week)");
    expect(within(d).getByRole("button", { name: "Give them over" })).toBeDisabled();
    await pick(user, "replace-with", "Dev Patel");
    await user.click(within(d).getByRole("button", { name: "Give them over" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/timetable/teachers/meena/replace", body: { withTeacherId: "dev", deactivate: true } });
  });

  it("says where the other teacher is busy when it cannot be done, and leaves the dialog open", async () => {
    const { user } = openPage([MEENA, DEV], { "POST /timetable/teachers/meena/replace": server(409, "Class 5 - A: Dev Patel is teaching Class 5 - C (English) at the same time", "TIMETABLE_CLASHES") });
    await user.click(await screen.findByRole("button", { name: "Give Meena Singh's classes to another teacher" }));
    await pick(user, "replace-with", "Dev Patel");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Give them over" }));
    expect(await screen.findByText("Class 5 - A: Dev Patel is teaching Class 5 - C (English) at the same time")).toBeInTheDocument();
  });
});
