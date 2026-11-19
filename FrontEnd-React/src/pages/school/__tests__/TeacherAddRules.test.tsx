import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { DEFAULT_TEACHER_RULES, type TeacherFieldRules } from "../../../constants/teacherFields";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call } from "../../../test/fakeApi";
import { ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import TeacherAddPage from "../TeacherAdd";

/** Add teacher follows what the school decided in Manage fields (2026-11-13): a detail not asked has no box, a needed one must be answered. */
function openPage(fields: Partial<TeacherFieldRules>) {
  const calls: Call[] = fakeApi({
    "GET /staff/teachers/settings": () => ({ fields: { ...DEFAULT_TEACHER_RULES, ...fields }, customFields: [], exportColumns: [], exportIsDefault: true }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    "POST /staff/teachers": (body) => ({ ...MEENA, id: "new-teacher", ...(body as object), login: { username: "meena.singh", isActive: true } }),
  });
  const router = createMemoryRouter([{ path: "/teachers/new", element: <TeacherAddPage /> }], { initialEntries: ["/teachers/new"] });
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

type User = ReturnType<typeof userEvent.setup>;
const next = (user: User) => user.click(screen.getByRole("button", { name: "Next step" }));
const current = () => document.querySelector('[aria-current="step"]')?.textContent ?? "";

async function fillPersonal(user: User) {
  await user.type(screen.getByLabelText(/^Name/), "Meena Singh");
  await user.click(screen.getByRole("radio", { name: "Female" }));
  await user.type(screen.getByLabelText(/^Mobile number/), "9876543210");
}

describe("Add teacher: what the school asks", () => {
  it("has no box for a detail the school does not ask, and no Address card when it asks none of the address", async () => {
    openPage({ dateOfBirth: "hidden", email: "hidden", address: "hidden", city: "hidden", state: "hidden", pincode: "hidden" });
    await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(screen.queryByText(/^Date of birth/)).not.toBeInTheDocument());
    expect(screen.queryByText(/^Email/)).not.toBeInTheDocument();
    expect(screen.queryByText("Address")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Mobile number/)).toBeInTheDocument();
  });

  it("keeps the Address card while one of its boxes is asked, with only that box", async () => {
    openPage({ address: "hidden", state: "hidden", pincode: "hidden" });
    await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(screen.queryByText(/^House and street/)).not.toBeInTheDocument());
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText(/^City or village/)).toBeInTheDocument();
  });

  it("holds a needed detail to an answer: no star of 'optional' on its box, Next says what is missing, and an answer lets it go on", async () => {
    const { user } = openPage({ qualification: "required" });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    expect(current()).toContain("Job details");
    const label = screen.getByText(/^Qualification/);
    expect(label).not.toHaveTextContent("(optional)");
    expect(screen.getByText(/^Designation/)).toHaveTextContent("(optional)");

    await next(user);
    expect(await screen.findByText("Enter the qualification")).toBeInTheDocument();
    expect(current()).toContain("Job details");

    await user.type(screen.getByLabelText(/^Qualification/), "M.Sc., B.Ed.");
    await next(user);
    expect(current()).toContain("Teaching");
  });

  it("holds a needed personal detail on the first step", async () => {
    const { user } = openPage({ dateOfBirth: "required" });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    expect(await screen.findByText("Enter the date of birth")).toBeInTheDocument();
    expect(current()).toContain("Personal info");
  });

  it("needs a subject when the school says so, on the Teaching step", async () => {
    const { user } = openPage({ subjects: "required" });
    await screen.findByLabelText(/^Name/);
    await fillPersonal(user);
    await next(user);
    await next(user);
    expect(current()).toContain("Teaching");
    await next(user);
    expect(await screen.findByText("Choose at least one subject")).toBeInTheDocument();
    expect(current()).toContain("Teaching");
  });

  it("leaves the Job step out when the school asks none of its details", async () => {
    const { user } = openPage({ employeeCode: "hidden", designation: "hidden", qualification: "hidden", employmentType: "hidden", joiningDate: "hidden", experienceYears: "hidden" });
    await screen.findByLabelText(/^Name/);
    await waitFor(() => expect(screen.queryByText("Job details")).not.toBeInTheDocument());
    await fillPersonal(user);
    await next(user);
    expect(current()).toContain("Teaching");
  });
});
