import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { WriteOnly } from "../WriteOnly";
import { useReadOnlyYear } from "../../../hooks/useReadOnlyYear";

/**
 * While a year that is over is open nothing is changed: the buttons that would change something are not shown (the server refuses them
 * too). `WriteOnly` wraps such a button; `useReadOnlyYear` is for a page that has to decide in code.
 */

function Page() {
  const readOnly = useReadOnlyYear();
  return (
    <>
      <WriteOnly>
        <button>Add student</button>
      </WriteOnly>
      <p>{readOnly ? "Read only" : "Can change"}</p>
    </>
  );
}

const show = () =>
  render(
    <Provider store={store}>
      <Page />
    </Provider>
  );

afterEach(() => {
  cleanup();
  store.dispatch(yearViewChanged(null));
});

describe("what changes something while a year that is over is open", () => {
  it("is shown in the running year", () => {
    show();
    expect(screen.getByRole("button", { name: "Add student" })).toBeInTheDocument();
    expect(screen.getByText("Can change")).toBeInTheDocument();
  });

  it("is not shown while a year that is over is open", () => {
    store.dispatch(yearViewChanged("y26"));
    show();
    expect(screen.queryByRole("button", { name: "Add student" })).not.toBeInTheDocument();
    expect(screen.getByText("Read only")).toBeInTheDocument();
  });
});
