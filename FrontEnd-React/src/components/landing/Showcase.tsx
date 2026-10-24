import { Link } from "react-router";
import { ArrowRight, Check, Save } from "lucide-react";

const POINTS = [
  "Four short steps cover your school, its address, your classes and your own details.",
  "Every step is saved on our server, so you can stop and carry on from any device.",
  "A person on our team reviews the details, and you get an email either way.",
];

const CHECKS = [
  { value: "11 digits", label: "UDISE+ code, checked for format" },
  { value: "6 digits", label: "PIN code, checked for format" },
];

/** Two alternating photo-and-text rows on a soft grey band. */
export function Showcase() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-border bg-surface-muted/70 py-20">
      <div className="mx-auto max-w-7xl space-y-24 px-4 sm:px-8">
        {/* Row 1 */}
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="relative lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border-4 border-white shadow-modal">
              <img
                src="/images/auth-campus.jpg"
                alt="A smiling student holding books and a tablet in a bright library"
                width={1100}
                height={821}
                className="h-auto w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="absolute -bottom-6 -right-4 hidden items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-float sm:flex">
              <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
                <Save className="size-5" aria-hidden />
              </span>
              <p className="leading-tight">
                <span className="block text-xs font-medium text-foreground-muted">Saved as you go</span>
                <span className="block text-sm font-bold text-foreground">Resume on any device</span>
              </p>
            </div>
          </div>

          <div className="lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">For principals and administrators</p>
            <h2 className="mt-2 font-serif text-3xl font-bold leading-snug tracking-tight text-foreground sm:text-4xl">
              Everything about your school, in one place
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-foreground-muted sm:text-base">
              Tell us about your school once. We keep it safe, check it, and turn it into your school&apos;s dashboard, the starting point
              for everything that comes next.
            </p>
            <ul className="mb-8 mt-6 space-y-3.5 text-sm text-foreground">
              {POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <a href="#how" className="inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-deep">
              See how registration works
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="order-2 lg:order-1 lg:col-span-6">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Made for India</p>
            <h2 className="mt-2 font-serif text-3xl font-bold leading-snug tracking-tight text-foreground sm:text-4xl">
              Fields that match how Indian schools are run
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-foreground-muted sm:text-base">
              Choose your board (CBSE, ICSE, State Board or IB), enter your UDISE+ code and PIN code, and say which month your academic
              session starts. Each one is checked on our server, so mistakes are caught before anyone reads the form.
            </p>
            <div className="mb-8 mt-6 grid grid-cols-2 gap-4">
              {CHECKS.map((c) => (
                <div key={c.value} className="rounded-xl border border-border bg-surface p-4">
                  <p className="mb-1 text-2xl font-bold tracking-tight text-primary">{c.value}</p>
                  <p className="text-xs font-medium text-foreground-muted">{c.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/signup"
                className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-colors hover:bg-primary-hover"
              >
                Register your school
              </Link>
              <span className="text-xs text-foreground-muted">It takes about five minutes.</span>
            </div>
          </div>

          <div className="order-1 lg:order-2 lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border-4 border-white shadow-modal">
              <img
                src="/images/school-collab.jpg"
                alt="Students and a teacher working together with tablets"
                width={1376}
                height={768}
                className="h-auto w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
