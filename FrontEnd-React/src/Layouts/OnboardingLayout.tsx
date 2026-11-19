import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { useAuth } from "../hooks/useAuth";
import { postLoginPath } from "../utils/postLoginPath";
import { ONBOARDING_STAGES, STAGE_COUNT } from "../constants/onboardingStages";
import { cn } from "../utils/helpers";
import { OnboardingHeader } from "../components/onboarding/OnboardingHeader";
import { OnboardingSidebar, SidebarBrand, SignOutButton } from "../components/onboarding/OnboardingSidebar";
import { StageProvider, useProgress, useSlotRef } from "../components/onboarding/stage";

/** Below a laptop the side panel is gone: "Step 3 of 5: Class Sections" with a bar of five, so the school still knows where it is. */
function PhoneProgress() {
  const { active, done } = useProgress();
  if (active > STAGE_COUNT) return null;
  return (
    <div className="lg:hidden" aria-label="Progress">
      <p className="text-sm font-semibold text-foreground">
        Step {active} of {STAGE_COUNT}: <span className="text-primary">{ONBOARDING_STAGES[active - 1].label}</span>
      </p>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {ONBOARDING_STAGES.map((stage, i) => (
          <span key={stage.label} className={cn("h-1.5 flex-1 rounded-full transition-colors", done.includes(i + 1) || i + 1 === active ? "bg-primary" : "bg-white")} />
        ))}
      </div>
    </div>
  );
}

/**
 * Frame for a school admin whose school is not approved yet. Deliberately NOT the app shell: no navigation, because nothing else is
 * available to them until the school is approved. A dark-blue panel with the steps at the left (a wide screen; Sign out is the small icon
 * beside its logo), a light page, and the white card with the heading of the screen at the top. Under the card are two places a screen may
 * fill: at the left the year and the class range of Class Sections, at the right Quick Fill.
 */
function Frame() {
  const { user, logout } = useAuth();
  const belowRef = useSlotRef("below");
  const sideRef = useSlotRef("side");
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-onboard-page-from via-onboard-page-via to-onboard-page-to">
      <OnboardingSidebar onSignOut={() => logout()} />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="w-full flex-1 px-4 py-4 lg:px-8 lg:py-6">
          <div className="mx-auto max-w-[88rem] space-y-5">
            {/* Under a laptop the logo has no panel to sit in: it is here, with the way out beside it. */}
            <div className="flex items-center justify-between gap-3 lg:hidden">
              <SidebarBrand onLight />
              <SignOutButton onLight onSignOut={() => logout()} />
            </div>
            <PhoneProgress />

            <OnboardingHeader />

            {/* Empty (and no room taken) until a screen fills them. */}
            <div className="hidden flex-wrap items-end justify-between gap-x-4 gap-y-3 has-[>div:not(:empty)]:flex">
              <div ref={belowRef} className="min-w-0 empty:hidden" />
              <div ref={sideRef} className="empty:hidden" />
            </div>

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function OnboardingLayout() {
  const { user, tenant, loading, loginPath } = useAuth();
  const navigate = useNavigate();

  const belongsHere = !!user && postLoginPath(user, tenant) === "/onboarding";

  useEffect(() => {
    if (loading) return;
    if (!user) navigate(loginPath, { replace: true });
    else if (!belongsHere) navigate(postLoginPath(user, tenant), { replace: true });
  }, [loading, user, tenant, belongsHere, loginPath, navigate]);

  if (loading || !belongsHere) return <PageSpinner />;

  return (
    <StageProvider>
      <Frame />
    </StageProvider>
  );
}
