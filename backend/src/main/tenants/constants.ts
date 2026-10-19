/** Choices offered in the onboarding form. Kept in one place so the model, validation and tests agree. */
export const SCHOOL_TYPES = ["Private", "Government", "Government Aided", "Trust / Society", "Other"] as const;
/** A school can follow more than one board (for example CBSE and its state's board), each in its own medium. */
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
export const INDIAN_STATES = [
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
export const DESIGNATIONS =["Owner", "Chairman", "Director", "Principal", "Trustee", "Administrator", "Other"] as const;
/** Each board can be taught in more than one medium, so this is a multiple choice (English and Hindi = both ticked). */
export const MEDIUMS = ["English", "Hindi", "Regional"] as const;

/** In teaching order: the form asks for the lowest and highest class a school runs. */
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

/** Steps 1-3 collect data; step 4 is the review and declaration. */
export const ONBOARDING_STEP_COUNT = 4;
export const DATA_STEPS = [1, 2, 3] as const;
