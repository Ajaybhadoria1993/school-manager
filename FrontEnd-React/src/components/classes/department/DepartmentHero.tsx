import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { PageBackNav } from "../../ui/PageBackNav";
import { HeroGlow, heroGlass, heroSurface } from "../ClassesHero";

export interface HeroFact {
  icon: LucideIcon;
  text: string;
}

const neighbour = cn(
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30",
  heroGlass
);

/**
 * The top of a department's own screen, in the same deep-blue gradient as the list page's banner: a Back button, the
 * department's mark (its icon in its colour), its name (with `action`, the small pencil, beside it), what is in it as frosted pills,
 * and the departments before and after it. The page puts nothing else in it.
 */
export function DepartmentHero({
  title,
  icon: Icon,
  tone,
  facts,
  backTo,
  backLabel,
  previous,
  next,
  action,
}: {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  facts: HeroFact[];
  backTo: string;
  backLabel: string;
  previous?: { name: string; to: string };
  next?: { name: string; to: string };
  /** Beside the name; it is drawn for a dark background. */
  action?: ReactNode;
}) {
  return (
    <section aria-label={`${title} at a glance`} className={cn(heroSurface, "p-5 sm:p-6")}>
      <HeroGlow />
      <div className="relative">
        <PageBackNav crumbs={[{ label: backLabel, to: backTo }, { label: title }]} onDark />

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-4">
          <span aria-hidden className={cn("flex size-16 shrink-0 items-center justify-center rounded-2xl", TONES[tone].gradient)}>
            <Icon className="size-8" />
          </span>

          <div className="min-w-0 flex-1 basis-56">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{title}</h1>
              {action}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {facts.map(({ icon: FactIcon, text }) => (
                <li
                  key={text}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
                >
                  <FactIcon className="size-3.5 text-sky" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {(previous || next) && (
            <div className="flex flex-wrap items-center gap-2">
              {previous && (
                <Link to={previous.to} className={neighbour}>
                  <ArrowLeft className="size-4" aria-hidden />
                  {previous.name}
                </Link>
              )}
              {next && (
                <Link to={next.to} className={neighbour}>
                  {next.name}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
