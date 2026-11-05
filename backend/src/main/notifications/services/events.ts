import type { Types } from "mongoose";
import { Audience, type UnitRef } from "./audience";
import { NotificationService, type Message } from "./notification.service";

/**
 * What each happening says, and to whom (docs/notifications.md). Every function here returns at once: the people are looked up and told
 * after the action's answer has gone (NotificationService.later). The people who run the school hear of everything; the one who did it
 * hears nothing of it.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-04" -> "4 Nov". */
export const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
/** "8 Nov", or "8 Nov to 10 Nov". */
export const dayRange = (from: string, to: string) => (to && to !== from ? `${shortDay(from)} to ${shortDay(to)}` : shortDay(from));
const joined = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim() !== "").join(" · ");

/** A class's (or section's) work page, on one of its tabs. */
export function classWorkLink(unit: UnitRef, tab?: "attendance" | "diary" | "tests") {
  const query = [unit.sectionId ? `section=${unit.sectionId}` : null, tab ? `tab=${tab}` : null].filter(Boolean).join("&");
  return `/class-work/${unit.classId}${query ? `?${query}` : ""}`;
}
const childLink = (childId: string) => `/my-children/${childId}`;

type Unit = UnitRef & { label: string };
type UnitWithYear = Unit & { yearId: Types.ObjectId };

/** One message per child for that child's parents. */
function toParents(children: { id: string; parents: string[] }[], words: (childId: string) => Omit<Message, "to" | "childId" | "link">): Message[] {
  return children.filter((c) => c.parents.length > 0).map((c) => ({ ...words(c.id), to: c.parents, childId: c.id, link: childLink(c.id) }));
}

// ---- Leave ---------------------------------------------------------------------------------------------------------------------------

interface LeaveFacts {
  student: { id: string; name: string };
  label: string;
  fromDate: string;
  toDate: string;
  reason: string;
  note?: string | null;
}

export const Notify = {
  /** A parent asked for leave: the class teacher (who answers it) and the school. */
  leaveApplied(tenantId: string, actorId: string, leave: LeaveFacts, unit: UnitRef | null) {
    NotificationService.later(tenantId, actorId, async () => {
      const words = { kind: "leave.applied" as const, title: `Leave request: ${leave.student.name}`, body: joined(leave.label, dayRange(leave.fromDate, leave.toDate), leave.reason), link: "/leaves" };
      return [{ ...words, to: unit ? await Audience.classTeachersOf(tenantId, unit) : [] }, { ...words, to: "admins" }];
    });
  },

  /** A parent took back a leave still waiting. */
  leaveCancelled(tenantId: string, actorId: string, leave: LeaveFacts, unit: UnitRef | null) {
    NotificationService.later(tenantId, actorId, async () => {
      const words = { kind: "leave.cancelled" as const, title: `Leave taken back: ${leave.student.name}`, body: joined(leave.label, dayRange(leave.fromDate, leave.toDate)), link: "/leaves" };
      return [{ ...words, to: unit ? await Audience.classTeachersOf(tenantId, unit) : [] }, { ...words, to: "admins" }];
    });
  },

  /** A leave was answered: the child's parents, then the class teacher and the school (whoever of them did not answer it). */
  leaveDecided(tenantId: string, actorId: string, leave: LeaveFacts, unit: UnitRef | null, status: "approved" | "declined", decider: string) {
    NotificationService.later(tenantId, actorId, async () => {
      const parents = await Audience.parentsOf(tenantId, [leave.student.id]);
      const range = dayRange(leave.fromDate, leave.toDate);
      const staff = { kind: "leave.decided" as const, title: `${decider} ${status} ${leave.student.name}'s leave`, body: joined(leave.label, range), link: "/leaves" };
      return [
        ...toParents([{ id: leave.student.id, parents: parents.get(leave.student.id) ?? [] }], () => ({
          kind: "leave.decided",
          title: `Leave ${status}: ${leave.student.name}`,
          body: joined(range, `by ${decider}`, leave.note),
        })),
        { ...staff, to: unit ? await Audience.classTeachersOf(tenantId, unit) : [] },
        { ...staff, to: "admins" },
      ];
    });
  },

  // ---- Attendance --------------------------------------------------------------------------------------------------------------------

  /**
   * A day's attendance was saved: the class teacher and the school get the counts; a parent hears when their child was marked absent or
   * late (only when that mark is new, so saving the day again says nothing more).
   */
  attendanceSaved(
    tenantId: string,
    actorId: string,
    facts: { unit: Unit; date: string; counts: { present: number; absent: number; late: number; leave: number }; by: string; marked: { id: string; name: string; status: "absent" | "late" }[] }
  ) {
    NotificationService.later(tenantId, actorId, async () => {
      const { unit, date, counts } = facts;
      const parents = await Audience.parentsOf(tenantId, facts.marked.map((m) => m.id));
      const nameOf = new Map(facts.marked.map((m) => [m.id, m]));
      const staff = {
        kind: "attendance.saved" as const,
        title: `Attendance of ${unit.label}`,
        body: joined(shortDay(date), `${counts.present} present, ${counts.absent} absent, ${counts.late} late, ${counts.leave} on leave`, `by ${facts.by}`),
        link: classWorkLink(unit, "attendance"),
      };
      return [
        ...toParents(
          facts.marked.map((m) => ({ id: m.id, parents: parents.get(m.id) ?? [] })),
          (id) => {
            const child = nameOf.get(id)!;
            return { kind: "attendance.saved", title: child.status === "absent" ? `${child.name} was absent` : `${child.name} came late`, body: joined(shortDay(date), unit.label) };
          }
        ),
        { ...staff, to: await Audience.classTeachersOf(tenantId, unit) },
        { ...staff, to: "admins" },
      ];
    });
  },

  // ---- Diary and tests ---------------------------------------------------------------------------------------------------------------

  /** A subject's diary of a day was written or changed: the class's parents (the homework first) and the school. */
  diarySaved(tenantId: string, actorId: string, facts: { unit: UnitWithYear; date: string; subjectName: string; taught: string; homework: string; by: string }) {
    NotificationService.later(tenantId, actorId, async () => {
      const { unit, subjectName } = facts;
      const children = await Audience.parentsOfUnit(tenantId, unit);
      const forParents = facts.homework ? { title: `Homework in ${subjectName}`, body: facts.homework } : { title: `Taught in ${subjectName} today`, body: facts.taught };
      return [
        ...toParents(children, () => ({ kind: "diary.saved", ...forParents })),
        { kind: "diary.saved", title: `${subjectName} diary of ${unit.label}`, body: joined(shortDay(facts.date), `by ${facts.by}`), link: classWorkLink(unit, "diary"), to: "admins" },
      ];
    });
  },

  /** A test was set: the class's parents and the school. */
  testAdded(tenantId: string, actorId: string, facts: { unit: UnitWithYear; subjectName: string; date: string; topic: string; maxMarks: number; by: string }) {
    NotificationService.later(tenantId, actorId, async () => {
      const { unit, subjectName } = facts;
      const children = await Audience.parentsOfUnit(tenantId, unit);
      return [
        ...toParents(children, () => ({ kind: "test.added", title: `${subjectName} test on ${shortDay(facts.date)}`, body: joined(facts.topic, `out of ${facts.maxMarks}`) })),
        { kind: "test.added", title: `${subjectName} test for ${unit.label}`, body: joined(shortDay(facts.date), facts.topic, `by ${facts.by}`), link: classWorkLink(unit, "tests"), to: "admins" },
      ];
    });
  },

  /** A test was taken off: the class's parents and the school. */
  testRemoved(tenantId: string, actorId: string, facts: { unit: UnitWithYear; subjectName: string; date: string; topic: string }) {
    NotificationService.later(tenantId, actorId, async () => {
      const { unit, subjectName } = facts;
      const children = await Audience.parentsOfUnit(tenantId, unit);
      return [
        ...toParents(children, () => ({ kind: "test.removed", title: `${subjectName} test on ${shortDay(facts.date)} is taken off`, body: facts.topic })),
        { kind: "test.removed", title: `${subjectName} test of ${unit.label} taken off`, body: joined(shortDay(facts.date), facts.topic), link: classWorkLink(unit, "tests"), to: "admins" },
      ];
    });
  },

  /** Marks were entered: the parents of the children whose marks are new or changed, and the school. */
  marksSaved(
    tenantId: string,
    actorId: string,
    facts: { unit: Unit; subjectName: string; date: string; topic: string; maxMarks: number; average: number | null; by: string; changed: { id: string; name: string; marks: number | null; absent: boolean }[] }
  ) {
    NotificationService.later(tenantId, actorId, async () => {
      const { unit, subjectName } = facts;
      const parents = await Audience.parentsOf(tenantId, facts.changed.map((c) => c.id));
      const byId = new Map(facts.changed.map((c) => [c.id, c]));
      return [
        ...toParents(
          facts.changed.map((c) => ({ id: c.id, parents: parents.get(c.id) ?? [] })),
          (id) => {
            const c = byId.get(id)!;
            return {
              kind: "marks.saved",
              title: c.absent ? `${c.name} was absent for the ${subjectName} test` : `${c.name}: ${c.marks} / ${facts.maxMarks} in ${subjectName}`,
              body: joined(facts.topic, shortDay(facts.date)),
            };
          }
        ),
        {
          kind: "marks.saved",
          title: `Marks of ${subjectName}: ${facts.topic}`,
          body: joined(unit.label, facts.average === null ? null : `average ${facts.average}%`, `by ${facts.by}`),
          link: classWorkLink(unit, "tests"),
          to: "admins",
        },
      ];
    });
  },

  // ---- The calendar ------------------------------------------------------------------------------------------------------------------

  /** A holiday or an event was put on, changed or taken off the calendar: everyone of the school. */
  calendar(tenantId: string, actorId: string, change: "added" | "changed" | "removed", event: { title: string; kind: "holiday" | "event"; startDate: string; endDate: string; note: string | null }) {
    NotificationService.later(tenantId, actorId, async () => {
      const what = event.kind === "holiday" ? "Holiday" : "Event";
      const title = change === "added" ? `${what}: ${event.title}` : change === "changed" ? `${what} changed: ${event.title}` : `Taken off the calendar: ${event.title}`;
      return [{ kind: `calendar.${change}`, title, body: joined(dayRange(event.startDate, event.endDate), change === "removed" ? null : event.note), link: "/calendar", to: await Audience.everyone(tenantId) }];
    });
  },

  // ---- A teacher's classes -----------------------------------------------------------------------------------------------------------

  /** The class teacher of a class or section changed: the new one, the one before, and the school. */
  classTeacherChanged(tenantId: string, actorId: string, unit: Unit, now: { id: string; name: string } | null, before: string | null) {
    if ((now?.id ?? null) === before) return;
    NotificationService.later(tenantId, actorId, async () => {
      const [mine, theirs] = await Promise.all([Audience.teacherLogins(tenantId, [now?.id]), Audience.teacherLogins(tenantId, [before])]);
      return [
        { kind: "class.assigned", title: `You are the class teacher of ${unit.label}`, link: classWorkLink(unit), to: mine },
        { kind: "class.assigned", title: `You are no longer the class teacher of ${unit.label}`, link: "/dashboard", to: theirs },
        { kind: "class.assigned", title: now ? `${now.name} is the class teacher of ${unit.label}` : `${unit.label} has no class teacher now`, link: null, to: "admins" },
      ];
    });
  },

  /** The teacher of a subject of a class or section changed: the new one, the one before, and the school. */
  subjectTeacherChanged(tenantId: string, actorId: string, facts: { unit: Unit; subjectName: string; now: { id: string; name: string } | null; before: string | null }) {
    const { unit, subjectName, now, before } = facts;
    if ((now?.id ?? null) === before) return;
    NotificationService.later(tenantId, actorId, async () => {
      const [mine, theirs] = await Promise.all([Audience.teacherLogins(tenantId, [now?.id]), Audience.teacherLogins(tenantId, [before])]);
      return [
        { kind: "subject.assigned", title: `You teach ${subjectName} in ${unit.label}`, link: classWorkLink(unit, "diary"), to: mine },
        { kind: "subject.assigned", title: `You no longer teach ${subjectName} in ${unit.label}`, link: "/dashboard", to: theirs },
        { kind: "subject.assigned", title: now ? `${now.name} teaches ${subjectName} in ${unit.label}` : `${subjectName} of ${unit.label} has no teacher now`, link: null, to: "admins" },
      ];
    });
  },
};
