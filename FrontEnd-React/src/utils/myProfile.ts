import type { MyProfile, MyProfileInput } from "../types";
import { isIndianMobile } from "./validators";

/** The boxes of Personal details as text. */
export interface MyProfileForm {
  name: string;
  mobile: string;
  designation: string;
  designationOther: string;
  alternateMobile: string;
  gender: string;
  dateOfBirth: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  qualification: string;
  experienceYears: string;
}
export type MyProfileKey = keyof MyProfileForm;
const ADDRESS_KEYS = ["line1", "city", "state", "pincode"] as const;

export const formFromProfile = (p: MyProfile): MyProfileForm => ({
  name: p.name,
  mobile: p.mobile ?? "",
  designation: p.designation ?? "",
  designationOther: p.designationOther ?? "",
  alternateMobile: p.alternateMobile ?? "",
  gender: p.gender ?? "",
  dateOfBirth: p.dateOfBirth ?? "",
  line1: p.address.line1 ?? "",
  city: p.address.city ?? "",
  state: p.address.state ?? "",
  pincode: p.address.pincode ?? "",
  qualification: p.qualification ?? "",
  experienceYears: p.experienceYears === null ? "" : String(p.experienceYears),
});

/** What is wrong before anything is sent. A mobile number that is there (or an administrator's) is not emptied. */
export function myProfileProblems(form: MyProfileForm, profile: MyProfile): Partial<Record<MyProfileKey, string>> {
  const found: Partial<Record<MyProfileKey, string>> = {};
  if (form.name.trim().length < 2) found.name = "Enter your full name";
  const needsMobile = profile.kind === "account" || !!profile.mobile;
  if ((needsMobile || form.mobile !== "") && !isIndianMobile(form.mobile)) found.mobile = "Enter a 10-digit mobile number";
  if (form.alternateMobile !== "" && !isIndianMobile(form.alternateMobile)) found.alternateMobile = "Enter a 10-digit mobile number";
  if (form.designation === "Other" && form.designationOther.trim().length < 2) found.designationOther = "Tell us your role";
  if (form.pincode !== "" && !/^\d{6}$/.test(form.pincode)) found.pincode = "PIN code is 6 digits";
  return found;
}

/** Only the boxes that changed, so a rule about a box that was not touched never holds the others back. Null: nothing changed. */
export function myProfileChanges(form: MyProfileForm, saved: MyProfileForm): MyProfileInput | null {
  const out: MyProfileInput = {};
  const changed = (key: MyProfileKey) => form[key].trim() !== saved[key].trim();
  for (const key of ["name", "mobile", "designation", "designationOther", "alternateMobile", "gender", "dateOfBirth", "qualification"] as const) {
    if (changed(key)) out[key] = form[key].trim();
  }
  // "Other" is sent with its words.
  if (out.designation === "Other") out.designationOther = form.designationOther.trim();
  const address = Object.fromEntries(ADDRESS_KEYS.filter(changed).map((key) => [key, form[key].trim()]));
  if (Object.keys(address).length > 0) out.address = address;
  if (changed("experienceYears")) out.experienceYears = form.experienceYears.trim() === "" ? null : Number(form.experienceYears);
  return Object.keys(out).length > 0 ? out : null;
}

/** The box a server message is about ("address.city" is the City box), or null. */
export function myProfileKeyOf(path: string, form: MyProfileForm): MyProfileKey | null {
  const key = path.replace(/^address\./, "");
  return key in form ? (key as MyProfileKey) : null;
}
