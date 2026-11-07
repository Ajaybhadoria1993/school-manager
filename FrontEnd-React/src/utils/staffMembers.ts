import type { StaffMember, StaffMemberInput, TeacherGender } from "../types";
import { STATES } from "../constants/schoolOptions";
import { TEACHER_LIMITS } from "../constants/teachers";
import { ageOn, todayInIndia } from "./students";
import { nationalNumber } from "./teachers";
import { isEmail, isIndianMobile } from "./validators";

/**
 * The boxes of Add staff and Change staff and the rules they follow (the server says the same and has the last word). The role, the
 * name and the email are needed; everything else may be left empty, but what is filled must be right.
 */
export interface StaffFormValues {
  name: string;
  role: string;
  email: string;
  mobile: string;
  gender: TeacherGender | "";
  dateOfBirth: string;
  designation: string;
  employeeCode: string;
  joiningDate: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
}
export type StaffFormKey = keyof StaffFormValues;
export type StaffProblems = Partial<Record<StaffFormKey, string>>;
/** The id of a box of the staff form (the page focuses the first wrong one by it, a test finds its message by it). */
export const staffFieldId = (key: StaffFormKey) => `staff-${key}`;

export const emptyStaffForm = (): StaffFormValues => ({
  name: "",
  role: "",
  email: "",
  mobile: "",
  gender: "",
  dateOfBirth: "",
  designation: "",
  employeeCode: "",
  joiningDate: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
});

const isRealDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900;
const daysFromNow = (days: number) => new Date(new Date(`${todayInIndia()}T00:00:00.000Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** What is wrong with the form, by box, in the server's words. `editing`: the email is not asked (it cannot change). */
export function staffProblems(v: StaffFormValues, options: { editing?: boolean } = {}): StaffProblems {
  const problems: StaffProblems = {};
  if (v.name.trim() === "") problems.name = "Enter the name";
  if (v.role === "") problems.role = "Choose the role";
  if (!options.editing) {
    if (v.email.trim() === "") problems.email = "Enter the email address";
    else if (!isEmail(v.email) || v.email.trim().length > 254) problems.email = "Enter a valid email address";
  }
  if (v.mobile.trim() !== "" && !isIndianMobile(nationalNumber(v.mobile))) problems.mobile = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";
  if (v.dateOfBirth !== "") {
    if (!isRealDay(v.dateOfBirth)) problems.dateOfBirth = "Choose a valid date of birth";
    else {
      const age = ageOn(v.dateOfBirth, todayInIndia());
      if (age < TEACHER_LIMITS.minAge || age > TEACHER_LIMITS.maxAge) problems.dateOfBirth = `A staff member must be ${TEACHER_LIMITS.minAge} to ${TEACHER_LIMITS.maxAge} years old`;
    }
  }
  if (v.joiningDate !== "") {
    if (!isRealDay(v.joiningDate)) problems.joiningDate = "Choose a valid joining date";
    else if (v.joiningDate > daysFromNow(TEACHER_LIMITS.daysBeforeJoining)) problems.joiningDate = "The joining date cannot be more than a year ahead";
  }
  if (v.employeeCode.trim() !== "" && !new RegExp(`^[A-Za-z0-9-]{1,${TEACHER_LIMITS.employeeCode}}$`).test(v.employeeCode.trim())) {
    problems.employeeCode = `The employee code is letters, digits and - only, up to ${TEACHER_LIMITS.employeeCode}`;
  }
  if (v.state !== "" && !(STATES as readonly string[]).includes(v.state)) problems.state = "Choose the state";
  if (v.pincode.trim() !== "" && !/^\d{6}$/.test(v.pincode.trim())) problems.pincode = "PIN code is 6 digits";
  return problems;
}

const orNull = (text: string) => (text.trim() === "" ? null : text.trim());

/** What is sent: an empty box is null (the server clears it); the email only when the person is added (it cannot change). */
export function toStaffInput(v: StaffFormValues, options: { editing?: boolean } = {}): Omit<StaffMemberInput, "email"> & { email?: string } {
  return {
    name: v.name.trim(),
    role: v.role as StaffMemberInput["role"],
    ...(options.editing ? {} : { email: v.email.trim().toLowerCase() }),
    mobile: v.mobile.trim() === "" ? null : nationalNumber(v.mobile),
    gender: v.gender === "" ? null : v.gender,
    dateOfBirth: orNull(v.dateOfBirth),
    designation: orNull(v.designation),
    employeeCode: orNull(v.employeeCode),
    joiningDate: orNull(v.joiningDate),
    address: { line1: orNull(v.addressLine1), city: orNull(v.city), state: orNull(v.state), pincode: orNull(v.pincode) },
  };
}

export const formFromStaff = (m: StaffMember): StaffFormValues => ({
  name: m.name,
  role: m.role,
  email: m.email,
  mobile: m.mobile ?? "",
  gender: m.gender ?? "",
  dateOfBirth: m.dateOfBirth ?? "",
  designation: m.designation ?? "",
  employeeCode: m.employeeCode ?? "",
  joiningDate: m.joiningDate ?? "",
  addressLine1: m.address.line1 ?? "",
  city: m.address.city ?? "",
  state: m.address.state ?? "",
  pincode: m.address.pincode ?? "",
});

/** The box a server message points at (`details[].path`). */
export function staffKeyOfPath(path: string): StaffFormKey | null {
  const named: Record<string, StaffFormKey> = { "address.line1": "addressLine1", "address.city": "city", "address.state": "state", "address.pincode": "pincode" };
  if (named[path]) return named[path];
  return path in emptyStaffForm() ? (path as StaffFormKey) : null;
}
