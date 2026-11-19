import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { InactivePage, InactiveStudent } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import InactiveStudentsPage from "../InactiveStudents";

const ASHA: InactiveStudent = {
  id: "s1",
  name: "Asha Verma",
  gender: "Female",
  admissionNumber: "ADM-2026-0001",
  dateOfBirth: "2016-05-14",
  className: "Class 5",
  sectionName: "A",
  rollNumber: 7,
  parentName: "Ravi Verma",
  parentMobile: "9876543210",
  reason: "Left the school",
  transfer: null,
  inactiveAt: "2026-10-25T10:30:00.000Z",
  inactiveBy: { name: "Meena Singh", role: "school_admin" },
};
const KABIR: InactiveStudent = { ...ASHA, id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2026-0002", rollNumber: null, reason: null, inactiveBy: { name: "Dev Patel", role: "principal" } };

const pageOf = (items: InactiveStudent[]): InactivePage => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1 });

function school(items: InactiveStudent[], extra: Record<string, Handler> = {}): Call[] {
  return fakeApi({ "GET /students/inactive": () => pageOf(items), ...extra });
}

function openPage() {
  const router = createMemoryRouter(
    [
      { path: "/school/students/inactive", element: <InactiveStudentsPage /> },
      { path: "/school/students", element: <p>The students</p> },
      { path: "/school/students/:id", element: <p>One student</p> },
    ],
    { initialEntries: ["/school/students/inactive"] }
  );
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

const posts = (calls: Call[], path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

describe("the inactive students", () => {
  it("lists inactive students and their history without in-page status tabs", async () => {
    school([ASHA, KABIR]);
    openPage();
    expect(await screen.findByRole("heading", { name: "Inactive students", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    const row = screen.getByText("Asha Verma").closest("tr")!;
    expect(row).toHaveTextContent("ADM-2026-0001");
    expect(row).toHaveTextContent("Class 5 - A");
    expect(row).toHaveTextContent("25 Oct 2026, 4:00 pm");
    expect(row).toHaveTextContent("by Meena Singh · Left the school");
    expect(screen.queryByRole("navigation", { name: "Students by status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/delete|recycle/i)).not.toBeInTheDocument();
  });

  it("the name opens the student's page, where their details are", async () => {
    school([ASHA]);
    expect(((openPage(), await screen.findByRole("link", { name: "Asha Verma" })) as HTMLAnchorElement).getAttribute("href")).toBe("/school/students/s1");
  });

  it("nobody inactive says so, and points back to the active students", async () => {
    school([]);
    openPage();
    expect(await screen.findByRole("heading", { name: "No inactive students" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the active students" })).toHaveAttribute("href", "/school/students");
  });

  it("Make active brings one student back with one request, and the row goes", async () => {
    let items = [ASHA, KABIR];
    const calls = school([], {
      "GET /students/inactive": () => pageOf(items),
      "POST /students/reactivate": (body) => {
        items = items.filter((i) => !(body as { ids: string[] }).ids.includes(i.id));
        return { reactivated: 1, skipped: 0, rollNumbersLost: 0 };
      },
    });
    const { user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Make Asha Verma active" }));
    await waitFor(() => expect(screen.queryByText("Asha Verma")).not.toBeInTheDocument());
    expect(posts(calls, "/students/reactivate")).toHaveLength(1);
    expect(posts(calls, "/students/reactivate")[0].body).toEqual({ ids: ["s1"] });
    expect(screen.getByText("Kabir Rao")).toBeInTheDocument();
  });

  it("chosen students are made active together", async () => {
    const calls = school([ASHA, KABIR], { "POST /students/reactivate": () => ({ reactivated: 2, skipped: 0, rollNumbersLost: 0 }) });
    const { user } = openPage();
    await user.click(await screen.findByRole("checkbox", { name: "Select all students on this page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make selected active" }));
    await waitFor(() => expect(posts(calls, "/students/reactivate")).toHaveLength(1));
    expect(posts(calls, "/students/reactivate")[0].body).toEqual({ ids: ["s1", "s2"] });
  });

  it("says when a student came back without their roll number", async () => {
    school([ASHA], { "POST /students/reactivate": () => ({ reactivated: 1, skipped: 0, rollNumbersLost: 1 }) });
    const { user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Make Asha Verma active" }));
    expect(await screen.findByText(/1 came back without a roll number/)).toBeInTheDocument();
  });
});
