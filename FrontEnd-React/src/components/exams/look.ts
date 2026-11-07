import type { ExamStatus } from "../../types";

/** How an exam's status is worded and coloured, on the list and on its own page. */
export const STATUS_LOOK: Record<ExamStatus, { label: string; tone: "success" | "primary" | "neutral" }> = {
  running: { label: "Running", tone: "success" },
  upcoming: { label: "Upcoming", tone: "primary" },
  over: { label: "Over", tone: "neutral" },
};

/** "12 papers", "1 paper", "No timetable yet". */
export const papersText = (n: number) => (n === 0 ? "No timetable yet" : `${n} ${n === 1 ? "paper" : "papers"}`);
/** "8 classes", "1 class". */
export const classesText = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;
