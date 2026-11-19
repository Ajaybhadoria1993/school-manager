import type { AppliesTo, ConcessionBasis, FeeFrequency, FeeKind, LateFineMode } from "../types";

/** The words for what a fee is about, in the order a fee chart is read (the server sorts a class's lines the same way). */
export const FEE_KINDS: { value: FeeKind; label: string }[] = [
  { value: "admission", label: "Registration and admission" },
  { value: "deposit", label: "Refundable deposit" },
  { value: "tuition", label: "Tuition" },
  { value: "development", label: "Development" },
  { value: "annual", label: "Annual charges" },
  { value: "exam", label: "Exam" },
  { value: "facility", label: "Facilities and activities" },
  { value: "supplies", label: "Uniform, books and stationery" },
  { value: "hostel", label: "Hostel and mess" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];
export const KIND_LABEL = Object.fromEntries(FEE_KINDS.map((k) => [k.value, k.label])) as Record<FeeKind, string>;

export const FREQUENCIES: { value: FeeFrequency; label: string }[] = [
  { value: "one_time", label: "Once, when joining" },
  { value: "yearly", label: "Every year" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
];
export const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label])) as Record<FeeFrequency, string>;

/** How many months each frequency is due in (monthly: any 1 to 12; a school that does not take May and June has 10). */
export const MONTH_COUNT: Record<FeeFrequency, { min: number; max: number }> = {
  one_time: { min: 0, max: 0 },
  yearly: { min: 1, max: 1 },
  half_yearly: { min: 2, max: 2 },
  quarterly: { min: 4, max: 4 },
  monthly: { min: 1, max: 12 },
};

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const APPLIES: { value: AppliesTo; label: string }[] = [
  { value: "all", label: "Every student" },
  { value: "new", label: "New students only" },
  { value: "existing", label: "Existing students only" },
];
export const APPLIES_LABEL = Object.fromEntries(APPLIES.map((a) => [a.value, a.label])) as Record<AppliesTo, string>;

export const CONCESSION_BASES: { value: ConcessionBasis; label: string }[] = [
  { value: "sibling", label: "Brother or sister" },
  { value: "staff_ward", label: "Staff member's child" },
  { value: "merit", label: "Merit or topper" },
  { value: "need", label: "Needy family (EWS / BPL)" },
  { value: "rte", label: "RTE free seat" },
  { value: "defence", label: "Defence or government family" },
  { value: "sports", label: "Sports or arts achiever" },
  { value: "single_girl", label: "Single girl child" },
  { value: "other", label: "Other" },
];
export const BASIS_LABEL = Object.fromEntries(CONCESSION_BASES.map((b) => [b.value, b.label])) as Record<ConcessionBasis, string>;

export const LATE_FINE_MODES: { value: LateFineMode; label: string }[] = [
  { value: "none", label: "No late fine" },
  { value: "flat", label: "One flat amount" },
  { value: "per_day", label: "An amount for each day late" },
  { value: "percent_per_month", label: "A percentage for each month late" },
];

/** A fee a school usually has, to pick from instead of typing it (the research of Indian schools' fee charts, 2026-11-12). */
export interface UsualFee {
  name: string;
  kind: FeeKind;
  frequency: FeeFrequency;
  appliesTo: AppliesTo;
  optional: boolean;
  refundable?: boolean;
  /** Ticked when the list opens: what nearly every school has. */
  core?: boolean;
  /** One line on what it is and how schools charge it. */
  note: string;
}

export const USUAL_FEES: UsualFee[] = [
  // Joining: paid once, by a child who joins.
  { name: "Registration fee", kind: "admission", frequency: "one_time", appliesTo: "new", optional: false, core: true, note: "The form and the first step of admission. Usually not given back, even if the child does not join." },
  { name: "Admission fee", kind: "admission", frequency: "one_time", appliesTo: "new", optional: false, core: true, note: "Paid once when the child is admitted. Usually not given back." },
  { name: "Re-admission fee", kind: "admission", frequency: "yearly", appliesTo: "existing", optional: false, note: "Some schools charge it every year to a child who stays on." },
  { name: "Caution money", kind: "deposit", frequency: "one_time", appliesTo: "new", optional: false, refundable: true, core: true, note: "A security deposit given back when the child leaves, after any dues." },
  // Tuition and the yearly charges.
  { name: "Tuition fee", kind: "tuition", frequency: "monthly", appliesTo: "all", optional: false, core: true, note: "The main fee. Most schools charge it monthly or quarterly; some skip May and June." },
  { name: "Annual charges", kind: "annual", frequency: "yearly", appliesTo: "all", optional: false, core: true, note: "Upkeep, the library, labs and the office, charged once a year." },
  { name: "Development fee", kind: "development", frequency: "yearly", appliesTo: "all", optional: false, note: "For furniture and equipment. The Supreme Court allows up to 15% of the tuition fee (Modern School, 2004)." },
  // Exams.
  { name: "Exam fee", kind: "exam", frequency: "half_yearly", appliesTo: "all", optional: false, core: true, note: "Paper, printing and results: once or twice a year, or with each term." },
  { name: "Board registration fee", kind: "exam", frequency: "yearly", appliesTo: "all", optional: false, note: "Paid to the board for Class 9 and Class 11: add it only to those classes." },
  { name: "Board exam fee", kind: "exam", frequency: "yearly", appliesTo: "all", optional: false, note: "Paid to the board for Class 10 and Class 12: add it only to those classes." },
  { name: "Practical exam fee", kind: "exam", frequency: "yearly", appliesTo: "all", optional: false, note: "For the science or computer practicals of the senior classes." },
  // Facilities and activities.
  { name: "Computer fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, core: true, note: "The computer lab and its upkeep." },
  { name: "Science lab fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, note: "Usually from Class 6 or 9 upward." },
  { name: "Library fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, core: true, note: "Books and the reading room." },
  { name: "Sports fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, core: true, note: "The ground, the equipment and the coach." },
  { name: "Activity fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, note: "Clubs, art and craft, music, dance, events." },
  { name: "Smart class fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, note: "Digital classrooms and e-content." },
  { name: "Student insurance", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, note: "An accident cover for every child, once a year." },
  { name: "Medical check-up fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: false, note: "The yearly health check-up." },
  { name: "Picnic or excursion", kind: "facility", frequency: "yearly", appliesTo: "all", optional: true, note: "A trip or a visit. Optional unless the school makes it compulsory." },
  { name: "Annual day fee", kind: "facility", frequency: "yearly", appliesTo: "all", optional: true, note: "The annual function: costumes and the stage." },
  // Uniform, books and stationery: usually chosen by the family and bought from the school.
  { name: "Uniform (dress)", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: true, core: true, note: "School uniform, if the school sells it. Charged once for the year or when a new child joins." },
  { name: "Sports uniform and PT kit", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: true, note: "The house t-shirt, shoes and the PT kit." },
  { name: "Books", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: true, core: true, note: "Textbooks supplied by the school." },
  { name: "Stationery and notebooks", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: true, note: "Notebooks, a kit, a file." },
  { name: "School diary", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: false, note: "The communication diary." },
  { name: "ID card", kind: "supplies", frequency: "yearly", appliesTo: "all", optional: false, note: "The identity card and the lanyard." },
  { name: "Tie, belt and badge", kind: "supplies", frequency: "yearly", appliesTo: "new", optional: false, note: "The small things of the uniform." },
  { name: "School bag", kind: "supplies", frequency: "one_time", appliesTo: "new", optional: true, note: "If the school gives one when the child joins." },
  // Transport and hostel: chosen by the family.
  { name: "Transport fee", kind: "transport", frequency: "monthly", appliesTo: "all", optional: true, core: true, note: "Comes from the stop the child boards at (Transport > Routes): it has no amount on a class's fee chart." },
  { name: "Hostel fee", kind: "hostel", frequency: "monthly", appliesTo: "all", optional: true, note: "A room in the hostel." },
  { name: "Mess fee", kind: "hostel", frequency: "monthly", appliesTo: "all", optional: true, note: "The hostel's food." },
  { name: "Laundry fee", kind: "hostel", frequency: "monthly", appliesTo: "all", optional: true, note: "Washing, if the hostel does it." },
  // Other.
  { name: "PTA fund", kind: "other", frequency: "yearly", appliesTo: "all", optional: false, note: "The parent-teacher association's fund." },
  { name: "Magazine fee", kind: "other", frequency: "yearly", appliesTo: "all", optional: false, note: "The school magazine." },
  { name: "Transfer certificate fee", kind: "other", frequency: "one_time", appliesTo: "existing", optional: false, note: "Charged when a child leaves and takes the TC. Many schools charge nothing." },
];

/** A concession a school usually gives, to pick from. It takes the percentage off the school's fees of `onKinds` (empty: every fee). */
export interface UsualConcession {
  name: string;
  basis: ConcessionBasis;
  mode: "percent" | "flat";
  value: number;
  onKinds: FeeKind[];
  needsApproval: boolean;
  note: string;
}

export const USUAL_CONCESSIONS: UsualConcession[] = [
  { name: "Sibling concession", basis: "sibling", mode: "percent", value: 10, onKinds: ["tuition"], needsApproval: false, note: "Most schools give 5% to 15% on tuition to the second and later child." },
  { name: "Staff child concession", basis: "staff_ward", mode: "percent", value: 50, onKinds: ["tuition", "admission"], needsApproval: true, note: "A child of a teacher or of other staff: often half the tuition and no admission fee." },
  { name: "RTE free seat", basis: "rte", mode: "percent", value: 100, onKinds: [], needsApproval: false, note: "The 25% free seats the Right to Education Act asks of a private school: the child pays nothing." },
  { name: "Needy family (EWS / BPL)", basis: "need", mode: "percent", value: 50, onKinds: ["tuition"], needsApproval: true, note: "For a family that cannot pay, on a certificate." },
  { name: "Merit scholarship", basis: "merit", mode: "percent", value: 25, onKinds: ["tuition"], needsApproval: true, note: "For the top students of a class, for the year." },
  { name: "Single girl child", basis: "single_girl", mode: "percent", value: 25, onKinds: ["tuition"], needsApproval: true, note: "A family with one daughter and no other child." },
  { name: "Defence or government family", basis: "defence", mode: "percent", value: 50, onKinds: ["admission"], needsApproval: true, note: "A soldier's or an ex-serviceman's child, often on the admission fee." },
  { name: "Sports or arts achiever", basis: "sports", mode: "percent", value: 25, onKinds: ["tuition"], needsApproval: true, note: "For a state or national level player or artist." },
];

/** Above this, a raise on last year's fees needs the fee committee's approval in some states (Madhya Pradesh: 10%, by the 2017 Act). */
export const RAISE_NEEDS_APPROVAL_ABOVE = 10;
