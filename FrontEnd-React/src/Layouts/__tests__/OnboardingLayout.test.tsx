import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { allApiSlices } from "../../redux/api/apiRoot";
import store from "../../redux/store";
import { authChecked, sessionStarted, signedOut } from "../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../test/fakeApi";
import { Wizard } from "../../components/onboarding/Wizard";
import { StageProvider, useProgress, useReportProgress, type OnboardingProgress } from "../../components/onboarding/stage";
import { clearTokens, setTokens } from "../../utils/auth";
import { DEFAULT_SETUP, generateDay } from "../../utils/timings";
import type { OnboardingState } from "../../types";
import OnboardingLayout from "../OnboardingLayout";

/**
 * The frame of the school's sign-up form: a dark-blue panel at the left with the five screens down the side, a white card at the top with the
 * heading of the screen (with the handwritten line and the cap at its right). Sign out is the small icon beside the logo. The wizard tells it
 * where the school is.
 */

/** A screen that says where the school is, as the real wizard does. */
function Screen({ progress }: { progress: OnboardingProgress }) {
  useReportProgress(progress);
  return <p>The form</p>;
}

/** What the last frame asked of the server. */
let lastCalls: Call[] = [];

function openLayout(progress: OnboardingProgress = { active: 1, done: [], reachable: 1 }) {
  lastCalls = fakeApi({ "POST /auth/logout": () => ({}) });
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Anuj Bhadoria", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Ganesha Public School", slug: "g", isActive: true, approvalStatus: "onboarding", onboarding: { status: "IN_PROGRESS", currentStep: 1, completedSteps: [], submittedAt: null, resubmittedCount: 0 }, rejectionReason: null, mediums: [] },
    } as never)
  );
  store.dispatch(authChecked());
  const router = createMemoryRouter([{ path: "/onboarding", element: <OnboardingLayout />, children: [{ index: true, element: <Screen progress={progress} /> }] }], { initialEntries: ["/onboarding"] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return userEvent.setup();
}

const progressList = () => screen.getByRole("navigation", { name: "Onboarding progress" });

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

describe("the dark-blue panel", () => {
  it("has the logo and the name, 'Onboarding Progress' and the five screens in order", async () => {
    openLayout();
    await screen.findByText("The form");
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("EduShiksha")).toBeInTheDocument();
    expect(within(panel).getByText("Schools . Simplified")).toBeInTheDocument();
    expect(within(panel).getByText("Onboarding Progress")).toBeInTheDocument();
    const steps = within(progressList()).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual([
      expect.stringContaining("School Details"),
      expect.stringContaining("Academic Year"),
      expect.stringContaining("Class Sections"),
      expect.stringContaining("Your Profile"),
      expect.stringContaining("Review & Submit"),
    ]);
  });

  it("uses the login kit's pictures: the logo, the school and the dark-blue background", async () => {
    openLayout();
    await screen.findByText("The form");
    const panel = screen.getByRole("complementary");
    expect(panel.querySelector('img[src="/images/onboarding/logo.svg"]')).not.toBeNull();
    expect(panel.querySelector('img[src="/images/onboarding/school-building.svg"]')).not.toBeNull();
    expect(panel.getAttribute("style")).toContain("/images/onboarding/sidebar-bg.svg");
    expect(within(panel).getByText(/Better Education/)).toBeInTheDocument();
  });

  it("lights the open screen and says what it is about; the others only have their names", async () => {
    openLayout({ active: 3, done: [1, 2], reachable: 3 });
    await screen.findByText("The form");
    const open = within(progressList()).getByRole("button", { current: "step" });
    expect(open).toHaveTextContent("Class Sections");
    expect(open).toHaveTextContent("Configure classes & sections");
    expect(within(progressList()).queryByText("Check and send for approval")).not.toBeInTheDocument();
  });

  it("ticks the screens that are done", async () => {
    openLayout({ active: 3, done: [1, 2], reachable: 3 });
    await screen.findByText("The form");
    const items = within(progressList()).getAllByRole("listitem");
    // A tick (an icon) for the first two, the number for the open one and the ones after it.
    expect(items[0].querySelector("svg.lucide-check")).not.toBeNull();
    expect(items[1].querySelector("svg.lucide-check")).not.toBeNull();
    expect(items[2].querySelector("svg.lucide-check")).toBeNull();
    expect(items[2]).toHaveTextContent("3");
    expect(items[3]).toHaveTextContent("4");
  });

  it("a screen that is done, or the next one, can be pressed to open it; the later ones wait", async () => {
    const onSelect = vi.fn();
    const user = openLayout({ active: 2, done: [1], reachable: 3, onSelect });
    await screen.findByText("The form");
    await user.click(within(progressList()).getByRole("button", { name: /School Details/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
    await user.click(within(progressList()).getByRole("button", { name: /Class Sections/ }));
    expect(onSelect).toHaveBeenLastCalledWith(3);
    expect(within(progressList()).getByRole("button", { name: /Your Profile/ })).toBeDisabled();
    expect(within(progressList()).getByRole("button", { name: /Review & Submit/ })).toBeDisabled();
  });

  it("is only a picture once the form was sent: every screen is ticked and none can be pressed", async () => {
    openLayout({ active: 6, done: [1, 2, 3, 4, 5], reachable: 0 });
    await screen.findByText("The form");
    for (const button of within(progressList()).getAllByRole("button")) expect(button).toBeDisabled();
    expect(within(progressList()).getAllByRole("listitem").every((li) => li.querySelector("svg.lucide-check"))).toBe(true);
  });
});

describe("the card at the top", () => {
  it("names the screen and says in a line what it is for", async () => {
    openLayout({ active: 2, done: [1], reachable: 2 });
    await screen.findByText("The form");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Academic Year");
    expect(screen.getByText("Pick the session and the boards and mediums your school runs")).toBeInTheDocument();
  });

  it("Class Sections is 'Class Sections Management', and can name the range the school chose", async () => {
    openLayout({ active: 3, done: [1, 2], reachable: 3, subtitle: "Configure sections for each class (Nursery to 10th) with their details" });
    await screen.findByText("The form");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Class Sections Management");
    expect(screen.getByText("Configure sections for each class (Nursery to 10th) with their details")).toBeInTheDocument();
  });

  it("has the handwritten line and the graduation cap inside the card, at its right, side by side so the words never lie across the cap", async () => {
    openLayout();
    await screen.findByText("The form");
    const header = screen.getByRole("banner");
    const cap = header.querySelector('img[src="/images/onboarding/graduation-cap.svg"]');
    expect(cap).not.toBeNull();
    const tagline = cap?.closest("[aria-hidden]");
    expect(tagline).toHaveTextContent("better learning journey");
    // The words and the picture are two things in one row, and the picture is not read out.
    expect(cap?.parentElement).toBe(tagline);
    expect(tagline?.className).toMatch(/items-center/);
    // The building, the heading and then the tagline: in that order inside the card.
    const building = header.querySelector('img[src="/images/onboarding/school-building.svg"]') as HTMLElement;
    expect(building.compareDocumentPosition(tagline as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).compareDocumentPosition(tagline as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no bell and no person at the top right any more", async () => {
    openLayout();
    await screen.findByText("The form");
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Anuj Bhadoria/ })).not.toBeInTheDocument();
  });

  it("is gone with the card once the form was sent", async () => {
    openLayout({ active: 6, done: [1, 2, 3, 4, 5], reachable: 0 });
    await screen.findByText("The form");
    expect(document.querySelector('img[src="/images/onboarding/graduation-cap.svg"]')).toBeNull();
  });

  it("is gone once the form was sent: the waiting page has its own heading", async () => {
    openLayout({ active: 6, done: [1, 2, 3, 4, 5], reachable: 0 });
    await screen.findByText("The form");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});

describe("the places beside the card", () => {
  it("has one under the card and one at the right, empty (and not taking room) until a screen fills them", async () => {
    openLayout();
    await screen.findByText("The form");
    const empties = Array.from(document.querySelectorAll(".empty\\:hidden"));
    expect(empties).toHaveLength(2);
    expect(empties.every((el) => el.childElementCount === 0)).toBe(true);
  });
});

describe("signing out", () => {
  it("is a small icon beside the logo in the dark panel", async () => {
    openLayout();
    await screen.findByText("The form");
    const panel = screen.getByRole("complementary");
    const out = within(panel).getByRole("button", { name: "Sign out" });
    expect(out.querySelector("svg.lucide-log-out")).not.toBeNull();
    // Next to the logo and the name, at the right of them.
    const logo = panel.querySelector('img[src="/images/onboarding/logo.svg"]') as HTMLElement;
    expect(logo.parentElement?.parentElement).toBe(out.parentElement);
    expect(logo.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("one press leaves: the server is told and the school admin is out", async () => {
    const user = openLayout();
    await screen.findByText("The form");
    await user.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(lastCalls.some((c) => c.method === "POST" && c.path === "/auth/logout")).toBe(true));
    await waitFor(() => expect(store.getState().auth.user).toBeNull());
  });

  it("has a copy on the light page for a phone, where there is no panel", async () => {
    openLayout();
    await screen.findByText("The form");
    // The panel's, and the phone's.
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(2);
  });
});

describe("on a phone", () => {
  it("says which screen of five the school is on, with a bar", async () => {
    openLayout({ active: 3, done: [1, 2], reachable: 3 });
    await screen.findByText("The form");
    const progress = screen.getByLabelText("Progress");
    expect(progress).toHaveTextContent("Step 3 of 5: Class Sections");
  });
});

/* ------------------------------------------------------------------------------------------------------------------------------------- */

const STATE: OnboardingState = {
  approvalStatus: "onboarding",
  onboarding: { status: "IN_PROGRESS", currentStep: 1, completedSteps: [], submittedAt: null, resubmittedCount: 0 },
  rejectionReason: null,
  steps: {
    1: {
      schoolName: "Ganesha Public School",
      schoolType: "Private",
      boards: [
        {
          board: "CBSE",
          stateBoard: "",
          otherBoard: "",
          affiliationNumber: "",
          mediums: ["English"],
          plans: [
            {
              medium: "English",
              lowestClass: "Nursery",
              highestClass: "2",
              seniorStreams: [],
              classes: ["Nursery", "LKG", "UKG", "Class 1", "Class 2"].map((name) => ({ name, sections: 1, seats: 40 })),
              week: { days: [1, 2, 3, 4, 5], usual: generateDay(DEFAULT_SETUP).slots, saturday: null },
            },
          ],
        },
      ],
      lowestClass: "Nursery",
      highestClass: "2",
      approxStudents: 300,
      sessionStartMonth: 4,
      academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: null },
      udiseCode: "",
      establishedYear: null,
      logoUrl: "",
    },
    2: { addressLine1: "12 MG Road", addressLine2: "", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001", division: "", district: "Bhopal", schoolPhone: "9876543210", schoolEmail: "o@g.in", website: "" },
    3: { adminName: "Anuj", designation: "Principal", designationOther: "", mobile: "9876543210", alternateMobile: "" },
    4: { confirmed: false },
  },
};

function Probe() {
  const p = useProgress();
  return (
    <p data-testid="where">
      {p.active}|{p.done.join(",")}|{p.reachable}|{p.subtitle ?? ""}
    </p>
  );
}

function openWizard(currentStep: number, completedSteps: number[] = [], handlers: Parameters<typeof fakeApi>[0] = {}) {
  const calls: Call[] = fakeApi(handlers);
  const state: OnboardingState = { ...STATE, onboarding: { ...STATE.onboarding, currentStep, completedSteps } };
  render(
    <Provider store={store}>
      <StageProvider>
        <Probe />
        <Wizard state={state} onSubmitted={() => {}} onLocked={() => {}} />
      </StageProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}
const where = () => screen.getByTestId("where").textContent;
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /save & continue/i }));

describe("the five screens and the three saved steps", () => {
  it("a form saved up to step 1 opens on Academic Year; up to step 2 on Your Profile; up to step 3 on the review", () => {
    openWizard(2, [1]);
    expect(where()).toBe("2|1|2|");
    cleanup();
    openWizard(3, [1, 2]);
    expect(where()).toBe("4|1,2,3|4|");
    cleanup();
    openWizard(4, [1, 2, 3]);
    expect(where()).toBe("5|1,2,3,4|5|");
  });

  it("Academic Year goes on to Class Sections without saving anything, and the range shows in the heading's line", async () => {
    const { calls, user } = openWizard(2, [1]);
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^3\|/));
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(where()).toContain("Configure sections for each class (Nursery to 2nd) with their details");
    expect(screen.getByLabelText("Class 1: sections")).toBeInTheDocument();
  });

  it("Class Sections saves the whole step 2 (the year, the boards and the classes) and goes on to Your Profile", async () => {
    const saved: OnboardingState = { ...STATE, onboarding: { ...STATE.onboarding, currentStep: 3, completedSteps: [1, 2] } };
    const { calls, user } = openWizard(2, [1], { "PUT /onboarding/steps/2": () => saved });
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^3\|/));
    await user.type(screen.getByLabelText("Class 1: room"), "104");
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^4\|/));
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].path).toBe("/onboarding/steps/2");
    const body = puts[0].body as { boards: { plans: { classes: { name: string; room?: string }[] }[] }[]; academicYear: { name: string } };
    expect(body.academicYear.name).toBe("2026-2027");
    expect(body.boards[0].plans[0].classes.find((c) => c.name === "Class 1")?.room).toBe("104");
  });

  it("what was typed on Class Sections is kept when the school goes back to Academic Year and forward again", async () => {
    const { user } = openWizard(2, [1]);
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^3\|/));
    await user.type(screen.getByLabelText("Class 2: room"), "105");
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(where()).toMatch(/^2\|/));
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^3\|/));
    expect(screen.getByLabelText("Class 2: room")).toHaveValue("105");
  });

  it("a problem in the year found on Class Sections opens Academic Year with the message", async () => {
    const { calls, user } = openWizard(2, [1], { "PUT /onboarding/steps/2": () => new Response(JSON.stringify({ success: false, message: "Invalid", code: "VALIDATION", details: [{ path: "academicYear.endDate", message: "The year must end after it starts" }] }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^3\|/));
    await next(user);
    await waitFor(() => expect(where()).toMatch(/^2\|/));
    expect(await screen.findByText("The year must end after it starts")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("Your Profile has Previous back to Class Sections", async () => {
    const { user } = openWizard(3, [1, 2]);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(where()).toMatch(/^3\|/));
  });

  it("on the review, each part's Edit opens the screen it was filled in on", async () => {
    const wanted: [string, RegExp][] = [
      ["Edit School", /^1\|/],
      ["Edit Address and contact", /^1\|/],
      ["Edit Academic year", /^2\|/],
      ["Edit English Medium", /^3\|/],
      ["Edit Registered by", /^4\|/],
    ];
    for (const [name, screenNumber] of wanted) {
      const { user } = openWizard(4, [1, 2, 3]);
      await user.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(where()).toMatch(screenNumber));
      cleanup();
    }
  });
});

describe("the look of the form", () => {
  it("every box has the soft look: tall, white, rounded, with a blue icon inside", () => {
    openWizard(1);
    const box = document.getElementById("schoolName");
    expect(box?.className).toMatch(/(^|\s)h-12(\s|$)/);
    expect(box?.className).toMatch(/rounded-xl/);
    expect(box?.className).toMatch(/bg-white/);
    expect(box?.parentElement?.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });

  it("each part of a screen is a white card on the light page, with its icon in a soft blue square (no gold strip)", () => {
    openWizard(1);
    const card = screen.getByRole("heading", { name: "Basics" }).closest("section");
    expect(card?.className).toMatch(/rounded-2xl/);
    expect(card?.className).toMatch(/bg-white/);
    expect(card?.innerHTML).not.toContain("border-l-gold");
    expect(card?.querySelector(".bg-primary-soft")).not.toBeNull();
  });

  it("School Details has the school, its address and its contact, each a strip with its name", () => {
    openWizard(1);
    for (const name of ["Basics", "Location", "Contact", "Registration"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  });

  it("Academic Year is the year and the boards, and not the school or the classes", () => {
    openWizard(2, [1]);
    expect(screen.getByRole("heading", { name: "Academic year" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Board and medium" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Basics" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Class 1: sections")).not.toBeInTheDocument();
  });

  it("the buttons are Previous and Save & Continue, only the buttons: no bar, no white background, nothing fixed to the window", () => {
    openWizard(2, [1]);
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: /save & continue/i });
    const row = save.parentElement as HTMLElement;
    expect(row.className).toMatch(/justify-between/);
    for (const unwanted of ["sticky", "fixed", "bg-white", "border-t", "shadow", "backdrop-blur"]) expect(row.className).not.toContain(unwanted);
    // Previous on the left, Save & Continue on the right.
    expect(row.firstElementChild).toBe(screen.getByRole("button", { name: "Previous" }));
    expect(row.lastElementChild).toBe(save);
  });

  it("School Details has no Previous: it is the first", () => {
    openWizard(1);
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  });

  it("says no more than it needs to", () => {
    openWizard(1);
    expect(screen.queryByText("The basics about your school")).not.toBeInTheDocument();
    expect(screen.queryByText(/Add every board your school follows/)).not.toBeInTheDocument();
  });

  it("students are asked with the school's registration, not in a part of their own", () => {
    openWizard(1);
    expect(screen.queryByRole("heading", { name: "Size" })).not.toBeInTheDocument();
    expect(document.getElementById("approxStudents")).not.toBeNull();
  });
});
