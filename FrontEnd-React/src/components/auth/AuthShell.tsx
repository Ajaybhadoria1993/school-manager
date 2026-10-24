import { Link } from "react-router";
import {
  BadgeIndianRupee,
  CalendarCheck,
  ClipboardCheck,
  ListChecks,
  MailCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "../brand/BrandMark";
import { FilledControls } from "../ui/Input";

type Point = { icon: LucideIcon; title: string; text: string };

// Plain words, no jargon. Sign-in shows what is coming to the school (none of it is built yet, so it is labelled
// as coming); registration shows what happens next, which is all real.
const PANELS: Record<
  "signin" | "register",
  { label: string; points: Point[] }
> = {
  signin: {
    label: "Coming to your school",
    points: [
      {
        icon: ClipboardCheck,
        title: "Attendance in one tap",
        text: "Teachers mark it, and parents are told the same minute.",
      },
      {
        icon: BadgeIndianRupee,
        title: "Fees without the chasing",
        text: "Reminders and receipts go out on their own.",
      },
      {
        icon: Sparkles,
        title: "Smart help with AI",
        text: "Report-card remarks and parent notes written in seconds.",
      },
    ],
  },
  register: {
    label: "What happens next",
    points: [
      {
        icon: MailCheck,
        title: "Confirm your email",
        text: "Nothing is created until you open the link we send.",
      },
      {
        icon: ListChecks,
        title: "Four short steps",
        text: "School, address, classes and you. Saved as you go.",
      },
      {
        icon: CalendarCheck,
        title: "Approved by a person",
        text: "Your dashboard opens once our team approves.",
      },
    ],
  },
};

const HEADLINE = "One place for your whole school.";

/**
 * Full-screen split used by sign-in, registration, invitation and password screens.
 * On the left, the same campus photo and navy wash as the landing page hero; on the right, the form.
 * On a phone the photo becomes a slim banner above the form. The logo links back to the landing page.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  variant = "signin",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Which short list of points the left panel shows. */
  variant?: "signin" | "register";
}) {
  return (
    <div
      className="min-h-screen bg-surface lg:grid lg:grid-cols-12"
    >
      {/* The product, on a campus photo */}
      <section className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-navy p-10 text-white lg:col-span-5 lg:flex lg:min-h-screen xl:px-14">
        <img
          src="/images/hero-campus.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover object-center"
          fetchPriority="high"
          decoding="async"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-navy/75 via-navy/70 to-navy/95"
        />

        <p className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          EduShiksha Portal
        </p>

        <div className="relative">
          <h2 className="font-serif text-4xl font-bold leading-tight tracking-tight [text-shadow:0_2px_14px_rgb(0_0_0/0.45)]">
            One place for your whole <span className="text-sky">school.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-200">
            Register your school, share a few details, and start once our team
            has approved it.
          </p>
        </div>

        <div className="relative">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-sky">
            {PANELS[variant].label}
          </p>
          <ul className="space-y-3">
            {PANELS[variant].points.map((p) => (
              <li
                key={p.title}
                className="flex items-center gap-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-[0_6px_14px_-4px_rgb(37_99_235/0.7)]">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <span className="leading-tight">
                  <span className="block text-[15px] font-bold">{p.title}</span>
                  <span className="mt-1 block text-[13px] text-slate-200">
                    {p.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The form */}
      <section className="flex min-h-screen min-w-0 flex-col lg:col-span-7">
        <div
          className="relative h-32 overflow-hidden bg-navy lg:hidden"
          aria-hidden
        >
          <img
            src="/images/hero-campus.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover object-center"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-navy/70 to-navy/90" />
          <p className="relative flex h-full items-end px-6 pb-4 font-serif text-xl font-bold leading-snug text-white">
            {HEADLINE}
          </p>
        </div>

        <header className="px-6 pt-6 sm:px-12 sm:pt-8 lg:px-16">
          <BrandMark />
        </header>

        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
          <div className="rise-in mx-auto w-full max-w-xl">
            <h1 className="font-serif text-[1.75rem] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2.5 max-w-md text-sm leading-relaxed text-foreground-muted">
                {subtitle}
              </p>
            )}

            <div className="mt-8">
              <FilledControls>{children}</FilledControls>
            </div>
          </div>
        </div>

        <footer className="border-t border-border bg-primary-soft/60 px-6 py-5 text-center text-sm text-foreground-muted sm:px-12 lg:px-16">
          {footer ?? (
            <Link
              to="/login"
              className="font-semibold text-primary hover:underline"
            >
              Back to sign in
            </Link>
          )}
        </footer>
      </section>
    </div>
  );
}
