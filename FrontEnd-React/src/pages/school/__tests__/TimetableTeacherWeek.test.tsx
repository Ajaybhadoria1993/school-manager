import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { WEEK } from "../../../test/timetableFixtures";
import type { TeacherWeek } from "../../../types";
import TimetableTeacherWeekPage from "../TimetableTeacherWeek";

function openPage(week: TeacherWeek = WEEK, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({ "GET /timetable/teachers/meena": () => week, ...extra });
  const router = createMemoryRouter([{ path: "/school/timetable/teacher/:teacherId", element: <TimetableTeacherWeekPage /> }], { initialEntries: ["/school/timetable/teacher/meena"] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("A teacher's week", () => {
  it("shows every lesson by day with its time, class, subject and room, and marks the ones of a timetable not published yet", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Meena Singh's week", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("2 periods this week (the most is 30)")).toBeInTheDocument();
    const monday = screen.getByRole("heading", { name: /^Monday/ }).closest("div")!;
    expect(monday).toHaveTextContent("08:30 to 09:10");
    expect(monday).toHaveTextContent("Class 5 - A · Mathematics");
    expect(monday).toHaveTextContent("11:00 to 11:40");
    expect(monday).toHaveTextContent("Room 5B");
    expect(within(monday).getAllByText("Draft")).toHaveLength(1);
    // A free day says so.
    expect(screen.getByRole("heading", { name: /^Tuesday/ }).closest("div")).toHaveTextContent("Free");
  });

  it("shows Monday to Saturday, and Sunday only when there is a lesson on it", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Meena Singh's week", level: 1 });
    expect(screen.queryByRole("heading", { name: /^Sunday/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Saturday/ })).toBeInTheDocument();
  });

  it("shows Sunday when someone has a lesson on it", async () => {
    openPage({ ...WEEK, lessons: [...WEEK.lessons, { ...WEEK.lessons[0], day: 7 }] });
    expect(await screen.findByRole("heading", { name: /^Sunday/ })).toBeInTheDocument();
  });

  it("marks the days a teacher does not come, and a day over their limit", async () => {
    openPage({ ...WEEK, teacher: { ...WEEK.teacher, offDays: [6], maxPerDay: 1 } });
    const saturday = (await screen.findByRole("heading", { name: /^Saturday/ })).closest("div")!;
    expect(saturday).toHaveTextContent("Does not come");
    // Two lessons on Monday against a limit of one.
    expect(within(screen.getByRole("heading", { name: /^Monday/ })).getByText("2")).toHaveClass("text-warning");
  });

  it("says what they teach this year, or how to give them something", async () => {
    openPage();
    expect(await screen.findByText("Class 5 - A · Mathematics · 6 a week")).toBeInTheDocument();
  });

  it("leads to the class timetables (where a class's subjects get their teachers) when nothing is given to them", async () => {
    openPage({ ...WEEK, teaches: [], lessons: [], perDay: {}, week: 0 });
    expect(await screen.findByText(/Nothing is given to them yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "timetable" })).toHaveAttribute("href", "/school/timetable");
  });

  it("says when the teacher has left", async () => {
    openPage({ ...WEEK, teacher: { ...WEEK.teacher, isActive: false } });
    expect(await screen.findByText("Meena Singh has left. These are the lessons that were theirs.")).toBeInTheDocument();
  });

  it("says why it could not load, and tries again", async () => {
    let fail = true;
    openPage(WEEK, { "GET /timetable/teachers/meena": () => (fail ? new Response(JSON.stringify({ success: false, message: "Teacher not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) : WEEK) });
    expect(await screen.findByText("Teacher not found")).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Meena Singh's week", level: 1 })).toBeInTheDocument();
  });

  it("prints the page", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
