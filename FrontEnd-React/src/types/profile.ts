/** The signed-in person's own details (docs/profiles.md; the server's OwnProfile). */
export interface MyProfile {
  /** `member`: a teacher or a staff member; `account`: a login only (the school's administrator). */
  kind: "account" | "member";
  teaches: boolean;
  name: string;
  email: string | null;
  username: string | null;
  roleLabel: string | null;
  mobile: string | null;
  designation: string | null;
  designationOther: string | null;
  alternateMobile: string | null;
  gender: "Male" | "Female" | "Other" | null;
  dateOfBirth: string | null;
  address: { line1: string | null; city: string | null; state: string | null; pincode: string | null };
  qualification: string | null;
  experienceYears: number | null;
  /** What the school decides: shown, not changed. Null for a login only. */
  job: { employeeCode: string | null; designation: string | null; joiningDate: string | null } | null;
}

/** The boxes `PUT /profile` takes; only the ones that changed are sent. "" empties a box. */
export interface MyProfileInput {
  name?: string;
  mobile?: string;
  designation?: string;
  designationOther?: string;
  alternateMobile?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: { line1?: string; city?: string; state?: string; pincode?: string };
  qualification?: string;
  experienceYears?: number | null;
}

/** A person's photo as a `data:` address, or null. */
export interface ProfilePhoto {
  photo: string | null;
}

/** A teacher's resume as the server tells it (the file itself is downloaded). */
export interface ResumeInfo {
  name: string;
  /** In bytes. */
  size: number;
  uploadedAt: string;
}

/** Whose photo the school's pages keep: a teacher's or a staff member's. */
export interface PhotoPerson {
  kind: "teacher" | "staff";
  id: string;
}
