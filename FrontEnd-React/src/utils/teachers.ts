import { TEACHER_LIMITS } from "../constants/teachers";
import type { EmploymentType, Teacher, TeacherGender, TeacherInput } from "../types";
import { ageOn, todayInIndia } from "./students";
import { isEmail, isIndianMobile, isPasswordValid, isUsername } from "./validators";

export { isUsername };

/**
 * The boxes of Add teacher and Change teacher, and the rules they follow. The server has the last word and says the same things;
 * these are the same words so a box is marked before anything is sent.
 */

export type TeacherStepKey = "personal" | "job" | "teaching" | "login";

export const TEACHER_STEPS: { key: TeacherStepKey; label: string }[] = [
  { key: "personal", label: "Personal info" },
  { key: "job", label: "Job details" },
  { key: "teaching", label: "Teaching" },
  { key: "login", label: "Login" },
];

/** Every box of the form, flat. A box the server points at by a path (`address.pincode`) is found by `formKeyOfPath`. */
export interface TeacherFormValues {
  name: string;
  gender: TeacherGender | "";
  dateOfBirth: string;
  mobile: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  employeeCode: string;
  designation: string;
  qualification: string;
  experienceYears: string;
  joiningDate: string;
  employmentType: EmploymentType | "";
  subjectIds: string[];
  maxPeriodsPerDay: string;
  maxPeriodsPerWeek: string;
  offDays: number[];
  username: string;
  password: string;
}
export type TeacherFormKey = keyof TeacherFormValues;
export type TeacherProblems = Partial<Record<TeacherFormKey, string>>;

export const emptyTeacherForm = (): TeacherFormValues => ({
  name: "",
  gender: "",
  dateOfBirth: "",
  mobile: "",
  email: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
  employeeCode: "",
  designation: "",
  qualification: "",
  experienceYears: "",
  joiningDate: "",
  employmentType: "",
  subjectIds: [],
  maxPeriodsPerDay: "",
  maxPeriodsPerWeek: "",
  offDays: [],
  username: "",
  password: "",
});

const STEP_OF: Record<TeacherFormKey, TeacherStepKey> = {
  name: "personal",
  gender: "personal",
  dateOfBirth: "personal",
  mobile: "personal",
  email: "personal",
  addressLine1: "personal",
  city: "personal",
  state: "personal",
  pincode: "personal",
  employeeCode: "job",
  designation: "job",
  qualification: "job",
  experienceYears: "job",
  joiningDate: "job",
  employmentType: "job",
  subjectIds: "teaching",
  maxPeriodsPerDay: "teaching",
  maxPeriodsPerWeek: "teaching",
  offDays: "teaching",
  username: "login",
  password: "login",
};
const ORDER = Object.keys(STEP_OF) as TeacherFormKey[];

export const stepOfKey = (key: TeacherFormKey): TeacherStepKey => STEP_OF[key];

/** The boxes with something wrong on this step, in the order they are on the page. */
export const problemKeysOf = (problems: TeacherProblems, step: TeacherStepKey): TeacherFormKey[] => ORDER.filter((key) => STEP_OF[key] === step && problems[key] !== undefined);

/** The box a server message points at (`details[].path`), or null when it is none of this form's. */
export function formKeyOfPath(path: string): TeacherFormKey | null {
  const head = path.split(".")[0];
  const named: Record<string, TeacherFormKey> = {
    "address.line1": "addressLine1",
    "address.city": "city",
    "address.state": "state",
    "address.pincode": "pincode",
    "login.username": "username",
    "login.password": "password",
  };
  if (named[path]) return named[path];
  return head in STEP_OF ? (head as TeacherFormKey) : null;
}

// ---- The words (the server's, so a box says the same before and after it is sent) ----------------------------------------------------

export const MESSAGES = {
  name: "Enter the teacher's name",
  gender: "Choose the gender",
  mobile: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9",
  email: "Enter a valid email address",
  dateOfBirth: `A teacher must be ${TEACHER_LIMITS.minAge} to ${TEACHER_LIMITS.maxAge} years old`,
  dateInvalid: (what: string) => `Choose a valid ${what}`,
  joiningDate: "The joining date cannot be more than a year ahead",
  pincode: "PIN code is 6 digits",
  experienceYears: `Experience is 0 to ${TEACHER_LIMITS.maxExperience} whole years`,
  maxPeriodsPerDay: `A teacher can take 1 to ${TEACHER_LIMITS.maxPeriodsPerDay} periods a day`,
  maxPeriodsPerWeek: `A teacher can take 1 to ${TEACHER_LIMITS.maxPeriodsPerWeek} periods a week`,
  username: "A username is 3 to 30 letters, digits, dots or underscores, starting with a letter",
  password: "Password must be 8-72 characters with an uppercase letter, a lowercase letter, a number and a special character",
} as const;


/** The 10 digits of a number typed with a +91, a 0 or spaces. */
export function nationalNumber(value: string): string {
  let digits = value.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  return digits;
}

const isRealDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCFullYear() >= 1900;
};

const daysFromNow = (days: number) => new Date(new Date(`${todayInIndia()}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/**
 * What is wrong with the form. `login`: the teacher gets a login now, so the mobile number, the gender and the username and password
 * are needed; for a teacher who is only changed, the name is all that is needed (the older teachers were added with nothing else).
 * `requireGender: false` (the change form) leaves the gender optional: an older teacher who was given a login later has none.
 */
export function teacherProblems(v: TeacherFormValues, options: { login: boolean; requireGender?: boolean }): TeacherProblems {
  const problems: TeacherProblems = {};
  if (v.name.trim() === "") problems.name = MESSAGES.name;
  if (options.login) {
    if (v.gender === "" && options.requireGender !== false) problems.gender = MESSAGES.gender;
    if (!isIndianMobile(nationalNumber(v.mobile))) problems.mobile = MESSAGES.mobile;
  } else if (v.mobile.trim() !== "" && !isIndianMobile(nationalNumber(v.mobile))) {
    problems.mobile = MESSAGES.mobile;
  }
  if (v.email.trim() !== "" && (!isEmail(v.email) || v.email.trim().length > 254)) problems.email = MESSAGES.email;
  if (v.dateOfBirth !== "") {
    if (!isRealDay(v.dateOfBirth)) problems.dateOfBirth = MESSAGES.dateInvalid("date of birth");
    else {
      const age = ageOn(v.dateOfBirth, todayInIndia());
      if (age < TEACHER_LIMITS.minAge || age > TEACHER_LIMITS.maxAge) problems.dateOfBirth = MESSAGES.dateOfBirth;
    }
  }
  if (v.joiningDate !== "") {
    if (!isRealDay(v.joiningDate)) problems.joiningDate = MESSAGES.dateInvalid("joining date");
    else if (v.joiningDate > daysFromNow(TEACHER_LIMITS.daysBeforeJoining)) problems.joiningDate = MESSAGES.joiningDate;
  }
  if (v.pincode.trim() !== "" && !/^\d{6}$/.test(v.pincode.trim())) problems.pincode = MESSAGES.pincode;
  if (v.experienceYears.trim() !== "") {
    const years = Number(v.experienceYears);
    if (!Number.isInteger(years) || years < 0 || years > TEACHER_LIMITS.maxExperience) problems.experienceYears = MESSAGES.experienceYears;
  }
  for (const [key, max] of [["maxPeriodsPerDay", TEACHER_LIMITS.maxPeriodsPerDay], ["maxPeriodsPerWeek", TEACHER_LIMITS.maxPeriodsPerWeek]] as const) {
    if (v[key].trim() === "") continue;
    const count = Number(v[key]);
    if (!Number.isInteger(count) || count < 1 || count > max) problems[key] = MESSAGES[key];
  }
  if (options.login) {
    if (!isUsername(v.username)) problems.username = MESSAGES.username;
    if (!isPasswordValid(v.password)) problems.password = MESSAGES.password;
  }
  return problems;
}

// ---- Between the form and the server -----------------------------------------------------------------------------------------------

const orNull = (text: string) => (text.trim() === "" ? null : text.trim());

/** What is sent: an empty box is `null` (the server clears it), numbers are numbers; the login only when one is being made. */
export function toTeacherInput(v: TeacherFormValues, options: { login: boolean }): TeacherInput {
  const body: TeacherInput = {
    name: v.name.trim(),
    gender: v.gender === "" ? null : v.gender,
    dateOfBirth: orNull(v.dateOfBirth),
    mobile: v.mobile.trim() === "" ? null : nationalNumber(v.mobile),
    email: orNull(v.email),
    address: { line1: orNull(v.addressLine1), city: orNull(v.city), state: orNull(v.state), pincode: orNull(v.pincode) },
    employeeCode: orNull(v.employeeCode),
    designation: orNull(v.designation),
    qualification: orNull(v.qualification),
    experienceYears: v.experienceYears.trim() === "" ? null : Number(v.experienceYears),
    joiningDate: orNull(v.joiningDate),
    employmentType: v.employmentType === "" ? null : v.employmentType,
    subjectIds: v.subjectIds,
    maxPeriodsPerDay: v.maxPeriodsPerDay.trim() === "" ? null : Number(v.maxPeriodsPerDay),
    maxPeriodsPerWeek: v.maxPeriodsPerWeek.trim() === "" ? null : Number(v.maxPeriodsPerWeek),
    offDays: v.offDays,
  };
  if (options.login) body.login = { username: v.username.trim().toLowerCase(), password: v.password };
  return body;
}

/** A teacher the school has, as the boxes of the change form (no box is ever undefined). */
export const formFromTeacher = (t: Teacher): TeacherFormValues => ({
  ...emptyTeacherForm(),
  name: t.name,
  gender: t.gender ?? "",
  dateOfBirth: t.dateOfBirth ?? "",
  mobile: t.mobile ?? "",
  email: t.email ?? "",
  addressLine1: t.address?.line1 ?? "",
  city: t.address?.city ?? "",
  state: t.address?.state ?? "",
  pincode: t.address?.pincode ?? "",
  employeeCode: t.employeeCode ?? "",
  designation: t.designation ?? "",
  qualification: t.qualification ?? "",
  experienceYears: t.experienceYears === null || t.experienceYears === undefined ? "" : String(t.experienceYears),
  joiningDate: t.joiningDate ?? "",
  employmentType: t.employmentType ?? "",
  subjectIds: [...(t.subjectIds ?? [])],
  maxPeriodsPerDay: t.maxPeriodsPerDay === null ? "" : String(t.maxPeriodsPerDay),
  maxPeriodsPerWeek: t.maxPeriodsPerWeek === null ? "" : String(t.maxPeriodsPerWeek),
  offDays: [...(t.offDays ?? [])],
});

// ---- The username and the password the form can suggest ----------------------------------------------------------------------------------

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "smt", "shri", "sri", "prof", "sir", "madam"]);

/**
 * `first.last` in lower case from the name: titles dropped, accents and symbols removed, a middle name left out. A name with no
 * letters a-z (typed in Hindi) gives nothing: the school types one. A name too short to be a username (Al) is made longer.
 */
export function suggestUsername(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word !== "" && !TITLES.has(word));
  const letters = words.filter((word) => /[a-z]/.test(word));
  if (letters.length === 0) return "";
  const joined = letters.length === 1 ? letters[0] : `${letters[0]}.${letters[letters.length - 1]}`;
  const username = (/^[a-z]/.test(joined) ? joined : `t${joined}`).slice(0, 30).replace(/\.$/, "");
  return username.length >= 3 ? username : `${username}.teacher`;
}

/**
 * The username put in the box on the Login step: `first.last`, an underscore and a two-digit number (meena.singh_41). A username is
 * one on the whole platform, so the plain name is often someone's already; with a number it rarely is (the box still checks).
 */
export function defaultUsername(name: string, below: (max: number) => number = randomBelow): string {
  const base = suggestUsername(name);
  if (base === "") return "";
  return `${base.slice(0, 27).replace(/[._]+$/, "")}_${10 + below(90)}`;
}

/** The username for the Login step: the one already in the box when it was made for this name, otherwise a new one. */
export function usernameFor(current: string, name: string, below: (max: number) => number = randomBelow): string {
  const base = suggestUsername(name);
  if (base === "") return "";
  const madeForThisName = new RegExp(`^${base.slice(0, 27).replace(/[._]+$/, "").replace(/\./g, "\\.")}_\\d{2}$`).test(current);
  return madeForThisName ? current : defaultUsername(name, below);
}

/** A box that takes only digits, at most `max` of them (a PIN code, years, a count). */
export const onlyDigits =
  (max: number) =>
  (typed: string): string =>
    typed.replace(/\D/g, "").slice(0, max);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const addDays = (day: string, days: number) => new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** The days a teacher usually joins on, to pick in one click: today, tomorrow, next Monday, the 1st of next month (each day once). */
export function joiningShortcuts(today: string): { label: string; value: string }[] {
  const date = new Date(`${today}T00:00:00.000Z`);
  const weekday = date.getUTCDay() || 7; // Monday 1 ... Sunday 7
  const firstOfNext = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const all = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "Next Monday", value: addDays(today, 8 - weekday) },
    { label: `1 ${MONTHS[firstOfNext.getUTCMonth()]}`, value: firstOfNext.toISOString().slice(0, 10) },
  ];
  return all.filter((s, i) => all.findIndex((o) => o.value === s.value) === i);
}

/** The furthest a joining date can be: a year from today (the server's rule). */
export const latestJoiningDate = () => daysFromNow(TEACHER_LIMITS.daysBeforeJoining);

/** The dates of birth a teacher can have: 18 to 75 years old today. */
export function birthDateRange(today: string = todayInIndia()): { min: string; max: string } {
  const [y, m, d] = today.split("-");
  return { min: `${Number(y) - TEACHER_LIMITS.maxAge - 1}-${m}-${d}`, max: `${Number(y) - TEACHER_LIMITS.minAge}-${m}-${d}` };
}

// No 0 O o 1 l I: read out over the phone or copied by hand they are mistaken for each other.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "@#$%&*!?";

const randomBelow = (max: number): number => {
  const bucket = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do crypto.getRandomValues(bucket);
  while (bucket[0] >= limit);
  return bucket[0] % max;
};

/** A first password for a teacher: 10 characters with a capital, a small letter, a number and a symbol, easy to read out. */
export function generatePassword(below: (max: number) => number = randomBelow): string {
  const pick = (set: string) => set[below(set.length)];
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL), ...Array.from({ length: 6 }, () => pick(all))];
  // A shuffle, so the four kinds are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** The message the school sends the teacher: where to sign in and with what. */
export function loginMessage(args: { school?: string; teacher: string; username: string; password: string; origin: string }): string {
  return [`${args.school ? `${args.school} - ` : ""}Login for ${args.teacher}`, `Sign in: ${args.origin}/login`, `Username: ${args.username}`, `Password: ${args.password}`].join("\n");
}
