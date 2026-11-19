import { Link } from "react-router";
import { ArrowRight, LogIn } from "lucide-react";

/** Full-width campus photo under a navy wash, one headline, two ways in: Register your school (new) and Login (already registered). */
export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[560px] items-center justify-center overflow-hidden bg-navy lg:min-h-[680px]">
      <img src="/images/hero-campus.jpg" alt="" className="absolute inset-0 size-full object-cover object-center" fetchPriority="high" decoding="async" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy/80 via-navy/60 to-navy/90" />
      {/* A soft blue glow behind the headline pulls the eye to the middle of the page. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[38%] size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-[120px]"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-32 pt-16 text-center sm:px-6">
        <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-primary-soft shadow-lg backdrop-blur">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
          Registration is open for schools
        </p>

        <h1 className="text-balance font-serif text-4xl font-bold leading-[1.15] text-white [text-shadow:0_3px_18px_rgb(0_0_0/0.55)] sm:text-5xl md:text-6xl">
          Run your whole school from <span className="text-sky">one place</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-slate-200 sm:text-lg">
          Register your school, share a few details, and start once our team has approved it. It takes about five minutes.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            to="/signup"
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 text-sm font-bold text-primary-foreground shadow-[0_12px_28px_-6px_rgb(37_99_235/0.65)] transition-all hover:-translate-y-0.5 hover:bg-primary-hover sm:w-auto"
          >
            Register your school
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-8 text-sm font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
          >
            <LogIn className="size-4" aria-hidden />
            Login
          </Link>
        </div>
      </div>
    </section>
  );
}
