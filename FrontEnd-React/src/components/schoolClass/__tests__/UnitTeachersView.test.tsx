import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { setTokens, clearTokens } from "../../../utils/auth";
import { UnitTeachersView } from "../UnitTeachersView";

/** The teachers of one section as they were in a year that is over: the class teacher, then each subject with who taught it. Nothing to change. */

const ROWS = [
  { subjectId: "s1", subjectName: "Mathematics", subjectCode: null, category: "core", subjectActive: true, periodsPerWeek: 6, blockSize: 1, teacherId: "t1", teacherName: "Meena Singh", backups: [{ id: "t2", name: "Dev Patel" }], group: null },
  { subjectId: "s2", subjectName: "English", subjectCode: null, category: "core", subjectActive: true, periodsPerWeek: 5, blockSize: 1, teacherId: null, teacherName: null, backups: [], group: null },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearTokens();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

function show(headTeacher: { id: string; name: string } | null) {
  setTokens("token-1", "refresh-1");
  fakeApi({ "GET /subjects/allotments": () => ({ unit: { label: "Class 6 - A" }, rows: ROWS }) });
  render(
    <Provider store={store}>
      <UnitTeachersView classId="c6" sectionId="c6-A" classTeacher={headTeacher} />
    </Provider>
  );
}

describe("the teachers of a section, to look at", () => {
  it("names the class teacher, and for each subject the main teacher, the other teachers and the periods; no control to change anything", async () => {
    show({ id: "t1", name: "Meena Singh" });
    const region = await screen.findByRole("region", { name: "Teachers" });
    expect(within(region).getByText("Class teacher")).toBeInTheDocument();
    const maths = await within(region).findByRole("listitem", { name: "Mathematics" });
    expect(maths).toHaveTextContent("Meena Singh");
    expect(maths).toHaveTextContent("Dev Patel");
    expect(maths).toHaveTextContent("6 periods");
    expect(within(region).getByRole("listitem", { name: "English" })).toHaveTextContent("No teacher");
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
    expect(within(region).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says so when the class had no class teacher", async () => {
    show(null);
    const region = await screen.findByRole("region", { name: "Teachers" });
    expect(within(region).getByText("N/A")).toBeInTheDocument();
  });
});
