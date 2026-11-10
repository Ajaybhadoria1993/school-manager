import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { useStudentForm } from "../../../../hooks/useStudentForm";
import type { AcademicStructure, ClassItem, StudentCapacity } from "../../../../types";
import { emptyStudentForm } from "../../../../utils/students";
import { PlacementFields } from "../PlacementFields";

const klass = (id: string, name: string, order: number, sections: string[] = []): ClassItem => ({
  id,
  name,
  order,
  departmentId: null,
  capacity: null,
  sections: sections.map((s) => ({ id: `${id}-${s}`, classId: id, name: s, capacity: 40, room: null })),
});
const structure = (classes: ClassItem[]): AcademicStructure => ({
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes,
  totals: { departments: 0, classes: classes.length, sections: 0, seats: 0 },
});
/** Class 10, then Class 11 and 12 in two streams each (Science has sections A and B), and Class 11 as a whole from before. */
const SENIOR = structure([
  klass("c10", "Class 10", 10),
  klass("c11", "Class 11", 11),
  klass("c11s", "Class 11 Science", 12, ["A", "B"]),
  klass("c11c", "Class 11 Commerce", 13),
  klass("c12s", "Class 12 Science", 14),
  klass("c12c", "Class 12 Commerce", 15),
]);
const CAPACITY: StudentCapacity = { academicYear: { id: "y1", name: "2026-2027" }, sections: [], classes: [], totals: { students: 0, seats: 0, seatsLeft: 0, fullSections: 0 } };

/** The class part of Add student with a real form behind it; the form's class is shown under it. */
function Placement({ classes = SENIOR, classId = "" }: { classes?: AcademicStructure; classId?: string }) {
  const form = useStudentForm({ ...emptyStudentForm(), classId }, { mode: "admit", classHasSections: () => false });
  return (
    <MemoryRouter>
      <PlacementFields form={form} structure={classes} capacity={CAPACITY} onPickFull={() => {}} />
      <output aria-label="the class of the form">{form.values.classId || "none"}</output>
      <button type="button" onClick={() => form.touch("classId")}>
        check
      </button>
    </MemoryRouter>
  );
}
const chosen = () => screen.getByLabelText("the class of the form").textContent;

describe("Class 11 and 12 ask for the stream (a student is never put in the class as a whole)", () => {
  it("shows Class 11 and Class 12 once each among the classes, never a stream's class or Class 11 as a whole as a chip of its own", () => {
    render(<Placement />);
    const classes = within(screen.getByRole("radiogroup", { name: "Class" }));
    expect(classes.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Class 10", "Class 11", "Class 12"]);
    expect(screen.queryByRole("radiogroup", { name: /^Stream/ })).not.toBeInTheDocument();
  });

  it("picking Class 11 asks for the stream and chooses no class yet; picking a stream chooses that stream's class and shows its sections", async () => {
    const user = userEvent.setup();
    render(<Placement />);
    await user.click(screen.getByRole("radio", { name: "Class 11" }));
    expect(chosen()).toBe("none");
    const streams = screen.getByRole("radiogroup", { name: "Stream of Class 11" });
    expect(within(streams).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Class 11 Science", "Class 11 Commerce"]);
    expect(within(streams).getByText("Science")).toBeInTheDocument();
    expect(screen.getByText("Pick the stream to see its sections.")).toBeInTheDocument();

    await user.click(within(streams).getByRole("radio", { name: "Class 11 Science" }));
    expect(chosen()).toBe("c11s");
    expect(screen.getByRole("radio", { name: "Class 11" })).toBeChecked();
    // The stream's own sections.
    expect(within(screen.getByRole("radiogroup", { name: "Section of Class 11 Science" })).getAllByRole("radio")).toHaveLength(2);
  });

  it("a stream without sections is a class on its own; going to Class 10 takes the stream away, and to Class 12 asks again", async () => {
    const user = userEvent.setup();
    render(<Placement />);
    await user.click(screen.getByRole("radio", { name: "Class 11" }));
    await user.click(screen.getByRole("radio", { name: "Class 11 Commerce" }));
    expect(chosen()).toBe("c11c");

    await user.click(screen.getByRole("radio", { name: "Class 12" }));
    expect(chosen()).toBe("none");
    expect(screen.getByRole("radiogroup", { name: "Stream of Class 12" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Stream of Class 11" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Class 10" }));
    expect(chosen()).toBe("c10");
    expect(screen.queryByRole("radiogroup", { name: /^Stream/ })).not.toBeInTheDocument();
  });

  it("a student already in a stream shows Class 12 and that stream picked", () => {
    render(<Placement classId="c12c" />);
    expect(screen.getByRole("radio", { name: "Class 12" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Class 12 Commerce" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Class 12 Science" })).not.toBeChecked();
  });

  it("says Choose the stream, not Choose the class, when only the stream is missing", async () => {
    const user = userEvent.setup();
    render(<Placement />);
    await user.click(screen.getByRole("radio", { name: "Class 12" }));
    await user.click(screen.getByRole("button", { name: "check" }));
    expect(screen.getByText("Choose the stream")).toBeInTheDocument();
    expect(screen.queryByText("Choose the class")).not.toBeInTheDocument();
  });

  it("a school that has no stream of Class 12 yet says so, with the way to add them; Class 12 as a whole cannot be picked", async () => {
    const user = userEvent.setup();
    render(<Placement classes={structure([klass("c10", "Class 10", 10), klass("c12", "Class 12", 12)])} />);
    await user.click(screen.getByRole("radio", { name: "Class 12" }));
    expect(chosen()).toBe("none");
    expect(screen.queryByRole("radiogroup", { name: "Stream of Class 12" })).not.toBeInTheDocument();
    expect(screen.getByText(/Class 12 has no streams yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add them in Classes & Sections" })).toHaveAttribute("href", "/school/classes");
  });

  it("a class that is not 11 or 12 is picked as it always was", async () => {
    const user = userEvent.setup();
    render(<Placement classes={structure([klass("c5", "Class 5", 5, ["A"]), klass("nur", "Nursery", 1)])} />);
    await user.click(screen.getByRole("radio", { name: "Nursery" }));
    expect(chosen()).toBe("nur");
    await user.click(screen.getByRole("radio", { name: "Class 5" }));
    expect(chosen()).toBe("c5");
    expect(screen.queryByRole("radiogroup", { name: /^Stream/ })).not.toBeInTheDocument();
  });
});
