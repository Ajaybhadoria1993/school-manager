import type { ReactNode } from "react";
import { FolderTree, Layers, LayoutGrid, Rows3 } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";

/** Button looks for the dark hero: a frosted one for the quiet actions, a white one for the main action. */
export const heroGlass =
  "border border-white/25 bg-white/10 text-white shadow-none backdrop-blur hover:bg-white/20 hover:text-white";
export const heroSolid = "bg-white text-primary-deep shadow-[0_8px_20px_-6px_rgb(0_0_0/0.45)] hover:bg-white/90";

/** The deep-blue gradient of the page's top card (the dashboard's welcome banner); the padding is the caller's. */
export const heroSurface = "relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-[#14307a] to-primary text-white shadow-float";

/** The soft glows and the dot grid behind a hero's content; put it first inside a `heroSurface` card. */
export function HeroGlow() {
  return (
    <>
      <div aria-hidden className="float-slow absolute -right-10 -top-16 size-64 rounded-full bg-sky/25 blur-3xl" />
      <div aria-hidden className="float-slow absolute -bottom-20 left-1/3 size-72 rounded-full bg-primary/40 blur-3xl [animation-delay:-3s]" />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
      />
    </>
  );
}

const LEVELS: { icon: typeof Layers; label: string; example: string; tone: Tone }[] = [
  { icon: Layers, label: "Department", example: "Primary", tone: "info" },
  { icon: FolderTree, label: "Class", example: "Class 5", tone: "success" },
  { icon: Rows3, label: "Section", example: "5 - A", tone: "warning" },
];

/**
 * The top of the page, in the same deep-blue gradient as the dashboard's welcome banner: the title, the page's actions
 * (passed as children) and, on a wide screen, the three levels drawn as a staircase of floating glass tiles.
 */
export function ClassesHero({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className={cn(heroSurface, "p-6 sm:p-8")}>
      <HeroGlow />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            <LayoutGrid className="size-3.5 text-sky" aria-hidden />
            Manage school
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-200 sm:text-base">{description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">{children}</div>
        </div>

        <ol aria-hidden className="hidden shrink-0 space-y-3 lg:block">
          {LEVELS.map((level, i) => (
            <li
              key={level.label}
              className="stagger-item"
              style={{ "--i": i + 1, marginLeft: `${i * 2.25}rem` } as React.CSSProperties}
            >
              <div
                className="float-slow flex w-60 items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur"
                style={{ animationDelay: `${-i * 2}s` }}
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[level.tone].gradient)}>
                  <level.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{level.label}</span>
                  <span className="block text-xs text-slate-300">for example {level.example}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
