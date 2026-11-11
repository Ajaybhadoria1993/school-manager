import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { allApiSlices } from "../../redux/api/apiRoot";
import store from "../../redux/store";
import { authChecked, sessionStarted, signedOut } from "../../redux/slices/authSlice";
import { fakeApi } from "../../test/fakeApi";
import { Wizard } from "../../components/onboarding/Wizard";
import { useReportStage } from "../../components/onboarding/stage";
import { clearTokens, setTokens } from "../../utils/auth";
import type { OnboardingState } from "../../types";
import OnboardingLayout from "../OnboardingLayout";

/** The school's sign-up form: a slim photo panel at the left, a dark bar on top, and the form taking the rest of the page. */

/** A screen that says which stage it shows, as the real steps do. */
function Stage({ at }: { at: number }) {
  useReportStage(at);
  return <p>The form</p>;
}

function openLayout(stage = 1) {
  fakeApi({});
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Ganesha Public School", slug: "g", isActive: true, approvalStatus: "onboarding", onboarding: { status: "IN_PROGRESS", currentStep: 1, completedSteps: [], submittedAt: null, resubmittedCount: 0 }, rejectionReason: null, mediums: [] },
    } as never)
  );
  store.dispatch(authChecked());
  const router = createMemoryRouter([{ path: "/onboarding", element: <OnboardingLayout />, children: [{ index: true, element: <Stage at={stage} /> }] }], { initialEntries: ["/onboarding"] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
}

const STATE: OnboardingState = {
  approvalStatus: "onboarding",
  onboarding: { status: "IN_PROGRESS", currentStep: 1, completedSteps: [], submittedAt: null, resubmittedCount: 0 },
  rejectionReason: null,
  steps: {
    1: { schoolName: "Ganesha Public School", schoolType: null, boards: [], lowestClass: null, highestClass: null, approxStudents: null, sessionStartMonth: 4, academicYear: { name: "", startDate: "", endDate: "", status: null }, udiseCode: "", establishedYear: null, logoUrl: "" },
    2: { addressLine1: "", addressLine2: "", city: "", state: "", pincode: "", division: "", district: "", schoolPhone: "", schoolEmail: "", website: "" },
    3: { adminName: "", designation: null, designationOther: "", mobile: "", alternateMobile: "" },
    4: { confirmed: false },
  },
};

const openWizard = (step = 1) =>
  render(
    <Provider store={store}>
      <Wizard state={{ ...STATE, onboarding: { ...STATE.onboarding, currentStep: step } }} onSubmitted={() => {}} onLocked={() => {}} />
    </Provider>
  );

beforeEach(() => {
  setTokens("token-1", "refresh-1");
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});
afterEach(() => {
  cleanup();
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
  clearTokens();
});

describe("the frame of the sign-up form", () => {
  it("keeps the campus photo beside the form, with what it promises", async () => {
    openLayout();
    await screen.findByText("The form");
    const panel = screen.getByRole("complementary");
    expect(panel.querySelector('img[src="/images/hero-campus.jpg"]')).not.toBeNull();
    for (const line of ["Quick & Easy", "Kept private", "Checked by people", "Saved as you go"]) expect(within(panel).getByText(line)).toBeInTheDocument();
  });

  it("the panel is slim, so the form keeps most of the page", async () => {
    openLayout();
    await screen.findByText("The form");
    expect(screen.getByRole("complementary").className).toMatch(/(^|\s)w-72(\s|$)/);
  });

  it("its headline follows the step the school is on", async () => {
    openLayout(2);
    await screen.findByText("The form");
    expect(within(screen.getByRole("complementary")).getByRole("heading", { level: 2 })).toHaveTextContent("Pick the session and the boards");
  });

  it("the form takes the rest of the width", async () => {
    openLayout();
    await screen.findByText("The form");
    expect(screen.getByRole("main").className).not.toMatch(/max-w-/);
  });

  it("has a dark bar with the school, the person and a way out", async () => {
    openLayout();
    await screen.findByText("The form");
    const bar = screen.getByRole("banner");
    expect(bar.className).toContain("bg-navy");
    expect(within(bar).getByText("Ganesha Public School")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("the logo is in the panel on a wide screen and in the bar on a small one, never both", async () => {
    openLayout();
    await screen.findByText("The form");
    const inBar = within(screen.getByRole("banner")).getByRole("link", { name: "EduShiksha home" });
    expect(inBar.className).toContain("xl:hidden");
  });
});

describe("the look of the form", () => {
  it("every box has the taller look", () => {
    openWizard();
    expect(document.getElementById("schoolName")?.className).toMatch(/(^|\s)h-12(\s|$)/);
  });

  it("step 1 has the school, its address and its contact, each a strip with its name", () => {
    openWizard();
    for (const name of ["Basics", "Location", "Contact", "Registration"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  });

  it("step 2 is the academic year, with the boards, mediums and timing under it", () => {
    openWizard(2);
    // The step is called Academic year, and so is its first part.
    expect(screen.getAllByRole("heading", { name: "Academic year" })).toHaveLength(2);
    const form = within(document.querySelector("form") as HTMLElement);
    expect(form.getByRole("heading", { name: "Academic year" })).toBeInTheDocument();
    expect(form.getByRole("heading", { name: "Board and medium" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Basics" })).not.toBeInTheDocument();
  });

  it("the steps are named School Details, Academic Year, Your Profile, Review & Submit", () => {
    openWizard();
    const stepper = screen.getAllByRole("list")[0];
    expect(within(stepper).getByText("School Details")).toBeInTheDocument();
    expect(within(stepper).getByText("Academic Year")).toBeInTheDocument();
    expect(within(stepper).queryByText("Address & Contact")).not.toBeInTheDocument();
  });

  it("says no more than it needs to", () => {
    openWizard();
    expect(screen.queryByText("The basics about your school")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add every board your school follows/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The session your school is running/)).not.toBeInTheDocument();
  });

  it("students are asked with the school's registration, not in a part of their own", () => {
    openWizard();
    expect(screen.queryByRole("heading", { name: "Size" })).not.toBeInTheDocument();
    expect(document.getElementById("approxStudents")).not.toBeNull();
  });
});
