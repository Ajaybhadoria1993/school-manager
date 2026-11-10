import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, CircleCheck, FolderTree, Hash, Info, Users, Wand2 } from "lucide-react";
import { MAX_ROLL_NUMBER } from "../../../constants/students";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { plural } from "../../../utils/academics";
import { classNumber, streamOf } from "../../../utils/classNumber";
import { cn } from "../../../utils/helpers";
import type { AcademicStructure, ClassItem, SectionItem, SectionLoad, StudentCapacity } from "../../../types";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { FormSection } from "./FormSection";

type SeatState = "open" | "almost" | "full" | "unlimited";

/** How full a section is. `own` = the student already sits there (edit): their own seat is not "taken" from them. */
function seatState(load: SectionLoad | undefined, own: boolean): { state: SeatState; enrolled: number; capacity: number | null } {
  const enrolled = load?.enrolled ?? 0;
  const capacity = load?.capacity ?? null;
  if (capacity === null) return { state: "unlimited", enrolled, capacity };
  const others = enrolled - (own ? 1 : 0);
  if (others >= capacity) return { state: "full", enrolled, capacity };
  return { state: enrolled / capacity >= 0.85 ? "almost" : "open", enrolled, capacity };
}

const BADGE: Record<SeatState, { label: string; className: string; bar: string }> = {
  open: { label: "Open", className: "bg-success-soft text-success", bar: "bg-success" },
  almost: { label: "Almost full", className: "bg-warning-soft text-warning", bar: "bg-amber-500" },
  full: { label: "Full", className: "bg-danger-soft text-danger", bar: "bg-danger" },
  unlimited: { label: "No limit", className: "bg-primary-soft text-primary-deep", bar: "bg-primary" },
};

/** "Class 5" is shown as 5 among the school's numbered classes; any other name as it is. */
const shortName = (name: string) => /^class\s*(\d{1,2})$/i.exec(name.trim())?.[1] ?? null;

/** 11 or 12 for a class of the last two years (taught in streams), else null. */
const seniorOf = (c: ClassItem): 11 | 12 | null => {
  const number = classNumber(c.name);
  return number === 11 || number === 12 ? number : null;
};

const PRE_PRIMARY = /^(pre[-\s]?nursery|nursery|play\s?group|pg|lkg|ukg|kg|kg\s?[12]|jr\.?\s?kg|sr\.?\s?kg|pre[-\s]?primary|prep)$/i;

/**
 * The classes in groups with a small title: the school's departments in their order (and "Other classes"), or, for a school without
 * departments, pre-primary and the rest. One group shows no title.
 */
function classGroups(structure: AcademicStructure): { key: string; title: string; classes: ClassItem[] }[] {
  const byDepartment = structure.departments.length > 0 && structure.classes.some((c) => c.departmentId);
  const groups = byDepartment
    ? [
        ...structure.departments.map((d) => ({ key: d.id, title: d.name, classes: structure.classes.filter((c) => c.departmentId === d.id) })),
        { key: "none", title: "Other classes", classes: structure.classes.filter((c) => !c.departmentId || !structure.departments.some((d) => d.id === c.departmentId)) },
      ]
    : [
        { key: "pre", title: "Pre-primary", classes: structure.classes.filter((c) => PRE_PRIMARY.test(c.name.trim())) },
        { key: "school", title: "School", classes: structure.classes.filter((c) => !PRE_PRIMARY.test(c.name.trim())) },
      ];
  const filled = groups.filter((g) => g.classes.length > 0);
  return filled.length === 1 ? [{ ...filled[0], title: "" }] : filled;
}

/**
 * The section cards in one row of a fixed height: when they do not all fit, the row scrolls sideways (arrow keys, a trackpad, the thin
 * bar) and a soft fade at the edge says there is more that way.
 */
function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const look = () => setMore({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    look();
    const observer = new ResizeObserver(look);
    observer.observe(el);
    el.addEventListener("scroll", look, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", look);
    };
  }, []);

  return (
    <div className="relative">
      <div ref={row} role="radiogroup" aria-label={label} className="-mx-0.5 flex h-[5.5rem] items-stretch gap-2.5 overflow-x-auto px-0.5 [scrollbar-width:thin]">
        {children}
      </div>
      {more.left && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" />}
      {more.right && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent" />}
    </div>
  );
}

/** The note that stands where the section cards would be (no class yet), at the same height, so nothing moves when a class is picked. */
const emptyBox = "flex h-[5.5rem] w-full items-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 text-sm text-foreground-muted";

/**
 * Where the student sits this academic year, laid out so that nothing moves while it is filled in:
 *  - the class: chips in the school's groups (Pre-primary / School, or its departments), a numbered class shown as its number;
 *  - the section: one card per section of this year with how full it is (a bar, "25 of 40 seats filled", Open / Almost full / Full);
 *    a full one is dimmed and asks before it is picked; a class without sections shows "No section: joins the whole class";
 *  - the roll number, with the next free one (the one after the highest given) and Auto-assign to take it.
 * A live summary ("Class 6 · Section B · Roll 34") sits at the right of the Class label. The section row has one height in every state.
 */
export function PlacementFields({
  form,
  structure,
  capacity,
  ownSectionId,
  onPickFull,
  index = 0,
}: {
  form: StudentForm;
  structure: AcademicStructure;
  capacity: StudentCapacity | undefined;
  /** On a student's page: the section they already sit in (their own seat is not "taken"). */
  ownSectionId?: string | null;
  /** A full section was pressed: the page asks first, and picks it only on "yes". */
  onPickFull: (section: SectionItem, load: SectionLoad) => void;
  index?: number;
}) {
  const name = useId();
  const { values } = form;
  const klass = structure.classes.find((c) => c.id === values.classId);
  const loads = new Map((capacity?.sections ?? []).map((s) => [s.sectionId, s]));
  const picked = klass?.sections.find((s) => s.id === values.sectionId);

  // Class 11 and 12 are taught in streams, each its own class ("Class 11 Science"): they show as one chip each, and the stream is asked
  // before anything else. The class stays empty until a stream is picked, so a student is never put in "Class 11" as a whole.
  const [asked, setAsked] = useState<11 | 12 | null>(null);
  const seniorNumber = (klass ? seniorOf(klass) : null) ?? asked;
  const streamClasses = seniorNumber ? structure.classes.filter((c) => seniorOf(c) === seniorNumber && streamOf(c.name) !== null) : [];
  const streamMissing = seniorNumber !== null && !values.classId;

  // The next free roll number where the student is going: the picked section's, or the whole class's for a class without sections.
  const nextFree = !klass
    ? null
    : klass.sections.length === 0
      ? (capacity?.classes.find((c) => c.classId === klass.id)?.nextRollNumber ?? 1)
      : picked
        ? (loads.get(picked.id)?.nextRollNumber ?? 1)
        : null;
  const roll = values.rollNumber.trim();
  const rollOk = /^\d+$/.test(roll) && Number(roll) >= 1 && Number(roll) <= MAX_ROLL_NUMBER && !form.errorOf("rollNumber");

  function pickClass(id: string, fromStream = false) {
    if (!fromStream) setAsked(null);
    if (id === values.classId) return;
    form.set("classId", id);
    form.set("sectionId", "");
  }

  function pickSenior(number: 11 | 12) {
    if (seniorNumber === number) return;
    setAsked(number);
    form.set("classId", "");
    form.set("sectionId", "");
  }

  function pickSection(id: string) {
    const section = klass?.sections.find((s) => s.id === id);
    const load = loads.get(id);
    if (section && load && seatState(load, id === ownSectionId).state === "full") onPickFull(section, load);
    else form.set("sectionId", id);
  }

  const pickedSeat = picked ? seatState(loads.get(picked.id), picked.id === ownSectionId) : null;
  const sectionNote = picked && pickedSeat
    ? pickedSeat.capacity === null
      ? `${klass?.name} - ${picked.name}: ${pickedSeat.enrolled} student${pickedSeat.enrolled === 1 ? "" : "s"}, no seat limit.`
      : `${klass?.name} - ${picked.name}: ${pickedSeat.enrolled} of ${pickedSeat.capacity} seats taken${pickedSeat.enrolled >= pickedSeat.capacity && picked.id !== ownSectionId ? " (over the limit, as you chose)" : `, ${Math.max(0, pickedSeat.capacity - pickedSeat.enrolled)} left`}.`
    : klass && klass.sections.length > 0
      ? `${plural(klass.sections.length, "section")} this year. Pick one.`
      : "";

  /** The chips of the groups: a numbered class as its number, Class 11 and 12 once each (their streams are asked next). */
  const seen = new Set<number>();
  const chipsOf = (classes: ClassItem[]) =>
    classes.flatMap((c): ({ kind: "class"; c: ClassItem } | { kind: "senior"; number: 11 | 12 })[] => {
      const number = seniorOf(c);
      if (number === null) return [{ kind: "class", c }];
      if (seen.has(number)) return [];
      seen.add(number);
      return [{ kind: "senior", number }];
    });

  /** One round chip of the class or stream list. */
  const chip = (key: string, label: string, on: boolean, onPick: () => void, opts: { short?: string | null; title?: string; text?: ReactNode; group?: string } = {}) => (
    <label key={key} className="relative block" title={opts.title ?? label}>
      <input type="radio" name={`${name}-${opts.group ?? "class"}`} value={key} checked={on} onChange={onPick} aria-label={label} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex h-10 cursor-pointer select-none items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-all duration-150",
          opts.short ? "min-w-11 px-3" : "px-4",
          "peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
          on ? "border-primary bg-primary text-primary-foreground shadow-card" : "border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card"
        )}
      >
        {on && <Check className="size-3.5" aria-hidden />}
        {opts.short ? (
          <>
            <span className="sr-only">Class </span>
            {opts.short}
          </>
        ) : (
          (opts.text ?? label)
        )}
      </span>
    </label>
  );

  const summary = klass && (
    <p aria-live="polite" className="absolute -top-1 right-0 inline-flex h-7 max-w-[70%] items-center overflow-hidden whitespace-nowrap divide-x divide-emerald-300/70 rounded-full border border-emerald-300/70 bg-success-soft text-xs font-bold text-success">
      <span className="px-2.5">{klass.name}</span>
      {picked && <span className="px-2.5">Section {picked.name}</span>}
      {klass.sections.length === 0 && <span className="px-2.5">Whole class</span>}
      {roll && <span className="px-2.5">Roll {roll}</span>}
    </p>
  );

  return (
    <FormSection
      index={index}
      icon={FolderTree}
      title="Class and section"
      tip="A student has one class (and section) in each academic year. Next year's class is given at promotion; this year's place stays in their history."
    >
      {structure.classes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-background px-4 py-5 text-sm text-foreground-muted">
          Your school has no classes yet.{" "}
          <Link to="/school/classes" className="font-semibold text-primary-deep underline-offset-2 hover:underline">
            Add them in Classes & Sections
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="space-y-5">
          {/* The live summary sits on the label's line, out of the flow, so it never changes the card's height. */}
          <Field id={fieldId("classId")} label="Class" error={streamMissing ? undefined : form.errorOf("classId")} className="relative">
            {summary}
            <div
              id={fieldId("classId")}
              tabIndex={-1}
              role="radiogroup"
              aria-label="Class"
              className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/60 outline-none"
            >
              {classGroups(structure).map((group) => (
                <div key={group.key} className="grid min-w-0 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                  {group.title && <p className="text-[11px] font-bold uppercase tracking-wider text-foreground-muted sm:col-start-1">{group.title}</p>}
                  <div className={cn("flex flex-wrap gap-2", !group.title && "sm:col-span-2")}>
                    {chipsOf(group.classes).map((entry) =>
                      entry.kind === "senior"
                        ? chip(`senior-${entry.number}`, `Class ${entry.number}`, seniorNumber === entry.number, () => pickSenior(entry.number), { short: String(entry.number) })
                        : chip(entry.c.id, entry.c.name, entry.c.id === values.classId, () => pickClass(entry.c.id), { short: shortName(entry.c.name), text: entry.c.name })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Field>

          {seniorNumber !== null && (
            <Field id={fieldId("stream")} label={`Stream of Class ${seniorNumber}`} error={streamMissing && form.errorOf("classId") ? "Choose the stream" : undefined}>
              {streamClasses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-background px-4 py-4 text-sm text-foreground-muted">
                  Class {seniorNumber} has no streams yet.{" "}
                  <Link to="/school/classes" className="font-semibold text-primary-deep underline-offset-2 hover:underline">
                    Add them in Classes & Sections
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <div role="radiogroup" aria-label={`Stream of Class ${seniorNumber}`} className="flex flex-wrap gap-2">
                  {streamClasses.map((c) => chip(c.id, c.name, c.id === values.classId, () => pickClass(c.id, true), { text: streamOf(c.name), group: "stream" }))}
                </div>
              )}
            </Field>
          )}

          {/* The section (one row whose height never changes), then the roll number under it. */}
          <div className="space-y-5">
            <Field
              id={fieldId("sectionId")}
              label={klass ? `Section of ${klass.name}` : "Section"}
              optional={!!klass && klass.sections.length === 0}
              error={form.errorOf("sectionId")}
              hint={<span className="block truncate">{sectionNote || " "}</span>}
              className="relative min-w-0"
            >
              <span className="pointer-events-none absolute right-0 top-0 hidden items-center gap-1 text-[11px] font-semibold text-foreground-muted sm:inline-flex">
                <Info className="size-3" aria-hidden />
                Seats shown live
              </span>
              <div id={fieldId("sectionId")} tabIndex={-1} className="outline-none">
                {!klass ? (
                  <p className={emptyBox}>{seniorNumber !== null ? "Pick the stream to see its sections." : "Pick a class to see its sections."}</p>
                ) : klass.sections.length === 0 ? (
                  <div className="flex h-[5.5rem] w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary-soft/50 px-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-deep">
                      <Users className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">No section</p>
                      <p className="mt-0.5 text-xs text-foreground-muted">{klass.name} has no sections this year: the student joins the whole class.</p>
                    </div>
                    <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
                  </div>
                ) : (
                  <ScrollRow key={klass.id} label={`Section of ${klass.name}`}>
                    {klass.sections.map((s) => {
                      const seat = seatState(loads.get(s.id), s.id === ownSectionId);
                      const badge = BADGE[seat.state];
                      const on = s.id === values.sectionId;
                      const percent = seat.capacity ? Math.min(100, Math.round((seat.enrolled / seat.capacity) * 100)) : 0;
                      return (
                        <label key={s.id} className="relative block w-36 shrink-0">
                          <input type="radio" name={`${name}-section`} value={s.id} checked={on} onChange={() => pickSection(s.id)} className="peer sr-only" />
                          <span
                            className={cn(
                              "flex h-full cursor-pointer select-none flex-col justify-between rounded-xl border px-3.5 py-2.5 transition-all duration-150",
                              "peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
                              on ? "border-primary bg-primary-soft/50 shadow-card ring-1 ring-primary" : "border-border bg-surface hover:border-primary/50 hover:shadow-card",
                              seat.state === "full" && !on && "opacity-60"
                            )}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-lg font-bold leading-none text-foreground">{s.name}</span>
                              {on ? (
                                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white">
                                  <Check className="size-3" aria-hidden />
                                </span>
                              ) : (
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", badge.className)}>{badge.label}</span>
                              )}
                            </span>
                            <span className="text-xs text-foreground-muted">
                              {seat.capacity === null ? `${seat.enrolled} student${seat.enrolled === 1 ? "" : "s"}` : `${seat.enrolled} of ${seat.capacity} seats filled`}
                              {on && <span className="sr-only">, {badge.label}</span>}
                            </span>
                            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                              <span className={cn("block h-full rounded-full", badge.bar)} style={{ width: `${seat.capacity === null ? 100 : percent}%`, opacity: seat.capacity === null ? 0.25 : 1 }} />
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </ScrollRow>
                )}
              </div>
            </Field>

            <Field id={fieldId("rollNumber")} label="Roll number" optional error={form.errorOf("rollNumber")} hint={`1 to ${MAX_ROLL_NUMBER}, once in a section.`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="relative w-full sm:w-56">
                  <Input {...form.bind("rollNumber", "digits")} icon={Hash} inputMode="numeric" maxLength={3} placeholder="For example 12" className="pr-9" />
                  {rollOk && <CircleCheck className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-success" aria-hidden />}
                </div>
                <div className="flex h-12 items-center gap-2">
                <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-semibold text-foreground-muted">
                  Next free: <span className="text-foreground">{nextFree ?? "-"}</span>
                </span>
                <button
                  type="button"
                  disabled={nextFree === null || roll === String(nextFree)}
                  onClick={() => {
                    if (nextFree === null) return;
                    form.set("rollNumber", String(nextFree));
                    form.touch("rollNumber");
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-primary-deep transition-colors hover:border-primary/50 hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-50"
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  Auto-assign
                </button>
                </div>
              </div>
            </Field>
          </div>
        </div>
      )}
    </FormSection>
  );
}
