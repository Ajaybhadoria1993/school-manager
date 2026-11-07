import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherAddPage from "../TeacherAdd";
import TeacherDetailPage from "../TeacherDetail";
import TeacherEditPage from "../TeacherEdit";

/** The school's own fields on the teacher's forms and page (2026-11-07). */
const PAN: CustomFieldDef = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "required" };
const BLOOD: CustomFieldDef = { key: "c_blood001", label: "Blood Group", type: "choice", options: ["A+", "B+", "O+"], mode: "optional" };
const HOUSE: CustomFieldDef = { key: "c_house001", label: "House Duty", type: "yesNo", options: [], mode: "optional" };
const SINCE: CustomFieldDef = { key: "c_since001", label: "Member Since", type: "date", options: [], mode: "optional" };
const OFF: CustomFieldDef = { key: "c_off00001", label: "Hidden Thing", type: "text", options: [], mode: "hidden" };

const base = (extra: Record<string, Handler>): Record<string, Handler> => ({
  "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
  "GET /staff/teachers/settings": () => ({ customFields: [PAN, BLOOD, HOUSE, SINCE, OFF] }),
  ...extra,
});

function mount(routes: { path: string; element: React.ReactElement }[], path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
type U = ReturnType<typeof userEvent.setup>;
const next = (user: U) => user.click(screen.getByRole("button", { name: "Next step" }));

describe("Add teacher: the school's own fields", () => {
  function open(extra: Record<string, Handler> = {}) {
    const calls = fakeApi(
      base({
        "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
        "POST /staff/teachers": (body) => ({ ...MEENA, id: "new-teacher", ...(body as object), login: { username: "meena.singh", isActive: true } }),
        ...extra,
      })
    );
    return { calls, ...mount([{ path: "/school/teachers/new", element: <TeacherAddPage /> }, { path: "/school/teachers/:id", element: <p>One teacher</p> }], "/school/teachers/new") };
  }
  async function toJob(user: U) {
    await user.type(screen.getByLabelText(/^Name/), "Meena Singh");
    await user.click(screen.getByRole("radio", { name: "Female" }));
    await user.type(screen.getByLabelText(/^Mobile number/), "9876543210");
    await next(user);
    await screen.findByRole("heading", { name: "Your own fields" });
  }

  it("asks them in the Job step, the ones the school asks (not the ones it does not), and nothing is said before Next", async () => {
    const { user } = open();
    await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(screen.queryByText("Your own fields")).not.toBeInTheDocument());
    await toJob(user);
    for (const label of ["PAN Number", "Blood Group", "House Duty", "Member Since"]) expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Hidden Thing/)).not.toBeInTheDocument();
    expect(screen.queryByText("Enter the PAN Number")).not.toBeInTheDocument();
  });

  it("holds Next back until a needed field is answered, and says so under its box", async () => {
    const { user } = open();
    await toJob(user);
    await next(user);
    expect(await screen.findByText("Enter the PAN Number")).toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("Job");
    await user.type(screen.getByLabelText(/^PAN Number/), "ABCDE1234F");
    await next(user);
    await waitFor(() => expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("Teaching"));
  });

  it("sends the answers with the teacher, by key and by kind (a yes / no as true, a number as a number; empty ones left out)", async () => {
    const { calls, user } = open();
    await toJob(user);
    await user.type(screen.getByLabelText(/^PAN Number/), "  ABCDE1234F ");
    await user.click(screen.getByRole("button", { name: /Blood Group/ }));
    await user.click(await screen.findByRole("option", { name: "B+" }));
    await user.click(screen.getByRole("button", { name: /House Duty/ }));
    await user.click(await screen.findByRole("option", { name: "Yes" }));
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    await screen.findByText("Meena Singh is added");
    expect(writes(calls)).toHaveLength(1);
    expect((writes(calls)[0].body as { custom: unknown }).custom).toEqual({ c_pan00001: "ABCDE1234F", c_blood001: "B+", c_house001: true });
  });

  it("puts what the server refused under the field's box and takes the person to it", async () => {
    const { user } = open({
      "POST /staff/teachers": () =>
        new Response(JSON.stringify({ success: false, message: "Invalid request data", code: "VALIDATION_ERROR", details: [{ path: "custom.c_pan00001", message: "Keep the PAN Number under 200 characters" }] }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    await toJob(user);
    await user.type(screen.getByLabelText(/^PAN Number/), "ABCDE1234F");
    await next(user);
    await next(user);
    await user.click(await screen.findByRole("button", { name: "Add teacher" }));
    expect(await screen.findByText("Keep the PAN Number under 200 characters")).toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("Job");
  });
});

describe("Change teacher: the school's own fields", () => {
  const TEACHER: Teacher = { ...MEENA, login: { username: "meena.singh", isActive: true }, custom: { c_pan00001: "ABCDE1234F", c_blood001: "O+", c_house001: false, c_since001: "2015-06-01" } };
  function open(teacher: Teacher = TEACHER, extra: Record<string, Handler> = {}) {
    const calls = fakeApi(base({ [`GET /staff/teachers/${teacher.id}`]: () => teacher, [`PATCH /staff/teachers/${teacher.id}`]: (body) => ({ ...teacher, ...(body as object) }), ...extra }));
    return { calls, ...mount([{ path: "/school/teachers/:id/edit", element: <TeacherEditPage /> }, { path: "/school/teachers/:id", element: <p>One teacher</p> }], `/school/teachers/${teacher.id}/edit`) };
  }

  it("shows the answers in their boxes, and sends only a changed field... as the whole set: a cleared one is null", async () => {
    const { calls, user } = open();
    const pan = await screen.findByLabelText(/^PAN Number/);
    expect(pan).toHaveValue("ABCDE1234F");
    expect(screen.getByRole("button", { name: /Blood Group/ })).toHaveTextContent("O+");
    expect(screen.getByRole("button", { name: /House Duty/ })).toHaveTextContent("No");
    expect(screen.getByLabelText(/^Member Since/)).toHaveValue("2015-06-01");
    await user.clear(pan);
    await user.type(pan, "ZZZZZ9999Z");
    await user.click(screen.getByRole("button", { name: /Blood Group/ }));
    await user.click(await screen.findByRole("option", { name: "No answer" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("One teacher");
    expect(writes(calls)).toHaveLength(1);
    expect((writes(calls)[0].body as { custom: unknown }).custom).toEqual({ c_pan00001: "ZZZZZ9999Z", c_blood001: null, c_house001: false, c_since001: "2015-06-01" });
  });

  it("does not save a needed field left empty", async () => {
    const { calls, user } = open();
    const pan = await screen.findByLabelText(/^PAN Number/);
    await user.clear(pan);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the PAN Number")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("a change to something else alone enables Save only when something changed", async () => {
    const { user } = open({ ...TEACHER, custom: {} });
    await screen.findByLabelText(/^PAN Number/);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.type(screen.getByLabelText(/^PAN Number/), "A");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});

describe("a teacher's page: the school's own fields", () => {
  it("lists them in a card, with the answers (a yes / no as Yes or No, a day as it is written here, nothing as a dash); not the ones it does not ask", async () => {
    const teacher: Teacher = { ...MEENA, custom: { c_pan00001: "ABCDE1234F", c_house001: true, c_since001: "2015-06-01", c_off00001: "secret" } };
    fakeApi(base({ [`GET /staff/teachers/${teacher.id}`]: () => teacher, [`GET /staff/teachers/${teacher.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }) }));
    mount([{ path: "/school/teachers/:id", element: <TeacherDetailPage /> }], `/school/teachers/${teacher.id}`);
    const card = await screen.findByRole("region", { name: "Your own fields" });
    await waitFor(() => expect(within(card).getByText("PAN Number")).toBeInTheDocument());
    expect(card).toHaveTextContent(/PAN Number\s*ABCDE1234F/);
    expect(card).toHaveTextContent(/House Duty\s*Yes/);
    expect(card).toHaveTextContent(/Member Since\s*1 Jun 2015/);
    expect(card).toHaveTextContent(/Blood Group\s*Not given/);
    expect(card).not.toHaveTextContent("Hidden Thing");
    expect(card).not.toHaveTextContent("secret");
  });

  it("has no such card for a school with no field of its own", async () => {
    fakeApi(base({ "GET /staff/teachers/settings": () => ({ customFields: [] }), [`GET /staff/teachers/${MEENA.id}`]: () => MEENA, [`GET /staff/teachers/${MEENA.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }) }));
    mount([{ path: "/school/teachers/:id", element: <TeacherDetailPage /> }], `/school/teachers/${MEENA.id}`);
    await screen.findByRole("heading", { name: "Job" });
    expect(screen.queryByRole("region", { name: "Your own fields" })).not.toBeInTheDocument();
  });
});
