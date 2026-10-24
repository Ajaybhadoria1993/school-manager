import type { IAcademicYear } from "../../academics/models/AcademicYear";
import type { IUser } from "../../users/models/User";
import type { ITenant } from "../models/Tenant";

/**
 * The onboarding answers as the API shows them, read back from where they are really stored
 * (the school, and the administrator's own user record). Empty boxes are "" or null so a form can
 * be filled straight from this. Used by the onboarding screens and by the super admin's review page.
 */
export interface SchoolSteps {
  1: {
    schoolName: string;
    schoolType: string | null;
    /** Every board the school follows, each with its medium(s). Empty until the school adds one. */
    boards: {
      board: string;
      /** Only for "State Board"; "" otherwise. */
      stateBoard: string;
      /** Only for "Other": what the school calls the board; "" otherwise. */
      otherBoard: string;
      /** This board's own affiliation / recognition number; "" when not given. */
      affiliationNumber: string;
      mediums: string[];
    }[];
    /** The first and the last class the school runs. */
    lowestClass: string | null;
    highestClass: string | null;
    approxStudents: number | null;
    /** 1-12: the month of the academic year's start date (April for an older school that gave nothing). */
    sessionStartMonth: number;
    /**
     * The school's first academic year, as named in this form: calendar days "2026-04-01", "" until saved. `status` is
     * "pending" until the school is approved, then "active"; null while there is none.
     */
    academicYear: { name: string; startDate: string; endDate: string; status: string | null };
    udiseCode: string;
    establishedYear: number | null;
  };
  2: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    pincode: string;
    /** Not every state has divisions; "" when the school has none to name. */
    division: string;
    district: string;
    /** The 10 digits after +91. */
    schoolPhone: string;
    /** Suggested from the administrator's login email until the admin saves their own. */
    schoolEmail: string;
    website: string;
  };
  3: {
    adminName: string;
    designation: string | null;
    /** What they wrote in when the role is "Other"; "" otherwise. */
    designationOther: string;
    mobile: string;
    alternateMobile: string;
  };
  4: { confirmed: boolean };
}

type AdminLike = Pick<IUser, "name" | "phone" | "alternatePhone" | "designation" | "designationOther">;

type YearLike = Pick<IAcademicYear, "name" | "startDate" | "endDate" | "status">;

const calendarDay = (date: Date) => date.toISOString().slice(0, 10);

export function buildSchoolSteps(tenant: ITenant, admin: AdminLike | null, year: YearLike | null = null): SchoolSteps {
  const profile = tenant.profile ?? {};
  const address = tenant.address ?? {};
  return {
    1: {
      schoolName: tenant.name,
      schoolType: profile.schoolType ?? null,
      boards: (profile.boardEntries ?? []).map((entry) => ({
        board: entry.board,
        stateBoard: entry.stateBoard ?? "",
        otherBoard: entry.otherBoard ?? "",
        affiliationNumber: entry.affiliationNumber ?? "",
        mediums: [...entry.mediums],
      })),
      lowestClass: profile.lowestClass ?? null,
      highestClass: profile.highestClass ?? null,
      approxStudents: profile.approxStudents ?? null,
      sessionStartMonth: profile.sessionStartMonth ?? 4,
      academicYear: year
        ? { name: year.name, startDate: calendarDay(year.startDate), endDate: calendarDay(year.endDate), status: year.status }
        : { name: "", startDate: "", endDate: "", status: null },
      udiseCode: profile.udiseCode ?? "",
      establishedYear: profile.establishedYear ?? null,
    },
    2: {
      addressLine1: address.line1 ?? "",
      addressLine2: address.line2 ?? "",
      city: address.city ?? "",
      state: address.state ?? "",
      pincode: address.pincode ?? "",
      division: address.division ?? "",
      district: address.district ?? "",
      schoolPhone: tenant.contactPhone ?? "",
      schoolEmail: tenant.schoolEmail ?? tenant.contactEmail,
      website: tenant.website ?? "",
    },
    3: {
      adminName: admin?.name ?? "",
      designation: admin?.designation ?? null,
      designationOther: admin?.designationOther ?? "",
      mobile: admin?.phone ?? "",
      alternateMobile: admin?.alternatePhone ?? "",
    },
    4: { confirmed: Boolean(tenant.onboarding?.declarationAcceptedAt) },
  };
}
