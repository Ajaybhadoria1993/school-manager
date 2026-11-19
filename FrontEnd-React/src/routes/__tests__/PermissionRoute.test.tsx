import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../redux/store";
import { signInAs, signOut } from "../../test/session";
import type { UserRole } from "../../types";
import PermissionRoute from "../PermissionRoute";

function open(role: UserRole, permissions?: string[]) {
  signInAs(role, permissions);
  const router = createMemoryRouter(
    [
      { path: "/dashboard", element: <p>Home</p> },
      { element: <PermissionRoute keys={["students.add", "students.edit"]} />, children: [{ path: "/school/students/new", element: <p>The admission form</p> }] },
    ],
    { initialEntries: ["/school/students/new"] }
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  return router;
}

afterEach(() => {
  cleanup();
  signOut();
});

describe("a page for the people the school allowed", () => {
  it("opens for the school admin and the principal whatever their list", () => {
    open("school_admin", []);
    expect(screen.getByText("The admission form")).toBeInTheDocument();
    cleanup();
    open("principal", []);
    expect(screen.getByText("The admission form")).toBeInTheDocument();
  });

  it("opens for anyone whose kind has any of its permissions", () => {
    open("receptionist", ["students.edit"]);
    expect(screen.getByText("The admission form")).toBeInTheDocument();
  });

  it("sends anyone else home, and shows them nothing of the page", async () => {
    const router = open("receptionist", ["students.view", "calendar.view"]);
    expect(screen.queryByText("The admission form")).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("waits for nobody to be signed in: no page at all", () => {
    signOut();
    const router = createMemoryRouter([{ element: <PermissionRoute keys={["students.add"]} />, children: [{ path: "/x", element: <p>Secret</p> }] }], { initialEntries: ["/x"] });
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
});
