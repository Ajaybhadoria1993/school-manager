import { Database, GraduationCap, ShieldCheck, UserCheck } from "lucide-react";
import { cn } from "../../utils/helpers";

// Each line is true of the product today.
const ITEMS = [
  {
    icon: GraduationCap,
    tone: "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white",
    title: "Made for Indian schools",
    text: "UDISE+ code, board, PIN code and session start month are built into the forms.",
  },
  {
    icon: Database,
    tone: "bg-success-soft text-success group-hover:bg-success group-hover:text-white",
    title: "Every school kept apart",
    text: "Each school's data lives in its own space. People only ever see their own school.",
  },
  {
    icon: UserCheck,
    tone: "bg-info-soft text-info group-hover:bg-info group-hover:text-white",
    title: "Reviewed by a person",
    text: "A school opens only after our team has checked its details and approved it.",
  },
  {
    icon: ShieldCheck,
    tone: "bg-surface-muted text-navy group-hover:bg-navy group-hover:text-white",
    title: "Protected sign-in",
    text: "Hashed passwords, short-lived sessions, and email links that work only once.",
  },
];

/** Four cards that overlap the bottom edge of the hero. */
export function Highlights() {
  return (
    <section className="relative z-30 mx-auto -mt-14 max-w-7xl px-4 sm:px-8" aria-label="Why EduShiksha">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <li
            key={item.title}
            className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 shadow-float transition-shadow hover:shadow-modal"
          >
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors", item.tone)}>
              <item.icon className="size-6" aria-hidden />
            </span>
            <div>
              <h3 className="mb-1 text-sm font-bold text-foreground">{item.title}</h3>
              <p className="text-xs leading-relaxed text-foreground-muted">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
