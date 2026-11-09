import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherEditPage from "../TeacherEdit";

const FULL: Teacher = {
  ...MEENA,
  gender: "Female",
  dateOfBirth: "1988-07-14",
  address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  designation: "TGT (Trained graduate teacher)",
  qualification: "M.Sc., B.Ed.",
  experienceYears: 9,
  joiningDate: "2019-06-17",
  employmentType: "full_time",
  maxPeriodsPerDay: 6,
  offDays: [6],
  login: { username: "meena.singh", isActive: true },
};

function openPage(teacher: Teacher, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    [`GET /staff/teachers/${teacher.id}`]: () => teacher,
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/teachers/:id/edit", element: <TeacherEditPage /> },
      { path: "/school/teachers/:id", element: <p>One teacher</p> },
    ],
    { initialEntries: [`/school/teachers/${teacher.id}/edit`] }
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
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

describe("Change teacher", () => {
  it("opens with every box as the school has it", async () => {
    openPage(FULL);
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("Meena Singh");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
    // Day, month, year, the way dates are written in India.
    expect(within(screen.getByRole("group", { name: /^Date of birth/ })).getAllByRole("spinbutton").map((s) => s.textContent)).toEqual(["14", "07", "1988"]);
    expect(within(screen.getByRole("group", { name: /^Joining date/ })).getAllByRole("spinbutton").map((s) => s.textContent)).toEqual(["17", "06", "2019"]);
    expect(screen.getByLabelText(/^Mobile number/)).toHaveValue("9876543210");
    expect(screen.getByLabelText(/^House and street/)).toHaveValue("12, MG Road");
    expect(screen.getByLabelText(/^PIN code/)).toHaveValue("462001");
    expect(screen.getByLabelText(/^Employee code/)).toHaveValue("T-1");
    expect(screen.getByLabelText(/^Qualification/)).toHaveValue("M.Sc., B.Ed.");
    expect(screen.getByLabelText(/^Experience/)).toHaveValue("9");
    expect(screen.getByRole("radio", { name: "Full time" })).toBeChecked();
    expect(screen.getByLabelText(/^Most periods a day/)).toHaveValue("6");
    expect(await screen.findByRole("button", { name: "Mathematics" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
  });

  it("has no login boxes: the login is managed on the teacher's page", async () => {
    openPage(FULL);
    await screen.findByLabelText(/^Name/);
    expect(screen.queryByLabelText(/^Username/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
  });

  it("keeps Save off until something is changed", async () => {
    const { user } = openPage(FULL);
    const save = await screen.findByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(/^Qualification/), " (Hons)");
    expect(save).toBeEnabled();
  });

  it("sends what is in the boxes, an emptied box as nothing, and goes back to the teacher's page", async () => {
    const { calls, user, router } = openPage(FULL, { "PATCH /staff/teachers/meena": (body) => ({ ...FULL, ...(body as object) }) });
    await screen.findByLabelText(/^Name/);
    await user.clear(screen.getByLabelText(/^Most periods a day/));
    await user.click(screen.getByRole("button", { name: "Saturday" }));
    await user.clear(screen.getByLabelText(/^Qualification/));
    await user.type(screen.getByLabelText(/^Employee code/), "5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/teachers/meena" });
    expect(writes(calls)[0].body).toMatchObject({
      name: "Meena Singh",
      mobile: "9876543210",
      employeeCode: "T-15",
      qualification: null,
      maxPeriodsPerDay: null,
      offDays: [],
      subjectIds: ["maths"],
      gender: "Female",
      address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
    });
    expect(writes(calls)[0].body).not.toHaveProperty("login");
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers/meena"));
  });

  it("needs a mobile number from a teacher who has a login, but not from one who has none", async () => {
    const { user } = openPage(FULL);
    await user.clear(await screen.findByLabelText(/^Mobile number/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter a 10-digit mobile number starting with 6, 7, 8 or 9")).toBeInTheDocument();
  });

  it("does not ask for a gender, even of a teacher who has a login (an older teacher was given a login without one)", async () => {
    const older = { ...MEENA, gender: null, login: { username: "meena.singh", isActive: true } };
    const { calls, user } = openPage(older, { "PATCH /staff/teachers/meena": () => older });
    await user.type(await screen.findByLabelText(/^Name/), " Rathore");
    expect(screen.getByText("Gender").closest("label")).not.toHaveTextContent("*");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(screen.queryByText("Choose the gender")).not.toBeInTheDocument();
  });

  it("clears a date with the cross beside it, and sends it as nothing", async () => {
    const { calls, user } = openPage(FULL, { "PATCH /staff/teachers/meena": (body) => ({ ...FULL, ...(body as object) }) });
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole("button", { name: "Clear joining date" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ joiningDate: null, dateOfBirth: "1988-07-14" });
  });

  it("does not ask for a mobile number of a teacher with no login", async () => {
    const { calls, user } = openPage({ ...MEENA, mobile: null }, { "PATCH /staff/teachers/meena": () => MEENA });
    await user.type(await screen.findByLabelText(/^Name/), " Rathore");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
  });

  it("shows the server's reason under the box it is about, and stays on the form", async () => {
    const message = "Dev Patel already has this mobile number";
    const { user, router } = openPage(FULL, { "PATCH /staff/teachers/meena": server(409, message, "TEACHER_MOBILE_EXISTS", [{ path: "mobile", message }]) });
    await user.type(await screen.findByLabelText(/^Mobile number/), "{Backspace}1");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school/teachers/meena/edit");
  });
});
