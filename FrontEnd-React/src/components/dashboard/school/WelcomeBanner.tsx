import { useState } from "react";
import { Link } from "react-router";
import {
  BadgeIndianRupee,
  CalendarCheck,
  GraduationCap,
  Megaphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  // {
  //   label: "Mark attendance",
  //   href: "/modules/attendance",
  //   icon: CalendarCheck,
  // },
  { label: "Add a student", href: "/modules/students", icon: GraduationCap },
  // { label: "Collect a fee", href: "/modules/fees", icon: BadgeIndianRupee },
  { label: "Send a notice", href: "/modules/notices", icon: Megaphone },
];

/**
 * The first thing on the dashboard: a greeting, the school's status, and four shortcuts. They lead to previews of modules not built
 * yet, except "Add a student", which opens the admission form for the people who admit students (`addStudentHref`).
 */
export function WelcomeBanner({
  firstName,
  schoolName,
  addStudentHref,
  children,
}: {
  firstName: string;
  schoolName: string;
  /** Where "Add a student" leads when the person may admit students; the preview otherwise. */
  addStudentHref?: string;
  /** Shown under the greeting: the current academic year. */
  children?: React.ReactNode;
}) {
  const actions = ACTIONS.map((a) => (a.href === "/modules/students" && addStudentHref ? { ...a, href: addStudentHref } : a));
  const [hour] = useState(() => new Date().getHours());
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-[#14307a] to-primary p-6 text-white shadow-float sm:p-8">
      {/* Soft shapes that drift slowly */}
      <div
        aria-hidden
        className="float-slow absolute -right-10 -top-16 size-64 rounded-full bg-sky/25 blur-3xl"
      />
      <div
        aria-hidden
        className="float-slow absolute -bottom-20 left-1/3 size-72 rounded-full bg-primary/40 blur-3xl [animation-delay:-3s]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
      />

      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
          <ShieldCheck className="size-3.5 text-emerald-300" aria-hidden />
          Approved and live
        </p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">
          {schoolName} is approved and live on EduShiksha.
        </p>
        {children && <div className="mt-3">{children}</div>}

        <ul
          className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap"
          aria-label="Shortcuts"
        >
          {actions.map((a, i) => (
            <li
              key={a.href}
              className="stagger-item"
              style={{ "--i": i + 2 } as React.CSSProperties}
            >
              <Link
                to={a.href}
                className="group flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20"
              >
                <a.icon
                  className="size-4 text-sky transition-transform group-hover:scale-125"
                  aria-hidden
                />
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
