import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Full-width campus photo under a navy wash, one headline, two ways in. */
export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[560px] items-center justify-center overflow-hidden bg-navy lg:min-h-[660px]">
      <Image src="/images/hero-campus.jpg" alt="" fill priority sizes="100vw" className="object-cover object-center" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy/75 via-navy/65 to-navy/90" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 pb-28 pt-14 text-center sm:px-6">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-primary-soft shadow-lg backdrop-blur">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
          Registration is open for schools
        </p>

        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-white [text-shadow:0_3px_18px_rgb(0_0_0/0.55)] sm:text-5xl md:text-6xl">
          Run your whole school from one place
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
          Register your school, share a few details, and start once our team has approved it. It takes about five minutes.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/signup"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-7 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-6px_rgb(37_99_235/0.6)] transition-all hover:-translate-y-0.5 hover:bg-primary-hover sm:w-auto"
          >
            Register your school
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/25 bg-white/15 px-7 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
