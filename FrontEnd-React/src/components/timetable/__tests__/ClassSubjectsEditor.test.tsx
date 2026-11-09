import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ALLOTMENT, ART, DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { AllotmentView, UnitRef } from "../../../types";
import { ClassSubjectsEditor } from "../ClassSubjectsEditor";

const A: UnitRef = { classId: "c5", sectionId: "c5-A" };

function open(extra: Record<string, Handler> = {}, unit: UnitRef = A) {
  const calls = fakeApi({
    "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART] }),
    "GET /staff/teachers": () => ({ items: [MEENA, DEV] }),
    "GET /subjects/allotments": () => ALLOTMENT,
    "PUT /subjects/allotments": () => ALLOTMENT,
    ...extra,
  });
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const router = createMemoryRouter([{ path: "/", element: <ClassSubjectsEditor unit={unit} onSaved={onSaved} onCancel={onCancel} /> }]);
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, onSaved, onCancel, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
const reads = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/subjects/allotments");
const row = (subject: string) => screen.getByRole("group", { name: subject });
const periods = (subject: string) => screen.getByLabelText(`${subject}: periods a week`);
const save = () => screen.getByRole("button", { name: "Save subjects" });
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const view = (over: Partial<AllotmentView>): AllotmentView => ({ ...ALLOTMENT, ...over });

describe("What a class studies: reading it", () => {
  it("shows the class's list, its teachers and how many periods of the week it takes", async () => {
    open();
    await screen.findByRole("group", { name: "Mathematics" });
    expect(periods("Mathematics")).toHaveValue(6);
    expect(periods("English")).toHaveValue(5);
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveTextContent("11 of 40 periods a week");
    expect(screen.getByRole("button", { name: /Mathematics: teacher/ })).toHaveTextContent("Meena Singh");
    expect(screen.getByRole("button", { name: /English: teacher/ })).toHaveTextContent("No teacher yet");
  });

  it("asks for a class that has no sections by the class alone", async () => {
    const { calls } = open({}, { classId: "c1", sectionId: null });
    await screen.findByRole("group", { name: "Mathematics" });
    expect(reads(calls)[0].query).toBe("?classId=c1&sectionId=none");
  });
});

describe("What a class studies: the list", () => {
  it("adds a subject the class does not have yet (not one it has), with 5 periods to begin with, and counts the week again", async () => {
    const { user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: /Add a subject/ }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Art & Craft"]);
    await user.click(screen.getByRole("option", { name: "Art & Craft" }));
    expect(periods("Art & Craft")).toHaveValue(5);
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveTextContent("16 of 40 periods a week");
  });

  it("takes a subject out, and counts the week again", async () => {
    const { user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: "Take Mathematics out" }));
    expect(screen.queryByRole("group", { name: "Mathematics" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveTextContent("5 of 40 periods a week");
  });

  it("counts a choice once: its subjects are taught in the same periods", async () => {
    const { user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.type(screen.getByLabelText("Mathematics: choice"), "Choose one");
    await user.clear(periods("Mathematics"));
    await user.type(periods("Mathematics"), "5");
    await user.type(screen.getByLabelText("English: choice"), "choose one");
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveTextContent("5 of 40 periods a week");
  });

  it("says in red, at once, when the subjects need more periods than the week has", async () => {
    const { user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.clear(periods("Mathematics"));
    await user.type(periods("Mathematics"), "20");
    await user.clear(periods("English"));
    await user.type(periods("English"), "21");
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveTextContent("41 of 40 periods a week: too many, they will not fit");
    expect(screen.getByRole("status", { name: "Periods a week" })).toHaveClass("text-danger");
  });

  it("only counts when the class has no periods yet, and does not block", async () => {
    open({ "GET /subjects/allotments": () => view({ totals: { periods: 11, available: null } }) });
    expect(await screen.findByRole("status", { name: "Periods a week" })).toHaveTextContent("11 periods a week.");
  });
});

describe("What a class studies: saving", () => {
  it("cannot be saved until something is changed, then sends the whole list in one request and lets the week read itself again", async () => {
    const { calls, onSaved, user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    expect(save()).toBeDisabled();
    await user.clear(periods("Mathematics"));
    await user.type(periods("Mathematics"), "7");
    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({
      classId: "c5",
      sectionId: "c5-A",
      rows: [
        { subjectId: "maths", periodsPerWeek: 7, blockSize: 1, teacherId: "meena", group: null },
        { subjectId: "english", periodsPerWeek: 5, blockSize: 1, teacherId: null, group: null },
      ],
      alsoSections: [],
      withTeachers: false,
    });
    expect(await screen.findByText("Subjects saved")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("sends the block, the teacher and the choice that were picked", async () => {
    const { calls, user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: /English: how its periods come/ }));
    await user.click(await screen.findByRole("option", { name: "Double periods" }));
    await user.click(screen.getByRole("button", { name: /English: teacher/ }));
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    await user.type(screen.getByLabelText("English: choice"), "Languages");
    await user.clear(periods("English"));
    await user.type(periods("English"), "4");
    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect((puts(calls)[0].body as { rows: unknown[] }).rows[1]).toEqual({ subjectId: "english", periodsPerWeek: 4, blockSize: 2, teacherId: "dev", group: "Languages" });
  });

  it("gives the list to the other sections of the class too, with or without the teachers", async () => {
    const { calls, user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: "Class 5 - B" }));
    await user.click(screen.getByLabelText(/With the same teachers/));
    await user.click(save());
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toMatchObject({ alsoSections: ["c5-B"], withTeachers: true });
    expect(await screen.findByText("Subjects saved, and given to the other sections too")).toBeInTheDocument();
  });

  it("shows the server's reason under the row it is about", async () => {
    const { onSaved, user } = open({
      "PUT /subjects/allotments": server(400, "Invalid request data", "VALIDATION_ERROR", [{ path: "rows.0.periodsPerWeek", message: "5 periods cannot be given in blocks of 2: use a multiple of 2" }]),
    });
    await screen.findByRole("group", { name: "Mathematics" });
    await user.clear(periods("Mathematics"));
    await user.type(periods("Mathematics"), "5");
    await user.click(save());
    expect(await within(row("Mathematics")).findByText("5 periods cannot be given in blocks of 2: use a multiple of 2")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows the server's word when a timetable is already made on what is being taken out", async () => {
    const { user } = open({ "PUT /subjects/allotments": server(409, "Mathematics is in the timetable of Class 5 - A (2 periods). Take it out of the timetable first.", "SUBJECT_IN_TIMETABLE") });
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: "Take Mathematics out" }));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Mathematics is in the timetable of Class 5 - A (2 periods). Take it out of the timetable first.");
  });

  it("will not send a subject with no periods", async () => {
    const { calls, user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.clear(periods("Mathematics"));
    await user.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the periods a week for every subject (at least 1).");
    expect(puts(calls)).toHaveLength(0);
  });

  it("goes back to the week without saving", async () => {
    const { calls, onCancel, user } = open();
    await screen.findByRole("group", { name: "Mathematics" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(puts(calls)).toHaveLength(0);
  });
});

describe("What a class studies: when the school has no subjects yet", () => {
  it("leads to the subjects page", async () => {
    open({ "GET /subjects": () => ({ items: [] }), "GET /subjects/allotments": () => view({ rows: [] }) });
    expect(await screen.findByText(/Your school has no subjects yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add them first" })).toHaveAttribute("href", "/school/timetable/subjects");
  });
});
