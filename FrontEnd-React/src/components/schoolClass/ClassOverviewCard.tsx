import type { ReactNode } from "react";
import { Link } from "react-router";
import { Armchair, Baby, ChevronRight, Layers, Star, UsersRound, type LucideIcon } from "lucide-react";
import { classMark, keyOf, plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import type { ClassOverview } from "../../types";
import { AbcBlocks, BearFace, Duotone, RockingHorse } from "./kidIcons";

/** The classes of a department take these colours in turn (the mark, and the seats bar), like the user's reference design (2026-11-04). */
const CLASS_COLOURS = [
  { mark: "bg-blue-100 text-blue-600", bar: "bg-blue-500" },
  { mark: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-500" },
  { mark: "bg-violet-100 text-violet-600", bar: "bg-violet-500" },
  { mark: "bg-orange-100 text-orange-500", bar: "bg-orange-400" },
  { mark: "bg-sky-100 text-sky-600", bar: "bg-sky-500" },
  { mark: "bg-rose-100 text-rose-500", bar: "bg-rose-400" },
] as const;

type Picture = (props: { className?: string }) => ReactNode;
const StarPicture: Picture = ({ className }) => <Duotone icon={Star} name="star" className={className} />;
const BabyPicture: Picture = ({ className }) => <Duotone icon={Baby} name="baby" className={className} />;

/** A picture for the usual early classes, as in the reference (a rocking horse, a bear, ABC blocks, a star); other classes show their number or initials. */
const CLASS_PICTURES: Record<string, Picture> = {
  "pre-nursery": RockingHorse,
  playgroup: BabyPicture,
  nursery: BearFace,
  lkg: AbcBlocks,
  ukg: StarPicture,
};

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One fact of the card's line ("48 Students"), with the line before it on a wide card ("|"); on a narrow one the facts wrap without it. */
function Fact({ icon: Icon, first = false, children }: { icon: LucideIcon; first?: boolean; children: ReactNode }) {
  return (
    <>
      {!first && <span aria-hidden className="hidden h-3 w-px bg-border xl:block" />}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Icon className="size-3.5" aria-hidden />
        {children}
      </span>
    </>
  );
}

/**
 * One class of the Classes page (2026-11-04, after the user's reference design), a card of its department's panel: a round mark in the
 * class's own colour (its number, its initials, or a picture for the early classes), the name, "48 Students | 2 Sections | 120 Seats",
 * how full its seats are (a bar and the per cent) and a chevron. The seats are the class's limit from the server: its sections' seats added
 * up, or its own when it has no sections; with no limit set there are no seats and no bar. The name is the link that opens the class,
 * stretched over the whole card, so a click anywhere opens it and the keyboard and a new tab work.
 */
export function ClassOverviewCard({ overview, index }: { overview: ClassOverview; index: number }) {
  const { id, name, students, sections, seats, seatsLeft, percent } = overview;
  const colour = CLASS_COLOURS[index % CLASS_COLOURS.length];
  const PictureOf = CLASS_PICTURES[keyOf(name)];
  const mark = classMark(name);

  return (
    <li
      className="stagger-item group relative flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3.5 transition-all duration-200 focus-within:ring-4 focus-within:ring-primary/20 hover:border-[#cbd5e1] hover:shadow-card sm:gap-4 sm:px-4"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-full font-extrabold tracking-tight sm:size-12", colour.mark, mark.length > 2 ? "text-sm" : "text-xl sm:text-2xl")}>
        {PictureOf ? <PictureOf className="size-6 sm:size-7" /> : mark}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-bold tracking-tight text-foreground">
          <Link
            to={`/school-class/${id}`}
            aria-label={`${name}: ${plural(students, "student")}, ${sections.length === 0 ? "no sections" : plural(sections.length, "section")}`}
            className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none"
          >
            {name}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground-muted xl:gap-x-2.5">
          <Fact icon={UsersRound} first>
            {count(students, "Student")}
          </Fact>
          {sections.length > 0 && <Fact icon={Layers}>{count(sections.length, "Section")}</Fact>}
          {seats > 0 && <Fact icon={Armchair}>{count(seats, "Seat")}</Fact>}
        </p>
        {seats > 0 && (
          <div className="mt-2 flex items-center gap-3" title={`${percent}% of ${seats} seats filled · ${seatsLeft} left`}>
            <div
              role="progressbar"
              aria-label={`Seats of ${name} filled`}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
            >
              <div className={cn("h-full rounded-full transition-[width] duration-500", percent >= 100 ? "bg-danger" : colour.bar)} style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-bold text-foreground">{percent}%</span>
          </div>
        )}
      </div>

      <ChevronRight aria-hidden className="size-4 shrink-0 text-foreground-muted transition-transform group-hover:translate-x-0.5 sm:size-5" />
    </li>
  );
}
