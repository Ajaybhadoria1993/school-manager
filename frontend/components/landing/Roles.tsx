import { BriefcaseBusiness, GraduationCap, School, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "./SectionHeading";

const ROLES = [
  {
    icon: School,
    title: "School administrator",
    text: "Registers the school, completes onboarding, and owns the school's dashboard.",
    available: true,
  },
  {
    icon: UserRound,
    title: "Principal",
    text: "Invited by email to oversee the school and its records.",
    available: false,
  },
  {
    icon: GraduationCap,
    title: "Teachers",
    text: "Invited by email to see their own classes and take attendance.",
    available: false,
  },
  {
    icon: BriefcaseBusiness,
    title: "Office staff",
    text: "Invited by email to help with admissions, fees and records.",
    available: false,
  },
];

/** Who uses the platform: what is open today and what arrives next, said plainly. */
export function Roles() {
  return (
    <section id="roles" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-20 sm:px-8">
      <SectionHeading
        eyebrow="Who it's for"
        title="Built for everyone who runs a school"
        description="The school administrator can start today. The rest of your team joins by email invitation, which is the next thing we are building."
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <li
            key={role.title}
            className="rounded-xl border border-border bg-surface p-6 text-center shadow-card transition-shadow hover:shadow-raised"
          >
            <span className="mx-auto mb-4 flex size-24 items-center justify-center rounded-full border-2 border-primary p-1">
              <span className="flex size-full items-center justify-center rounded-full bg-primary-soft text-primary">
                <role.icon className="size-9" aria-hidden />
              </span>
            </span>
            <h3 className="text-base font-bold text-foreground">{role.title}</h3>
            <p className="mb-4 mt-2 text-sm leading-relaxed text-foreground-muted">{role.text}</p>
            <Badge tone={role.available ? "success" : "neutral"}>{role.available ? "Available now" : "Coming next"}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
