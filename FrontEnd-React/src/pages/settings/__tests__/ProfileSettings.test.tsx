import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { AppThemeProvider } from "../../../theme/AppThemeProvider";
import type { MyProfile, OnboardingState, UserRole } from "../../../types";
import SettingsPage from "../Settings";

/** Settings (docs/profiles.md): School details (the administrator), Personal details (everyone who works at the school) and Appearance. */

const ADMIN: MyProfile = {
  kind: "account",
  teaches: false,
  name: "Asha Verma",
  email: "asha@school.example",
  username: null,
  roleLabel: null,
  mobile: "9876543210",
  designation: "Principal",
  designationOther: null,
  alternateMobile: null,
  gender: null,
  dateOfBirth: null,
  address: { line1: null, city: null, state: null, pincode: null },
  qualification: null,
  experienceYears: null,
  job: null,
};
const TEACHER: MyProfile = {
  ...ADMIN,
  kind: "member",
  teaches: true,
  name: "Meena Singh",
  email: "meena@mail.test",
  designation: null,
  gender: "Female",
  dateOfBirth: "1990-07-14",
  address: { line1: "4 Lake View", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  qualification: "B.Ed",
  experienceYears: 6,
  job: { employeeCode: "T-014", designation: "TGT", joiningDate: "2019-06-17" },
};
const SCHOOL = {
  approvalStatus: "approved",
  onboarding: { status: "COMPLETED", currentStep: 4, completedSteps: [1, 2, 3, 4] },
  rejectionReason: null,
  steps: {
    1: { schoolName: "Sunrise Public School", schoolType: "Private", approxStudents: 400, udiseCode: "", establishedYear: 1999, logoUrl: "", boards: [], lowestClass: null, highestClass: null, sessionStartMonth: 4, academicYear: null },
    2: { addressLine1: "12 MG Road", addressLine2: "", city: "Bhopal", state: "Madhya Pradesh", division: "", district: "Bhopal", pincode: "462001", schoolPhone: "9812345678", schoolEmail: "office@sunrise.example", website: "" },
    3: { adminName: "Asha Verma", designation: "Principal", designationOther: "", mobile: "9876543210", alternateMobile: "" },
    4: { confirmed: true },
  },
} as unknown as OnboardingState;

function openPage(role: UserRole, path = "/settings", extra: Record<string, Handler> = {}) {
  signInAs(role);
  const calls = fakeApi({
    "GET /onboarding": () => SCHOOL,
    "GET /profile": () => (role === "school_admin" ? ADMIN : TEACHER),
    "GET /profile/photo": () => ({ photo: null }),
    "GET /auth/me": () => ({ user: { id: "u1", name: "Asha Verma", role, tenantId: "t1" }, tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true } }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/settings", element: <SettingsPage /> }], { initialEntries: [path] });
  render(
    <Provider store={store}>
      <AppThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AppThemeProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const tabs = () => within(screen.getByRole("navigation", { name: "Settings sections" })).getAllByRole("button").map((b) => b.textContent);
const field = (label: RegExp | string) => screen.findByLabelText(label);

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("Settings: who sees what", () => {
  it("the administrator opens on School details, with Personal details and Appearance", async () => {
    const { calls } = openPage("school_admin");
    expect(await field(/^School name/)).toHaveValue("Sunrise Public School");
    expect(tabs()).toEqual(["School details", "Personal details", "Appearance"]);
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
    // Only what this tab shows is asked for.
    expect(calls.map((c) => c.path).filter((p) => p.startsWith("/profile"))).toEqual([]);
  });

  it("a teacher opens on Personal details, with no School details", async () => {
    const { calls } = openPage("teacher");
    expect(await field(/^Name/)).toHaveValue("Meena Singh");
    expect(tabs()).toEqual(["Personal details", "Appearance"]);
    expect(calls.some((c) => c.path === "/onboarding")).toBe(false);
  });

  it("a parent has only Appearance, and nothing is asked of the server", async () => {
    const { calls } = openPage("parent");
    expect(await screen.findByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(tabs()).toEqual(["Appearance"]);
    expect(calls).toEqual([]);
  });

  it("a tab is kept in the address", async () => {
    const { router, user } = openPage("school_admin");
    await user.click(await screen.findByRole("button", { name: "Appearance" }));
    expect(router.state.location.search).toBe("?tab=appearance");
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });
});

describe("Settings > School details", () => {
  it("changes the school's details with one Save, which waits for a change", async () => {
    const { calls, user } = openPage("school_admin", "/settings", { "PUT /onboarding/profile": () => SCHOOL });
    const name = await field(/^School name/);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Sunrise Senior School");
    await user.click(save);
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/onboarding/profile", body: expect.objectContaining({ schoolName: "Sunrise Senior School", approxStudents: 400, city: "Bhopal" }) });
    expect(await screen.findByText("School details have been updated.")).toBeInTheDocument();
  });

  it("uploads the logo from here", async () => {
    const { calls, user } = openPage("school_admin", "/settings", { "PUT /onboarding/logo": () => ({ ...SCHOOL, steps: { ...SCHOOL.steps, 1: { ...SCHOOL.steps[1], logoUrl: "/public/schools/t1/logo?v=1" } } }) });
    await field(/^School name/);
    await user.upload(screen.getByLabelText("Choose a logo"), new File(["x"], "logo.png", { type: "image/png" }));
    expect(await screen.findByRole("img", { name: "School logo" })).toBeInTheDocument();
    expect(writes(calls).map((c) => c.path)).toEqual(["/onboarding/logo"]);
  });
});

describe("Settings > Personal details", () => {
  it("the administrator changes their name, role and mobile; the email is only shown", async () => {
    const { calls, user } = openPage("school_admin", "/settings?tab=personal", { "PUT /profile": () => ({ ...ADMIN, mobile: "9812345670" }) });
    const mobile = await field(/^Mobile number/);
    expect(screen.getByText("asha@school.example")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Date of birth/)).not.toBeInTheDocument();
    await user.clear(mobile);
    await user.type(mobile, "9812345670");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    // Only what changed is sent.
    expect(writes(calls)[0].body).toEqual({ mobile: "9812345670" });
    expect(await screen.findByText("Your details are saved")).toBeInTheDocument();
  });

  it("a teacher sees the school's details to read, and changes their own", async () => {
    const { calls, user } = openPage("teacher", "/settings", { "PUT /profile": () => TEACHER });
    await field(/^Name/);
    for (const text of ["meena@mail.test", "T-014", "TGT", "17 Jun 2019"]) expect(screen.getByRole("region", { name: "From your school" })).toHaveTextContent(text);
    await user.clear(screen.getByLabelText(/^City/));
    await user.type(screen.getByLabelText(/^City/), "Indore");
    await user.clear(screen.getByLabelText(/^Experience/));
    await user.type(screen.getByLabelText(/^Experience/), "7");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ address: { city: "Indore" }, experienceYears: 7 });
  });

  it("a name and a mobile number are not emptied", async () => {
    const { calls, user } = openPage("teacher");
    await user.clear(await field(/^Name/));
    await user.clear(screen.getByLabelText(/^Mobile number/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter a 10-digit mobile number")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("what the server refuses is said under its box", async () => {
    const { user } = openPage("teacher", "/settings", {
      "PUT /profile": () => new Response(JSON.stringify({ success: false, message: "Another teacher has this mobile number.", code: "TEACHER_MOBILE_EXISTS", details: [{ path: "mobile", message: "Another teacher has this mobile number" }] }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const mobile = await field(/^Mobile number/);
    await user.clear(mobile);
    await user.type(mobile, "9000000000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Another teacher has this mobile number")).toBeInTheDocument();
  });

  it("a teacher has their resume here; the administrator has none", async () => {
    const teacher = openPage("teacher", "/settings", { "GET /profile/resume": () => ({ resume: null }) });
    expect(await screen.findByRole("button", { name: "Upload resume" })).toBeInTheDocument();
    expect(teacher.calls.filter((c) => c.path === "/profile/resume")).toHaveLength(1);
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    const admin = openPage("school_admin", "/settings?tab=personal");
    await field(/^Mobile number/);
    expect(screen.queryByRole("button", { name: "Upload resume" })).not.toBeInTheDocument();
    expect(admin.calls.some((c) => c.path === "/profile/resume")).toBe(false);
  });

  it("has the person's photo", async () => {
    const { calls } = openPage("teacher");
    await field(/^Name/);
    expect(screen.getByRole("button", { name: "Add photo" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/profile/photo")).toHaveLength(1);
  });
});
