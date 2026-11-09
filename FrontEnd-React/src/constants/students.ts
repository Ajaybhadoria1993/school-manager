import type { Gender, Relation, UserRole } from "../types";

/**
 * The Students module's lists and limits. They must match backend/src/main/students/constants.ts and its schemas: the server
 * checks everything again, these only let a screen say what is wrong before anything is sent.
 */

/** Who may admit and change students (the same one list as the server's STUDENT_WRITERS; a "reception" role joins later). */
export const STUDENT_WRITERS: readonly UserRole[] = ["school_admin", "principal"];

/** Who may approve the promotion list and switch the next academic year on (the server's STUDENT_APPROVERS: the school admin only). */
export const STUDENT_APPROVERS: readonly UserRole[] = ["school_admin"];

export const GENDERS: readonly Gender[] = ["Male", "Female", "Other"];
export const RELATIONS: readonly Relation[] = ["Father", "Mother", "Guardian", "Other"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS", "Prefer not to say"] as const;

export const MAX_GUARDIANS = 4;
export const MIN_AGE = 2;
export const MAX_AGE = 25;
export const MAX_ROLL_NUMBER = 999;

/** Rows per page of the student cards (three across on a wide screen). */
export const STUDENT_PAGE_SIZES = [12, 24, 48] as const;

/** The bulk upload: one file of up to 5 MB and 1000 students, checked and admitted 100 rows per request (the server's limits). */
export const MAX_IMPORT_FILE_MB = 5;
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_ROWS_PER_REQUEST = 100;
/** Rows of the check and result tables shown at a time. */
export const IMPORT_ROWS_PER_PAGE = 50;

/**
 * Every message the admission and edit forms show, in the server's exact words (backend/src/main/students/schemas), so a mistake
 * reads the same whether the screen caught it first or the server did.
 */
export const MESSAGES = {
  enter: (what: string) => `Enter the ${what}`,
  length: (what: string, max: number) => `The ${what} must be 2 to ${max} characters`,
  brackets: (what: string) => `The ${what} cannot contain < or >`,
  tooLong: (what: string, max: number) => `Keep the ${what} under ${max} characters`,
  chooseDay: (what: string) => `Choose the ${what}`,
  validDay: (what: string) => `Choose a valid ${what}`,
  gender: "Choose the gender",
  bornInFuture: "The date of birth cannot be in the future",
  admittedInFuture: "The admission date cannot be in the future",
  /** How old the student was on which day (the age counts from the ADMISSION date, not today), and which dates to fix. `day` is "2022-04-03". */
  age: (years: number, day: string) =>
    `The student was ${years < 1 ? "less than a year" : `${years} year${years === 1 ? "" : "s"}`} old on the admission date (${day.split("-").reverse().join("-")}); a student must be ${MIN_AGE} to ${MAX_AGE} years old then. Fix the date of birth or the admission date`,
  street: "Enter the street address",
  city: "Enter the city",
  state: "Choose the state",
  pincode: "PIN code is 6 digits",
  className: "Choose the class",
  section: "Choose the section",
  rollNumber: `The roll number must be a whole number from 1 to ${MAX_ROLL_NUMBER}`,
  onePrimary: "Choose one primary guardian",
  relation: "Choose the relation",
  mobileMissing: "Enter the mobile number",
  mobile: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9",
  sameMobile: "Two guardians cannot have the same mobile number",
  alternateSame: "The alternate number must differ from the mobile number",
  email: "Enter a valid email address",
  previousSchool: "Enter the previous school's name",
  tcInFuture: "The TC date cannot be in the future",
  // What is wrong with an Aadhaar number is said by what is wrong: the digits, the first digit, or the last (check) digit.
  aadhaarLength: "The Aadhaar number has 12 digits",
  aadhaarStart: "An Aadhaar number does not start with 0 or 1",
  aadhaarCheck: "This Aadhaar number is not valid: its last digit (the check digit) does not match the other digits",
  samagra: "Samagra ID is 8 or 9 digits",
  apaar: "APAAR ID is 12 digits",
  pen: "PEN is 11 digits",
} as const;
