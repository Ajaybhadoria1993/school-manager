import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ClassItem } from "../../types";
import { useClassDraft, type DraftSaver } from "../useClassDraft";

const klass = (capacity: number | null, sections: [string, number | null][] = []): ClassItem => ({
  id: "c1",
  name: "Class 5",
  order: 1,
  departmentId: null,
  capacity,
  sections: sections.map(([name, seats]) => ({ id: `s-${name}`, classId: "c1", name, capacity: seats, room: "Room 1" })),
});

function open(item: ClassItem) {
  const calls: string[] = [];
  const saver: DraftSaver = {
    saveClass: vi.fn(async (changes) => {
      calls.push(`class ${JSON.stringify(changes)}`);
    }),
    saveSection: vi.fn(async (section, changes) => {
      calls.push(`section ${section.name} ${JSON.stringify(changes)}`);
    }),
  };
  const view = renderHook(() => useClassDraft(item, false));
  return { ...view, saver, calls, draft: () => view.result.current };
}

describe("the class's seats in the one Save", () => {
  it("shows the saved seats, and typing them is a change until they are typed back", () => {
    const { draft } = open(klass(120));
    expect(draft().classSeats).toBe("120");
    expect(draft().dirty).toBe(false);

    act(() => draft().changeClassSeats("150"));
    expect(draft().classSeats).toBe("150");
    expect(draft().classSeatsDirty).toBe(true);
    expect(draft().dirty).toBe(true);

    act(() => draft().changeClassSeats("120"));
    expect(draft().dirty).toBe(false);
  });

  it("sends the seats alone when only they changed, and the name with them when both changed, in one request", async () => {
    const seatsOnly = open(klass(120));
    act(() => seatsOnly.draft().changeClassSeats("150"));
    await act(() => seatsOnly.draft().save(seatsOnly.saver));
    expect(seatsOnly.calls).toEqual(['class {"capacity":150}']);

    const both = open(klass(120));
    act(() => both.draft().changeClassName("  Class  Five "));
    act(() => both.draft().changeClassSeats("150"));
    await act(() => both.draft().save(both.saver));
    expect(both.calls).toEqual(['class {"name":"Class Five","capacity":150}']);
  });

  it("will not save empty or wrong seats, says why under the box, and sends nothing", async () => {
    const { draft, saver } = open(klass(120));
    act(() => draft().changeClassSeats(""));
    await act(() => draft().save(saver));
    expect(draft().classSeatsProblem).toBe("Enter the seats of the class.");
    expect(saver.saveClass).not.toHaveBeenCalled();

    act(() => draft().changeClassSeats("12.5"));
    expect(draft().classSeatsProblem).toBeUndefined();
    await act(() => draft().save(saver));
    expect(draft().classSeatsProblem).toMatch(/whole number from 1 to 2000/);
    expect(saver.saveClass).not.toHaveBeenCalled();
  });

  it("lets a class that has no seats yet be renamed without asking for them, while the box stays empty", async () => {
    const { draft, saver, calls } = open(klass(null));
    expect(draft().classSeats).toBe("");
    act(() => draft().changeClassName("Class Five"));
    await act(() => draft().save(saver));
    expect(calls).toEqual(['class {"name":"Class Five"}']);
    expect(draft().classSeatsProblem).toBeUndefined();
  });

  it("will not save sections that would hold more than the class has (the server says the same)", async () => {
    const { draft, saver } = open(klass(100, [["A", 40], ["B", 40]]));
    act(() => draft().changeSection(section("A"), "seats", "70"));
    await act(() => draft().save(saver));
    expect(draft().classSeatsProblem).toBe("The sections would hold 110 seats, more than the class's 100. Raise the class's seats or lower the sections'.");
    expect(saver.saveSection).not.toHaveBeenCalled();
  });

  it("accepts sections and a class that change together when they fit in the end", async () => {
    const { draft, saver, calls } = open(klass(100, [["A", 40], ["B", 40]]));
    act(() => draft().changeClassSeats("150"));
    act(() => draft().changeSection(section("A"), "seats", "70"));
    await act(() => draft().save(saver));
    expect(draft().classSeatsProblem).toBeUndefined();
    // Seats go up, so the class is made bigger before its sections are.
    expect(calls).toEqual(['class {"capacity":150}', 'section A {"capacity":70}']);
  });

  it("makes the sections smaller before the class when the class's seats are lowered", async () => {
    const { draft, saver, calls } = open(klass(100, [["A", 40], ["B", 40]]));
    act(() => draft().changeClassSeats("60"));
    act(() => draft().changeSection(section("A"), "seats", "30"));
    act(() => draft().changeSection(section("B"), "seats", "30"));
    await act(() => draft().save(saver));
    expect(calls).toEqual(['section A {"capacity":30}', 'section B {"capacity":30}', 'class {"capacity":60}']);
  });

  it("keeps what the server refused typed, with its reason under the seats box", async () => {
    const { draft, saver } = open(klass(100));
    vi.mocked(saver.saveClass).mockResolvedValueOnce({ capacity: "At least 80 seats, as its sections hold" });
    act(() => draft().changeClassSeats("70"));
    await act(() => draft().save(saver));
    expect(draft().classSeatsProblem).toBe("At least 80 seats, as its sections hold");
    expect(draft().classSeats).toBe("70");
    expect(draft().dirty).toBe(true);
  });
});

/** A section as the class screen holds it: only its id matters to the draft when a box is typed in. */
const section = (name: string) => ({ id: `s-${name}`, classId: "c1", name, capacity: null, room: null });
