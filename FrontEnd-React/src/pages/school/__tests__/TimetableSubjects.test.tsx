import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ART, ENGLISH, MATHS } from "../../../test/timetableFixtures";
import type { Subject } from "../../../types";
import TimetableSubjectsPage from "../TimetableSubjects";

function openPage(subjects: Subject[], extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    // The page reads every subject once and shows the tab's.
    "GET /subjects": () => ({ items: subjects }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/timetable/subjects", element: <TimetableSubjectsPage /> }], { initialEntries: ["/school/timetable/subjects"] });
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const chips = () => within(screen.getByRole("group", { name: "The usual subjects" }));

describe("Subjects: the usual ones", () => {
  it("shows the usual subjects as chips, the ones the school has already ticked and out of reach", async () => {
    openPage([MATHS, ENGLISH]);
    expect(await screen.findByRole("heading", { name: "Subjects", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "Mathematics" })).toBeInTheDocument();
    expect(chips().getByRole("button", { name: /^Mathematics/ })).toBeDisabled();
    expect(chips().getByRole("button", { name: "Hindi" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add the ticked subjects" })).toBeDisabled();
  });

  it("adds the ticked ones in one request, and says how many", async () => {
    const { calls, user } = openPage([MATHS], { "POST /subjects/quick-add": (body) => ({ created: (body as { names: string[] }).names.map((n, i) => ({ ...ART, id: `n${i}`, name: n })), skipped: [] }) });
    await screen.findByRole("cell", { name: "Mathematics" });
    await user.click(chips().getByRole("button", { name: "Hindi" }));
    await user.click(chips().getByRole("button", { name: "Music" }));
    await user.click(screen.getByRole("button", { name: "Add 2 subjects" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/subjects/quick-add", body: { names: ["Hindi", "Music"] } });
    expect(await screen.findByText("2 subjects added")).toBeInTheDocument();
    // The ticks are cleared.
    expect(screen.getByRole("button", { name: "Add the ticked subjects" })).toBeDisabled();
  });

  it("untick a chip takes it back out", async () => {
    const { user } = openPage([]);
    await screen.findByText(/No subjects yet/);
    await user.click(chips().getByRole("button", { name: "Hindi" }));
    expect(screen.getByRole("button", { name: "Add 1 subject" })).toBeInTheDocument();
    await user.click(chips().getByRole("button", { name: "Hindi" }));
    expect(screen.getByRole("button", { name: "Add the ticked subjects" })).toBeDisabled();
  });
});

describe("Subjects: one of the school's own", () => {
  it("asks for the name before sending, then adds it with its code and kind, and clears the boxes", async () => {
    const { calls, user } = openPage([], { "POST /subjects": (body) => ({ ...ART, id: "new", ...(body as object) }) });
    await screen.findByText(/No subjects yet/);
    const form = screen.getByRole("form", { name: "Add your own subject" });
    await user.click(within(form).getByRole("button", { name: "Add" }));
    expect(await within(form).findByText("Enter the subject name")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);

    await user.type(within(form).getByLabelText(/^Subject name/), "Robotics");
    await user.type(within(form).getByLabelText(/Short code/), "ROB");
    await user.click(within(form).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ name: "Robotics", code: "ROB", category: "academic" });
    await waitFor(() => expect(within(form).getByLabelText(/^Subject name/)).toHaveValue(""));
  });

  it("shows the server's reason under the box it is about", async () => {
    const { user } = openPage([], { "POST /subjects": server(409, "Your school already has a subject called Mathematics.", "SUBJECT_EXISTS", [{ path: "name", message: "Your school already has a subject called Mathematics" }]) });
    await screen.findByText(/No subjects yet/);
    const form = screen.getByRole("form", { name: "Add your own subject" });
    await user.type(within(form).getByLabelText(/^Subject name/), "maths");
    await user.click(within(form).getByRole("button", { name: "Add" }));
    expect(await within(form).findByText("Your school already has a subject called Mathematics")).toBeInTheDocument();
  });
});

describe("Subjects: the list", () => {
  it("shows the kind and where each is taught", async () => {
    openPage([MATHS, ART]);
    const maths = (await screen.findByRole("cell", { name: "Mathematics" })).closest("tr")!;
    expect(maths).toHaveTextContent("With marks");
    expect(maths).toHaveTextContent("2 classes");
    const art = screen.getByRole("cell", { name: "Art & Craft" }).closest("tr")!;
    expect(art).toHaveTextContent("Activity");
    expect(art).toHaveTextContent("No class yet");
  });

  it("changes a subject with one request that names it", async () => {
    const { calls, user } = openPage([ENGLISH], { "PATCH /subjects/english": (body) => ({ ...ENGLISH, ...(body as object) }) });
    await user.click(await screen.findByRole("button", { name: "Change English" }));
    const d = await screen.findByRole("dialog", { name: "Change English" });
    const name = within(d).getByLabelText(/^Subject name/);
    await user.clear(name);
    await user.type(name, "English Language");
    await user.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/subjects/english", body: { name: "English Language", code: "ENG", category: "academic" } });
  });

  it("will not save an empty name", async () => {
    const { calls, user } = openPage([ENGLISH]);
    await user.click(await screen.findByRole("button", { name: "Change English" }));
    const d = await screen.findByRole("dialog");
    await user.clear(within(d).getByLabelText(/^Subject name/));
    expect(within(d).getByText("Enter the subject name")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(writes(calls)).toHaveLength(0);
  });

  it("archives after a question, and says why when a class still studies it", async () => {
    const { calls, user } = openPage([MATHS], { "PATCH /subjects/maths": server(409, "Mathematics is taught in 2 sections this year. Take it out of them first.", "SUBJECT_IN_USE") });
    await user.click(await screen.findByRole("button", { name: "Archive Mathematics" }));
    const d = await screen.findByRole("dialog", { name: "Archive Mathematics?" });
    await user.click(within(d).getByRole("button", { name: "Archive" }));
    expect(await within(d).findByText("Mathematics is taught in 2 sections this year. Take it out of them first.")).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/maths", body: { isActive: false } });
  });

  it("keeps the archived ones apart, and brings one back with one click", async () => {
    const archived = { ...ART, isActive: false };
    const { calls, user } = openPage([MATHS, archived], { "PATCH /subjects/art": () => ({ ...archived, isActive: true }) });
    await screen.findByRole("cell", { name: "Mathematics" });
    expect(screen.queryByRole("cell", { name: "Art & Craft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Archived (1)" }));
    expect(screen.getByRole("cell", { name: "Art & Craft" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Mathematics" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bring back Art & Craft" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/art", body: { isActive: true } });
  });

  it("reads the list once for both tabs", async () => {
    const { calls, user } = openPage([MATHS, { ...ART, isActive: false }]);
    await screen.findByRole("cell", { name: "Mathematics" });
    await user.click(screen.getByRole("tab", { name: /Archived/ }));
    await user.click(screen.getByRole("tab", { name: "In use" }));
    expect(calls.filter((c) => c.method === "GET" && c.path === "/subjects")).toHaveLength(1);
  });
});
