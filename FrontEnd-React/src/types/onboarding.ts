import type { ApprovalStatus } from "./tenant";

/** The academic year in the sign-up form. `status` is "pending" until the school is approved, then "active"; null before it is saved. */
export interface AcademicYearDraft {
  name: string;
  startDate: string;
  endDate: string;
  status: string | null;
}

export type OnboardingStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface OnboardingProgress {
  status: OnboardingStatus;
  /** The next step to do, 1-based. */
  currentStep: number;
  completedSteps: number[];
  submittedAt: string | null;
  resubmittedCount: number;
}

/** One board the school follows, with the medium(s) it is taught in (CBSE in English, the M.P. Board in Hindi and English...). */
export type BoardEntry = {
  board: string;
  /** Only for "State Board"; "" otherwise. */
  stateBoard: string;
  /** Only for "Other": what the school calls the board; "" otherwise. */
  otherBoard: string;
  /** This board's own affiliation / recognition number; "" when not given. */
  affiliationNumber: string;
  mediums: string[];
};

/** The onboarding answers, exactly as the API returns and accepts them. Empty boxes are "" or null. */
export interface SchoolSteps {
  1: {
    schoolName: string;
    schoolType: string | null;
    /** Every board the school follows, each with its medium(s). Empty until the school adds one. */
    boards: BoardEntry[];
    /** The first and the last class the school runs. */
    lowestClass: string | null;
    highestClass: string | null;
    approxStudents: number | null;
    /** 1-12: the month the academic year starts in (read from its start date). */
    sessionStartMonth: number;
    /** The school's first academic year as named in the form: calendar days "2026-04-01", "" until saved. */
    academicYear: AcademicYearDraft;
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

export interface OnboardingState {
  approvalStatus: ApprovalStatus;
  onboarding: OnboardingProgress;
  rejectionReason: string | null;
  steps: SchoolSteps;
}
