import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { signInAs, signOut } from "../../../test/session";
import { NewMenu } from "../NewMenu";

/**
 * The "New" button of the top bar: a menu of what can be added from anywhere (a student, a teacher), each with its words and its keyboard
 * shortcut (Alt + a letter), which works without opening the menu. Only what this person may add is offered; nothing to add, no button.
 */

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}
function openHeader(initial = "/dashboard") {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initial]}>
        <NewMenu />
        <Where />
      </MemoryRouter>
    </Provider>
  );
  return userEvent.setup();
}
const where = () => screen.getByTestId("where").textContent;
const press = (code: string, extra: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(document.body, { code, key: code.replace("Key", "").toLowerCase(), altKey: true, ...extra });
const newButton = () => screen.getByRole("button", { name: "New" });

afterEach(() => {
  cleanup();
  signOut();
  store.dispatch(yearViewChanged(null));
});

describe("the New menu of the top bar", () => {
  it("opens a list of what can be added, each with a line about it and its shortcut", async () => {
    signInAs();
    const user = openHeader();
    expect(newButton()).toHaveAttribute("aria-expanded", "false");
    await user.click(newButton());
    expect(newButton()).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "New" });
    const student = within(menu).getByRole("menuitem", { name: /Add student/ });
    expect(student).toHaveAttribute("href", "/school/students/new");
    expect(student).toHaveAttribute("aria-keyshortcuts", "Alt+S");
    expect(within(student).getByText("Admit a new student to a class")).toBeInTheDocument();
    expect(within(student).getByText("Alt")).toBeInTheDocument();
    expect(within(student).getByText("S")).toBeInTheDocument();
    const teacher = within(menu).getByRole("menuitem", { name: /Add teacher/ });
    expect(teacher).toHaveAttribute("href", "/teachers/new");
    expect(teacher).toHaveAttribute("aria-keyshortcuts", "Alt+T");
  });

  it("choosing Add student goes to the admission form and closes the menu", async () => {
    signInAs();
    const user = openHeader();
    await user.click(newButton());
    await user.click(screen.getByRole("menuitem", { name: /Add student/ }));
    expect(where()).toBe("/school/students/new");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape, or a press outside, closes it", async () => {
    signInAs();
    const user = openHeader();
    await user.click(newButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(newButton());
    await user.click(screen.getByTestId("where"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the shortcuts work with the menu closed: Alt + S for a student, Alt + T for a teacher", () => {
    signInAs();
    openHeader();
    press("KeyS");
    expect(where()).toBe("/school/students/new");
    press("KeyT");
    expect(where()).toBe("/teachers/new");
  });

  it("a letter without Alt, or with Ctrl or Command as well, is only typing: nothing happens", () => {
    signInAs();
    openHeader();
    press("KeyS", { altKey: false });
    press("KeyS", { ctrlKey: true });
    press("KeyS", { metaKey: true });
    press("KeyS", { shiftKey: true });
    expect(where()).toBe("/dashboard");
  });

  it("a key held down is one press: the repeats do nothing", () => {
    signInAs();
    openHeader();
    press("KeyS", { repeat: true });
    expect(where()).toBe("/dashboard");
  });

  it("a window that asks something (a dialog) is not left by a shortcut", () => {
    signInAs();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <NewMenu />
          <Where />
          <div role="dialog" aria-modal="true" aria-label="Something is asked" />
        </MemoryRouter>
      </Provider>
    );
    press("KeyS");
    expect(where()).toBe("/dashboard");
  });

  it("only what this person may add is offered: a receptionist who may add students has no Add teacher", async () => {
    signInAs("receptionist", ["students.add", "students.view"]);
    const user = openHeader();
    await user.click(newButton());
    expect(screen.getByRole("menuitem", { name: /Add student/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Add teacher/ })).toBeNull();
    await user.keyboard("{Escape}");
    press("KeyT");
    expect(where()).toBe("/dashboard");
    press("KeyS");
    expect(where()).toBe("/school/students/new");
  });

  it("a person who may add nothing has no New button and no shortcuts", () => {
    signInAs("teacher", ["attendance.view"]);
    openHeader();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    press("KeyS");
    press("KeyT");
    expect(where()).toBe("/dashboard");
  });

  it("nobody signed in: nothing", () => {
    openHeader();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    press("KeyS");
    expect(where()).toBe("/dashboard");
  });

  it("while a year that is over is open (read only) nothing can be added: no button, no shortcut", () => {
    signInAs();
    store.dispatch(yearViewChanged("y-old"));
    openHeader();
    expect(screen.queryByRole("button", { name: "New" })).toBeNull();
    press("KeyS");
    expect(where()).toBe("/dashboard");
  });
});
