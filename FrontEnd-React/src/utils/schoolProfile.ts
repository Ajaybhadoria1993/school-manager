import type { SchoolSteps, UpdateSchoolProfileInput } from "../types";

/** An approved school's details as their boxes hold them (numbers as typed text). */
export type ProfileDraft = Omit<UpdateSchoolProfileInput, "approxStudents" | "establishedYear"> & {
  approxStudents: string;
  establishedYear: string;
};

export function draftFrom(steps: SchoolSteps): ProfileDraft {
  return {
    schoolName: steps[1].schoolName,
    schoolType: steps[1].schoolType ?? "",
    approxStudents: steps[1].approxStudents?.toString() ?? "",
    udiseCode: steps[1].udiseCode,
    establishedYear: steps[1].establishedYear?.toString() ?? "",
    addressLine1: steps[2].addressLine1,
    addressLine2: steps[2].addressLine2,
    city: steps[2].city,
    state: steps[2].state,
    division: steps[2].division,
    district: steps[2].district,
    pincode: steps[2].pincode,
    schoolPhone: steps[2].schoolPhone,
    schoolEmail: steps[2].schoolEmail,
    website: steps[2].website,
  };
}

/** What `PUT /onboarding/profile` takes. */
export const toProfileInput = (draft: ProfileDraft): UpdateSchoolProfileInput => ({
  ...draft,
  approxStudents: Number(draft.approxStudents),
  establishedYear: draft.establishedYear ? Number(draft.establishedYear) : null,
});
