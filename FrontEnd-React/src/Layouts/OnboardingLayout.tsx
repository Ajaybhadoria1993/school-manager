import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { LogOut, Save, ShieldCheck, UserCheck, Zap } from "lucide-react";
import { PageSpinner } from "../components/shared/PageSpinner";
import { useAuth } from "../hooks/useAuth";
import { postLoginPath } from "../utils/postLoginPath";
import { STAGE_COPY } from "../constants/schoolOptions";
import { STATUS_META } from "../utils/status";
import { initials } from "../utils/helpers";
import { BrandMark } from "../components/brand/BrandMark";
import { StageProvider, useStage } from "../components/onboarding/stage";
import { StatusBadge } from "../components/tenants/StatusBadge";

const PERKS = [
  { icon: Zap, title: "Quick & Easy", text: "Complete setup in a few minutes" },
  { icon: ShieldCheck, title: "Kept private", text: "Your data stays within your school" },
  { icon: UserCheck, title: "Checked by people", text: "Every school is reviewed before it opens" },
];

/** The navy panel on the left: a photo, and a headline that follows the step the administrator is on. */
function SidePanel() {
  const stage = useStage();
  const copy = STAGE_COPY[Math.min(Math.max(stage, 1), STAGE_COPY.length) - 1];

  return (
    // Stuck to the window: the form on the right scrolls, this panel (photo and all) stays where it is.
    <aside className="sticky top-0 hidden h-screen w-[22rem] shrink-0 flex-col self-start overflow-hidden bg-navy text-white xl:flex">
      <img
        src="/images/hero-campus.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover object-center"
        loading="lazy"
        decoding="async"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy/75 via-navy/80 to-navy/95" />

      <div className="relative flex h-full flex-col px-8 py-8">
        <BrandMark tone="inverse" />

        <div key={stage} className="rise-in mt-14">
          <h2 className="font-serif text-[1.75rem] font-bold leading-tight tracking-tight [text-shadow:0_2px_14px_rgb(0_0_0/0.45)]">
            {copy.lead} <span className="text-sky">{copy.accent}</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">{copy.text}</p>
        </div>

        <ul className="mt-8 space-y-3">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-center gap-3.5 rounded-xl border border-white/15 bg-navy/40 px-4 py-3 backdrop-blur-sm">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sky">
                <p.icon className="size-[18px]" aria-hidden />
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">{p.title}</span>
                <span className="mt-0.5 block text-xs text-white/70">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-start gap-3 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sky">
            <Save className="size-[18px]" aria-hidden />
          </span>
          <p className="text-sm leading-snug">
            <span className="block font-semibold">Saved as you go</span>
            <span className="mt-0.5 block text-white/70">Leave any time and come back on any device. We pick up where you stopped.</span>
          </p>
        </div>
      </div>
    </aside>
  );
}

/**
 * Frame for a school admin whose school is not approved yet. Deliberately NOT the app shell:
 * no navigation, because nothing else is available to them until the school is approved.
 */
function Frame() {
  const { user, tenant, logout } = useAuth();
  if (!user) return null;
  const meta = tenant ? STATUS_META[tenant.approvalStatus] : null;

  return (
    <div className="flex min-h-screen bg-background">
      <SidePanel />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[4.5rem] shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="sm" className="xl:hidden" tagline={tenant?.name} />
            <h1 className="hidden text-lg font-semibold text-foreground xl:block">Onboarding</h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {tenant && <StatusBadge status={tenant.approvalStatus} className="hidden md:inline-flex" />}
            <div className="flex items-center gap-2.5 border-l border-border pl-3 sm:pl-4">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials(user.name) || "A"}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-40 truncate text-sm font-semibold text-foreground">{user.name}</span>
                <span className="block max-w-40 truncate text-xs text-foreground-muted">{tenant?.name ?? meta?.label}</span>
              </span>
              <button
                type="button"
                onClick={() => logout()}
                aria-label="Sign out"
                title="Sign out"
                className="ml-1 rounded-lg p-2 text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <LogOut className="size-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 lg:py-8">
          <Outlet />
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
