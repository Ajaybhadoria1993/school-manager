import type { BoardEntry } from "@/types";

/** Choices in the onboarding form. These must match backend/src/main/tenants/constants.ts (the server validates). */
export const SCHOOL_TYPES = ["Private", "Government", "Government Aided", "Trust / Society", "Other"] as const;
export const BOARDS = ["CBSE", "ICSE", "State Board", "IB", "Other"] as const;
/** Choosing this board asks which state board. */
export const STATE_BOARD_CHOICE = "State Board";
/** The most boards one school can list. */
export const MAX_BOARDS = 6;
export const STATE_BOARDS = [
  "Andhra Pradesh Board",
  "Assam Board",
  "Bihar Board",
  "Chhattisgarh Board",
  "Goa Board",
  "Gujarat Board",
  "Haryana Board",
  "Himachal Pradesh Board",
  "Jammu & Kashmir Board",
  "Jharkhand Board",
  "Karnataka Board",
  "Kerala Board",
  "M.P. Board",
  "Maharashtra Board",
  "Odisha Board",
  "Punjab Board",
  "Rajasthan Board",
  "Tamil Nadu Board",
  "Telangana Board",
  "U.P. Board",
  "Uttarakhand Board",
  "West Bengal Board",
  "Other state board",
] as const;
/** The 28 states and 8 union territories, for the address form. */
export const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;
/** Choosing "Other" for the board or the role asks the school to write it in. */
export const OTHER_CHOICE = "Other";
export const DESIGNATIONS = ["Owner", "Chairman", "Director", "Principal", "Trustee", "Administrator", "Other"] as const;
export const MEDIUMS = ["English", "Hindi", "Regional"] as const;
export const CLASS_LEVELS = [
  "Pre-Nursery",
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const STEP_TITLES = ["School details", "Address and contact", "About you", "Review and submit"] as const;
export const STEP_SUBTITLES = [
  "The basics about your school",
  "Where the school is and how to reach it",
  "Who is registering this school",
  "Check everything, then send it to us",
] as const;

/** The stepper above the form: the four things to fill in, then the platform team's check. */
export const STEPPER_LABELS = ["School Details", "Address & Contact", "Your Profile", "Review & Submit", "Verification"] as const;

/** The headline in the side panel changes with the step, like a guide walking you through. */
export const STAGE_COPY = [
  { lead: "Let's set up", accent: "your school", text: "Tell us what it is, which boards it follows and in which medium, which classes it runs and how big it is." },
  { lead: "Where can we", accent: "find you?", text: "Your address and contact details help us verify that the school is real." },
  { lead: "Tell us about", accent: "yourself", text: "Who is registering the school, and how our team can reach you." },
  { lead: "You're almost", accent: "there", text: "Check everything once, then send it to our team for approval." },
  { lead: "We're reviewing", accent: "your school", text: "A person on our team checks every school. Your dashboard opens as soon as it is approved." },
] as const;

/** What to call a board: a state board goes by its own name ("M.P. Board"), an "Other" board by what the school wrote. */
export function boardLabel(entry: Pick<BoardEntry, "board" | "stateBoard" | "otherBoard">): string {
  if (entry.board === STATE_BOARD_CHOICE && entry.stateBoard) return entry.stateBoard;
  if (entry.board === OTHER_CHOICE && entry.otherBoard) return entry.otherBoard;
  return entry.board;
}

/** "CBSE (English); M.P. Board (English, Hindi)": every board with the medium(s) it is taught in. */
export function formatBoards(entries: readonly BoardEntry[]): string {
  return entries.map((entry) => `${boardLabel(entry)} (${entry.mediums.join(", ")})`).join("; ");
}

/** "Nursery to 12", or just "5" for a school that runs one class; "" until both ends are chosen. */
export function formatClassRange(from: string | null, to: string | null): string {
  if (!from || !to) return "";
  return from === to ? from : `${from} to ${to}`;
}

/** "CBSE: 2130456; M.P. Board: MP/1234": the boards that have an affiliation number, "" when none do. */
export function formatAffiliations(entries: readonly BoardEntry[]): string {
  return entries
    .filter((entry) => entry.affiliationNumber)
    .map((entry) => `${boardLabel(entry)}: ${entry.affiliationNumber}`)
    .join("; ");
}

/** A person's role as they gave it: the listed one, or what they wrote in for "Other". */
export function designationLabel(designation: string | null, other: string): string {
  return designation === OTHER_CHOICE && other ? other : (designation ?? "");
}

/** "+91 98765 43210" from the ten digits we keep; anything else (an older entry) is shown as it was typed. */
export function formatPhone(national: string): string {
  return /^\d{10}$/.test(national) ? `+91 ${national.slice(0, 5)} ${national.slice(5)}` : national;
}
