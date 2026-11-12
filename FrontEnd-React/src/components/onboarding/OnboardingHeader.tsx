import { ONBOARDING_STAGES, STAGE_COUNT } from "../../constants/onboardingStages";
import { cn } from "../../utils/helpers";
import { useProgress } from "./stage";

/**
 * "Let's build a better learning journey" in handwriting, with its swoosh, and the graduation cap at its right: the two sit side by side, so
 * the words never lie across the cap. The cap floats a little. Not read out: it is a picture. On a screen too narrow to spare the room it is
 * not drawn (the card then has only the building and the heading).
 */
function HeaderTagline({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("items-center justify-end gap-2 pr-1", className)}>
      <div className="text-right">
        <p className="font-script text-[15px] font-semibold leading-tight text-primary-deep">
          Let&apos;s build a
          <br />
          better learning journey
        </p>
        <svg viewBox="0 0 150 10" className="ml-auto mt-0.5 h-2 w-36 text-sky" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 7c34-7 78-7 144-2" opacity=".7" />
        </svg>
      </div>
      <img src="/images/onboarding/graduation-cap.svg" alt="" className="float-slow h-16 w-[5.25rem] shrink-0" />
    </div>
  );
}

/**
 * The white card at the top of every screen of the sign-up form: the school building, the heading of the screen and one line under it, and
 * at its right (on a wide screen) the handwritten line with the graduation cap. The heading follows the screen that is open; the line can
 * name what the screen is about (Class Sections names its range).
 */
export function OnboardingHeader({ className }: { className?: string }) {
  const { active, subtitle } = useProgress();
  // After the form is sent the page has its own heading.
  if (active > STAGE_COUNT) return null;
  const stage = ONBOARDING_STAGES[Math.max(active, 1) - 1];

  return (
    <header className={cn("flex min-h-[5rem] items-center gap-4 rounded-2xl border border-white bg-gradient-to-r from-white via-white to-primary-soft px-3.5 py-3 shadow-raised sm:px-4", className)}>
      <img src="/images/onboarding/school-building.svg" alt="" className="hidden size-14 shrink-0 rounded-xl object-cover object-bottom sm:block" decoding="async" />
      {/* `key` replays the small rise when the screen changes. */}
      <div key={active} className="rise-in min-w-0 flex-1">
        <h1 className="text-lg font-bold leading-tight text-foreground sm:text-xl">{stage.title}</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">{subtitle ?? stage.subtitle}</p>
      </div>
      <HeaderTagline className="hidden shrink-0 xl:flex" />
    </header>
  );
}
