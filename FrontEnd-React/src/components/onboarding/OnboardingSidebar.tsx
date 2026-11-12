import { Check, LogOut } from "lucide-react";
import { ONBOARDING_STAGES, STAGE_COUNT } from "../../constants/onboardingStages";
import { cn } from "../../utils/helpers";
import { useProgress } from "./stage";

/** The EduShiksha mark and name of the login kit, on the dark panel. */
export function SidebarBrand({ className, onLight = false }: { className?: string; /** For the light page (a phone, where there is no panel): dark letters. */ onLight?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img src="/images/onboarding/logo.svg" alt="" width={48} height={48} className="size-12 shrink-0" decoding="async" />
      <span className="leading-tight">
        <span className={cn("block text-xl font-bold", onLight ? "text-foreground" : "text-white")}>EduShiksha</span>
        <span className={cn("block text-xs", onLight ? "text-foreground-muted" : "text-white/70")}>Schools . Simplified</span>
      </span>
    </div>
  );
}

/**
 * Sign out, as a small icon: it is the only way out of the sign-up form (the school admin can reach nothing else before the school is
 * approved). In the dark panel beside the logo; on a phone, where there is no panel, beside the logo on the light page (`onLight`).
 */
export function SignOutButton({ onSignOut, onLight = false, className }: { onSignOut: () => void; onLight?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      onClick={onSignOut}
      className={cn(
        "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-4",
        onLight ? "border border-border bg-white text-foreground-muted hover:text-danger focus-visible:ring-primary/20" : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white focus-visible:ring-white/30",
        className
      )}
    >
      <LogOut className="size-[18px]" aria-hidden />
    </button>
  );
}

/**
 * The dark-blue panel at the left of the sign-up form: the logo, "Onboarding Progress" with the five screens down the side (a green tick
 * for what is done, the one that is open lit, the rest numbered), and the school at the bottom. A screen that is done, or the next one,
 * can be pressed to open it; the later ones wait. Stuck to the window: the form scrolls, this does not.
 */
export function OnboardingSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { active, done, reachable, onSelect } = useProgress();

  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start overflow-hidden bg-onboard bg-cover bg-center text-white lg:flex xl:w-72"
      style={{ backgroundImage: "url(/images/onboarding/sidebar-bg.svg)" }}
    >
      <div className="flex items-center justify-between gap-2 px-7 pt-7">
        <SidebarBrand />
        <SignOutButton onSignOut={onSignOut} />
      </div>

      <nav aria-label="Onboarding progress" className="mt-10 flex-1 px-7">
        <p className="text-base font-semibold text-white">Onboarding Progress</p>
        <ol className="mt-6">
          {ONBOARDING_STAGES.map((stage, i) => {
            const number = i + 1;
            const finished = done.includes(number) && number !== active;
            const current = number === active;
            const clickable = !!onSelect && !current && number <= reachable;
            const last = number === STAGE_COUNT;
            return (
              <li key={stage.label} className="relative">
                {/* The line down to the next circle: green once this screen is done. */}
                {!last && <span aria-hidden className={cn("absolute left-[1.0625rem] top-9 h-[calc(100%-1.25rem)] w-0.5 rounded-full transition-colors", finished ? "bg-emerald-400" : "bg-white/20")} />}
                <button
                  type="button"
                  disabled={!clickable}
                  aria-current={current ? "step" : undefined}
                  onClick={() => clickable && onSelect?.(number)}
                  className={cn(
                    "relative flex w-full items-center gap-3.5 rounded-xl px-0 py-2 text-left transition-all duration-200",
                    current && "-mx-3 w-[calc(100%+1.5rem)] bg-primary/90 px-3 shadow-[0_8px_20px_-8px_rgb(37_99_235/0.8)]",
                    clickable && "cursor-pointer hover:translate-x-0.5",
                    !clickable && "cursor-default"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-[2.125rem] shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-300",
                      finished ? "scale-100 bg-emerald-500 text-white" : current ? "bg-white text-primary shadow-sm" : "border border-white/30 bg-white/10 text-white/70"
                    )}
                  >
                    {finished ? <Check className="size-4" strokeWidth={3} aria-hidden /> : number}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className={cn("block text-[15px]", current ? "font-semibold text-white" : finished ? "font-medium text-white" : "text-white/70")}>{stage.label}</span>
                    {current && <span className="fade-in mt-0.5 block text-xs text-white/80">{stage.note}</span>}
                  </span>
                </button>
                <span className="block h-3" aria-hidden />
              </li>
            );
          })}
        </ol>
      </nav>

      {/* The school stands on the page, and the words are under it on the dark blue (not across the picture). */}
      <div>
        <img src="/images/onboarding/school-building.svg" alt="" className="w-full" loading="lazy" decoding="async" />
        <p className="font-script bg-gradient-to-b from-transparent to-onboard-deep px-6 pb-6 pt-3 text-center text-lg font-semibold leading-snug text-white">
          Better Education
          <br />
          Brighter Future
        </p>
      </div>
    </aside>
  );
}
