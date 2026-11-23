import type { AttendanceStatus } from "../../types";

/** The four marks: a short letter on the button (the full word is for a screen reader and the tooltip) and the solid colour it takes when lit. */
export const MARKS: { value: AttendanceStatus; letter: string; label: string; on: string; dot: string }[] = [
  { value: "present", letter: "P", label: "Present", on: "border-success bg-success text-white", dot: "bg-success" },
  { value: "absent", letter: "A", label: "Absent", on: "border-danger bg-danger text-white", dot: "bg-danger" },
  { value: "late", letter: "L", label: "Late", on: "border-warning bg-warning text-white", dot: "bg-warning" },
  { value: "leave", letter: "Lv", label: "Leave", on: "border-info bg-info text-white", dot: "bg-info" },
];

/** The summary's lines, in the order of the ring. */
export const SUMMARY_LINES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "On leave" },
];

/** "2026-11-15" is a Sunday: a day nobody took then says there is no school. */
export const isSunday = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay() === 0;
