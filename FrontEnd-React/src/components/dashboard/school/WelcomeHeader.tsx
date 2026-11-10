import { useState } from "react";
import { Link } from "react-router";
import { GraduationCap, Megaphone, type LucideIcon } from "lucide-react";

/** The page's two shortcuts as links, in the look of the primary and the outline button (the same as the Students page). */
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const ACTIONS: { label: string; href: string; icon: LucideIcon; main?: boolean }[] = [
  { label: "Add a student", href: "/modules/students", icon: GraduationCap, main: true },
  { label: "Send a notice", href: "/modules/notices", icon: Megaphone },
];

/**
 * The top of the dashboard: a plain greeting and two shortcuts. "Add a student" opens the admission form for the people who
 * admit students (`addStudentHref`), and the preview of the module for everyone else; "Send a notice" opens its preview.
 */
export function WelcomeHeader({
  firstName,
  schoolName,
  addStudentHref,
  shortcuts = true,
}: {
  firstName: string;
  schoolName: string;
  /** False for a person who has none of these to use (a teacher). */
  shortcuts?: boolean;
  /** Where "Add a student" leads when the person may admit students; the preview otherwise. */
  addStudentHref?: string;
}) {
  const [hour] = useState(() => new Date().getHours());
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-page-heading">
          {greeting}, {firstName}
        </h1>
        <p className="mt-0.5 text-sm text-foreground-muted">Here's what's happening at {schoolName} today.</p>
      </div>
      {shortcuts && (
      <nav aria-label="Shortcuts" className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            to={a.href === "/modules/students" && addStudentHref ? addStudentHref : a.href}
            className={a.main ? primaryLink : outlineLink}
          >
            <a.icon className="size-4" aria-hidden />
            {a.label}
          </Link>
        ))}
      </nav>
      )}
    </header>
  );
}
