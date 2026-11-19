import { Armchair, CalendarClock, ClipboardCheck, UserRoundPlus, UserRoundX, type LucideIcon } from "lucide-react";
import type { AttentionKind } from "../types";

/** The words and links of the school's dashboard, kept here so they can be tested one by one. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type AttentionTone = "danger" | "warning" | "info";

interface Attention {
  text: string;
  /** Where it is dealt with; null when the person cannot open that page. */
  to: string | null;
  tone: AttentionTone;
}

/**
 * One line of "Needs your attention". Only the people who run the school (`manages`) can open the attendance and class pages; the leaves
 * are open to the accountant too (the API decides what they may do there).
 */
export function attentionItem(kind: AttentionKind, count: number, manages: boolean): Attention {
  const one = count === 1;
  switch (kind) {
    case "teachers_absent":
      return { text: `${count} ${one ? "teacher is" : "teachers are"} absent today`, to: manages ? "/attendance/teachers" : null, tone: "danger" };
    case "attendance_pending":
      return { text: `${count} ${one ? "class has" : "classes have"} not taken today's attendance`, to: manages ? "/attendance/students" : null, tone: "warning" };
    case "leave_pending":
      return { text: `${count} leave ${one ? "request is" : "requests are"} waiting for an answer`, to: "/leaves", tone: "info" };
    case "no_class_teacher":
      return { text: `${count} ${one ? "class has" : "classes have"} no class teacher`, to: manages ? "/school-class" : null, tone: "warning" };
    case "full_sections":
      return { text: `${count} ${one ? "section is" : "sections are"} full`, to: manages ? "/school-class" : null, tone: "info" };
  }
}

const parts = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
};

/** "12 Nov", "20 to 27 Nov", "30 Nov to 2 Dec": a day or a run of days, short. */
export function shortRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  const first = `${a.date} ${MONTHS[a.month - 1].slice(0, 3)}`;
  if (start === end) return first;
  const last = `${b.date} ${MONTHS[b.month - 1].slice(0, 3)}`;
  return a.month === b.month && a.year === b.year ? `${a.date} to ${last}` : `${first} to ${last}`;
}

/** "2026-11" as "Nov" (for an axis) and "November 2026" (for a tooltip). */
export function monthName(month: string): { short: string; full: string } {
  const { year, month: m } = parts(`${month}-01`);
  return { short: MONTHS[m - 1].slice(0, 3), full: `${MONTHS[m - 1]} ${year}` };
}

/** A whole percent of the total; 0 when there is no total. */
export const shareOf = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

/** One thing waiting for the head: the words, where it is dealt with (null when this person cannot open that page), how loud, its icon. */
export interface AttentionRow extends Attention {
  key: string;
  icon: LucideIcon;
}

const ICONS: Record<AttentionKind, LucideIcon> = {
  teachers_absent: UserRoundX,
  attendance_pending: ClipboardCheck,
  leave_pending: CalendarClock,
  no_class_teacher: UserRoundPlus,
  full_sections: Armchair,
};

/**
 * What waits for the head, in the order the server sent (most urgent first), and, first of all, what a new school has not done yet (no
 * student, no teacher). Every line is a sentence with its icon, so it never depends on colour alone.
 */
export function attentionRows(
  attention: { kind: AttentionKind; count: number }[],
  { students, teachers, manages }: { students: number; teachers: number; manages: boolean },
): AttentionRow[] {
  const starters: AttentionRow[] = [];
  if (students === 0) starters.push({ key: "first-student", text: "Add your first student", to: manages ? "/school/students/new" : null, tone: "info", icon: UserRoundPlus });
  if (teachers === 0) starters.push({ key: "first-teacher", text: "Add your teachers", to: manages ? "/teachers" : null, tone: "info", icon: UserRoundPlus });
  return [...starters, ...attention.map((a) => ({ key: a.kind, ...attentionItem(a.kind, a.count, manages), icon: ICONS[a.kind] }))];
}
