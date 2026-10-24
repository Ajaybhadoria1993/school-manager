import { Link } from "react-router";
import { ArrowRight, Clock, Mail, Save } from "lucide-react";
import { cn } from "../../utils/helpers";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    label: "Register",
    title: "Register with your email",
    text: "Tell us your school's name and email. We send you a link to confirm that the address is yours.",
    tone: "primary",
  },
  {
    label: "Confirm",
    title: "Create your account",
    text: "Open the link, choose a name and a password, and you are signed in as the school administrator.",
    tone: "primary",
  },
  {
    label: "Onboard",
    title: "Share your school's details",
    text: "Four short steps: the school, its address, you and your classes, then a last look before you send.",
    tone: "primary",
  },
  {
    label: "Approval",
    title: "Get approved",
    text: "Our team checks the details. You get an email, and your dashboard opens as soon as the school is approved.",
    tone: "success",
  },
] as const;

const FOOTERS = [
  <Link key="1" to="/signup" className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-colors hover:text-primary-deep">
    Start here <ArrowRight className="size-3.5" aria-hidden />
  </Link>,
  <span key="2" className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
    <Mail className="size-3.5" aria-hidden /> The link works once
  </span>,
  <span key="3" className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
    <Save className="size-3.5" aria-hidden /> Saved after every step
  </span>,
  <span key="4" className="inline-flex items-center gap-1.5 text-xs text-foreground-muted">
    <Clock className="size-3.5" aria-hidden /> You hear from us either way
  </span>,
];

/** The registration journey as four numbered cards. */
export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-surface py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            align="left"
            eyebrow="From sign-up to dashboard"
            title="How registration works"
            description="Four steps, and nothing is created until you confirm your email."
          />
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-primary-deep"
          >
            Register your school <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col justify-between rounded-xl border border-border bg-background p-6 transition-colors hover:border-primary"
            >
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className={cn(
                      "min-w-[54px] rounded-lg p-2.5 text-center text-white",
                      step.tone === "success" ? "bg-success" : "bg-primary"
                    )}
                    aria-hidden
                  >
                    <span className="block text-lg font-bold leading-none">{i + 1}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider">Step</span>
                  </span>
                  <span className={cn("text-[11px] font-bold uppercase", step.tone === "success" ? "text-success" : "text-primary")}>
                    {step.label}
                  </span>
                </div>
                <h3 className="mb-2 text-base font-bold text-foreground">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-foreground-muted">{step.text}</p>
              </div>
              {FOOTERS[i]}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
