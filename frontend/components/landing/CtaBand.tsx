import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The last nudge before the footer. */
export function CtaBand() {
  return (
    <section className="bg-panel py-14 text-white" aria-labelledby="cta-title">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-4 sm:px-8 lg:flex-row">
        <div className="text-center lg:text-left">
          <h2 id="cta-title" className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            Begin your school&apos;s journey with EduShiksha
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            Register your school today. Our team reviews every school, and your dashboard opens as soon as it is approved.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-7 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-6px_rgb(37_99_235/0.6)] transition-colors hover:bg-primary-hover sm:w-auto"
          >
            Register your school
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/25 bg-white/10 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/20 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
