import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, spreadsheet, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { ProgressRow, TeachingLog, TeachingProgress, UserRole } from "../../../types";
import { todayInIndia } from "../../../utils/students";
import TeachingProgressPage from "../TeachingProgressPage";

/** The requests about teaching progress (the year picker's own read is not this page's). */
const ofPage = (calls: Call[]) => calls.filter((c) => c.path.startsWith("/classroom/"));

/** Teaching progress (docs/teaching-progress.md): who taught what, how far the chapters are and the homework, for the days asked. */

const today = todayInIndia();

const MATHS: ProgressRow = {
  classId: "c5",
  sectionId: "c5-A",
  classLabel: "Class 5",
  subjectId: "maths",
  subjectName: "Mathematics",
  teacherId: "meena",
  teacherName: "Meena Singh",
  chapters: [
    { id: "ch1", number: 1, name: "Numbers", done: true, completedOn: "2026-11-02", days: 3, startedOn: "2026-10-30", plannedOn: null, late: false },
    { id: "ch2", number: 2, name: "Fractions", done: false, completedOn: null, days: 1, startedOn: "2026-11-03", plannedOn: "2026-11-10", late: true },
    { id: "ch3", number: 3, name: "Shapes", done: false, completedOn: null, days: 0, startedOn: null, plannedOn: "2027-01-15", late: false },
  ],
  late: 1,
  current: { number: 2, name: "Fractions" },
  updates: 2,
  homework: 1,
  last: { date: today, taught: "Adding fractions", homework: "", chapter: { number: 2, name: "Fractions" } },
};
const ENGLISH: ProgressRow = { ...MATHS, subjectId: "english", subjectName: "English", teacherId: "dev", teacherName: "Dev Patel", chapters: [], late: 0, current: null, updates: 0, homework: 0, last: null };
const PROGRESS: TeachingProgress = {
  options: {
    classes: [{ classId: "c5", sectionId: "c5-A", label: "Class 5" }],
    subjects: [
      { id: "english", name: "English" },
      { id: "maths", name: "Mathematics" },
    ],
    teachers: [
      { id: "dev", name: "Dev Patel" },
      { id: "meena", name: "Meena Singh" },
    ],
  },
  summary: { updates: 2, homework: 1, chaptersDone: 1, chaptersTotal: 3, withoutUpdate: 1, behind: 1 },
  rows: [ENGLISH, MATHS],
};
const LOG: TeachingLog = {
  total: 30,
  page: 1,
  limit: 25,
  items: [
    {
      id: "e1",
      date: today,
      classId: "c5",
      sectionId: "c5-A",
      classLabel: "Class 5",
      subjectName: "Mathematics",
      teacherName: "Meena Singh",
      writtenBy: "Dev Patel",
      chapter: { number: 2, name: "Fractions" },
      taught: "Adding fractions",
      homework: "Page 42",
    },
  ],
};

function openPage(path = "/teaching-progress", extra: Record<string, Handler> = {}, role: UserRole = "school_admin", permissions?: string[]) {
  signInAs(role, permissions);
  const calls = fakeApi({ "GET /classroom/progress": () => PROGRESS, "GET /classroom/progress/log": () => LOG, ...extra });
  const router = createMemoryRouter([{ path: "/teaching-progress", element: <TeachingProgressPage /> }], { initialEntries: [path] });
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
  signOut();
  vi.unstubAllGlobals();
});

describe("teaching progress", () => {
  it("opens on today's daily updates: the figures, and each entry with the class, the teacher, the chapter and the homework", async () => {
    const { calls } = openPage();
    const table = await screen.findByRole("table", { name: "Daily updates" });
    const row = within(table).getAllByRole("row")[1];
    for (const text of ["Class 5", "Mathematics", "Meena Singh", "by Dev Patel", "2. Fractions", "Adding fractions", "Page 42"]) expect(row).toHaveTextContent(text);
    const figures = screen.getByRole("region", { name: "About these days" });
    for (const text of ["Updates", "Homework given", "Chapters finished", "1 of 3", "Without an update", "Behind schedule"]) expect(figures).toHaveTextContent(text);
    expect(ofPage(calls).map((c) => `${c.path}${c.query}`).sort()).toEqual([`/classroom/progress/log?from=${today}&to=${today}&page=1`, `/classroom/progress?from=${today}&to=${today}`]);
  });

  it("pages of the daily updates", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Daily updates" });
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/classroom/progress/log" && c.query.includes("page=2"))).toBe(true));
  });

  it("Chapter progress: each subject with how far it is and the chapter going on, asked once; View lists every chapter", async () => {
    const { calls, user } = openPage("/teaching-progress?tab=chapters");
    const table = await screen.findByRole("table", { name: "Chapter progress" });
    const [, english, maths] = within(table).getAllByRole("row");
    expect(english).toHaveTextContent("Not added");
    expect(english).toHaveTextContent("No update");
    for (const text of ["Mathematics", "Meena Singh", "1 of 3", "2. Fractions"]) expect(maths).toHaveTextContent(text);
    expect(ofPage(calls).map((c) => c.path)).toEqual(["/classroom/progress"]);

    await user.click(within(maths).getByRole("button", { name: "View Mathematics of Class 5" }));
    const dialog = await screen.findByRole("dialog");
    const items = within(dialog).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Numbers");
    expect(items[0]).toHaveTextContent("Finished");
    expect(items[0]).toHaveTextContent("3 days");
    expect(items[1]).toHaveTextContent("Running");
    expect(items[2]).toHaveTextContent("Not started");
    expect(within(dialog).getByRole("link", { name: "Open diary" })).toHaveAttribute("href", "/class-work/c5?section=c5-A&tab=diary");
  });

  it("Teachers: each teacher's updates, homework and chapters; View shows that teacher's daily updates", async () => {
    const { calls, router, user } = openPage("/teaching-progress?tab=teachers");
    const table = await screen.findByRole("table", { name: "Teachers" });
    const [, dev, meena] = within(table).getAllByRole("row");
    expect(dev).toHaveTextContent("Dev Patel");
    for (const text of ["Meena Singh", "1 of 3"]) expect(meena).toHaveTextContent(text);
    await user.click(within(meena).getByRole("button", { name: "View updates of Meena Singh" }));
    await waitFor(() => expect(router.state.location.search).toContain("teacher=meena"));
    await waitFor(() => expect(calls.some((c) => c.path === "/classroom/progress/log" && c.query.includes("teacherId=meena"))).toBe(true));
  });

  it("the filters of the address are asked for: class, subject, teacher and days", async () => {
    const { calls } = openPage("/teaching-progress?tab=chapters&from=2026-11-02&to=2026-11-07&class=c5:c5-A&subject=maths&teacher=meena");
    await screen.findByRole("table", { name: "Chapter progress" });
    expect(ofPage(calls)[0].query).toBe("?from=2026-11-02&to=2026-11-07&classId=c5&sectionId=c5-A&subjectId=maths&teacherId=meena");
  });

  it("says so when there is nothing", async () => {
    openPage("/teaching-progress", {
      "GET /classroom/progress/log": () => ({ items: [], total: 0, page: 1, limit: 25 }),
    });
    expect(await screen.findByText("Nothing written for these days")).toBeInTheDocument();
  });

  it("Behind schedule: the figure opens the late subjects only; the tick shows them all again", async () => {
    const { router, user } = openPage();
    await user.click(await screen.findByRole("link", { name: /Behind schedule/ }));
    const table = await screen.findByRole("table", { name: "Chapter progress" });
    expect(router.state.location.search).toContain("behind=1");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("1 late");
    await user.click(screen.getByRole("checkbox", { name: "Only behind schedule" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Chapter progress" })).getAllByRole("row")).toHaveLength(3));
    expect(router.state.location.search).not.toContain("behind");
  });

  it("a late chapter says so in the list, with the day it was to be finished by; the teachers' table counts them", async () => {
    const { user } = openPage("/teaching-progress?tab=chapters");
    await user.click(await screen.findByRole("button", { name: "View Mathematics of Class 5" }));
    const items = within(await screen.findByRole("dialog")).getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("Late");
    expect(items[1]).toHaveTextContent("finish by 10 Nov");
    expect(items[2]).toHaveTextContent("finish by 15 Jan");
    expect(items[2]).not.toHaveTextContent("Late");
    cleanup();
    openPage("/teaching-progress?tab=teachers");
    const table = await screen.findByRole("table", { name: "Teachers" });
    expect(within(table).getByRole("columnheader", { name: "Late chapters" })).toBeInTheDocument();
  });

  it("Export downloads the Excel of the days and filters on the page", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:progress", revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { calls, user } = openPage("/teaching-progress?from=2026-11-02&to=2026-11-07&subject=maths", { "GET /classroom/progress/export": () => spreadsheet("teaching-progress.xlsx") });
    await user.click(await screen.findByRole("button", { name: "Export" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(calls.filter((c) => c.path === "/classroom/progress/export").map((c) => c.query)).toEqual(["?from=2026-11-02&to=2026-11-07&subjectId=maths"]);
    click.mockRestore();
  });

  it("a refused file says why", async () => {
    const { user } = openPage("/teaching-progress", {
      "GET /classroom/progress/export": () => new Response(JSON.stringify({ success: false, message: "Choose fewer days or one class: a file takes up to 20,000 updates.", code: "TOO_MANY_ROWS" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    await user.click(await screen.findByRole("button", { name: "Export" }));
    expect(await screen.findByText(/Choose fewer days/)).toBeInTheDocument();
  });

  it("Reminder: the school switches it on or off and picks the time; asked only when opened", async () => {
    const { calls, user } = openPage("/teaching-progress", {
      "GET /classroom/reminder": () => ({ enabled: true, time: "16:00" }),
      "PUT /classroom/reminder": (body) => body,
    });
    await screen.findByRole("table", { name: "Daily updates" });
    expect(calls.some((c) => c.path === "/classroom/reminder")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Reminder" }));
    const dialog = await screen.findByRole("dialog", { name: "Diary reminder" });
    const toggle = await within(dialog).findByRole("switch", { name: "Remind teachers who have not written the diary" });
    expect(toggle).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: /Time/ }));
    await user.click(await screen.findByRole("option", { name: "2:30 PM" }));
    await user.click(toggle);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ enabled: false, time: "14:30" });
    expect(await screen.findByRole("dialog", { name: "Reminder saved" })).toBeInTheDocument();
  });

  it("the reminder is the school's: a teacher and staff have no button for it", async () => {
    openPage("/teaching-progress", {}, "teacher");
    expect(await screen.findByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reminder" })).not.toBeInTheDocument();
  });

  it("staff who only see the progress get no way into the class's diary", async () => {
    const { user } = openPage("/teaching-progress?tab=chapters", {}, "receptionist", ["progress.view"]);
    await user.click(await screen.findByRole("button", { name: "View Mathematics of Class 5" }));
    expect(within(await screen.findByRole("dialog")).queryByRole("link", { name: "Open diary" })).not.toBeInTheDocument();
  });
});
