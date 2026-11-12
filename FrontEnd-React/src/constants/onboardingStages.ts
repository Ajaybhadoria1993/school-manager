/**
 * What the sign-up form shows is five screens; the server keeps it as three saved steps and a review. The Academic Year screen and the
 * Class Sections screen are both the server's step 2 (the year, the boards and each medium's classes are saved together, when Class
 * Sections is saved), so a screen number (a "stage") and a server step are not the same number. This is the one place that maps them.
 */
export interface OnboardingStage {
  label: string;
  /** The line under the label in the side panel while the stage is open. */
  note: string;
  /** The heading and the line of the card at the top of the page. */
  title: string;
  subtitle: string;
  /** The step the server saves this stage with (4 = the review); 0 for a stage that is only a screen of the one before. */
  server: number;
}

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    label: "School Details",
    note: "School, address and contact",
    title: "School Details",
    subtitle: "Tell us what your school is, where it is and how to reach it",
    server: 1,
  },
  {
    label: "Academic Year",
    note: "Session, board and medium",
    title: "Academic Year",
    subtitle: "Pick the session and the boards and mediums your school runs",
    server: 0,
  },
  {
    label: "Class Sections",
    note: "Configure classes & sections",
    title: "Class Sections Management",
    subtitle: "Configure sections for each class with their details",
    server: 2,
  },
  {
    label: "Your Profile",
    note: "Who is registering the school",
    title: "Your Profile",
    subtitle: "Tell us who is registering the school and how our team can reach you",
    server: 3,
  },
  {
    label: "Review & Submit",
    note: "Check and send for approval",
    title: "Review & Submit",
    subtitle: "Check everything once, then send it to our team for approval",
    server: 4,
  },
];

export const STAGE_COUNT = ONBOARDING_STAGES.length;
export const ACADEMIC_STAGE = 2;
export const CLASSES_STAGE = 3;
export const REVIEW_STAGE = STAGE_COUNT;

/** The screen a server step opens on: step 1 is School Details, step 2 starts on Academic Year, step 3 is Your Profile, 4 is the review. */
export function stageOfServerStep(step: number): number {
  if (step <= 1) return 1;
  if (step === 2) return ACADEMIC_STAGE;
  return step + 1;
}

/** The stages that are done, from the steps the server has saved: Academic Year and Class Sections are saved together. */
export function doneStages(savedSteps: readonly number[]): number[] {
  const done: number[] = [];
  if (savedSteps.includes(1)) done.push(1);
  if (savedSteps.includes(2)) done.push(ACADEMIC_STAGE, CLASSES_STAGE);
  if (savedSteps.includes(3)) done.push(4);
  return done;
}

/** The stage that follows a saved step: Academic Year is never saved on its own, so step 2 is followed by Your Profile. */
export function stageAfterSave(step: number): number {
  return step === 1 ? ACADEMIC_STAGE : step === 2 ? 4 : REVIEW_STAGE;
}
