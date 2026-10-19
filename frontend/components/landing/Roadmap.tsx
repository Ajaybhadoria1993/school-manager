import { BadgeIndianRupee, CalendarCheck, UsersRound, Briefcase } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const MODULES = [
  {
    icon: UsersRound,
    title: "Students and admissions",
    text: "Student records, admissions and class lists for every section.",
  },
  {
    icon: Briefcase,
    title: "Staff and teachers",
    text: "Invite your principal, teachers and office staff, and give each the right access.",
  },
  {
    icon: CalendarCheck,
    title: "Attendance",
    text: "Mark attendance class by class and keep a clear daily record.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Fees and receipts",
    text: "Set up fee structures, record payments and hand out receipts.",
  },
];

/** What is planned after the platform itself, labelled as planned. */
export function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-20 border-t border-border bg-surface-muted/70 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <SectionHeading
          eyebrow="On the roadmap"
          title="Built step by step"
          description="The platform opens first. The school modules arrive one at a time, and this is the order we plan to build them."
        />

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <li
              key={m.title}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-shadow hover:shadow-raised"
            >
              <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-primary-soft to-surface-muted">
                <span className="absolute left-3 top-3 rounded bg-primary px-2.5 py-1 text-[11px] font-bold text-white">Planned</span>
                <span className="flex size-16 items-center justify-center rounded-2xl bg-surface text-primary shadow-raised transition-transform duration-300 group-hover:scale-105">
                  <m.icon className="size-8" aria-hidden />
                </span>
              </div>
              <div className="p-5">
                <h3 className="mb-2 text-base font-bold text-foreground">{m.title}</h3>
                <p className="text-sm leading-relaxed text-foreground-muted">{m.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
