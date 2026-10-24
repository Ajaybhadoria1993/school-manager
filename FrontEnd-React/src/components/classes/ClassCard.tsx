import { TONES, type Tone } from "../../constants/tones";
import { classMark, plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import type { ClassItem, SectionItem } from "../../types";
import { InfoTip } from "../ui/Hint";

/** What a section chip says when it is hovered: "B - 40 seats - Room 5B". */
const sectionSummary = (s: SectionItem) =>
  [s.name, s.capacity ? `${s.capacity} seats` : null, s.room].filter(Boolean).join(" - ");

/**
 * One class as a card in its department's colour: a bold mark, its name, how many sections and seats, and its sections as
 * chips. It only shows. Everything is changed from the **Manage** button of the department heading above it. Under the
 * pointer the card lifts, takes a soft tint of its department's colour and its mark tilts, so it is clear which card is hovered.
 */
export function ClassCard({ classItem, tone, index }: { classItem: ClassItem; tone: Tone; index: number }) {
  const t = TONES[tone];
  const { sections } = classItem;
  const seats = sections.reduce((sum, s) => sum + (s.capacity ?? 0), 0);

  return (
    <article
      className="stagger-item group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-float"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div
        aria-hidden
        className={cn("absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-transform duration-500 group-hover:scale-150", t.glow)}
      />
      {/* The tint that fades in under the pointer. It sits behind the content, so it never gets in the way of a click. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          t.glow
        )}
      />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold tracking-tight transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105",
              t.gradient
            )}
          >
            {classMark(classItem.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold tracking-tight text-foreground">{classItem.name}</h3>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {sections.length === 0 ? "No sections" : plural(sections.length, "section")}
              {seats > 0 && <> · {seats} seats</>}
            </p>
          </div>
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-1.5" aria-label={`Sections of ${classItem.name}`}>
          {sections.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted ring-1 ring-inset ring-border">
              No sections
              <InfoTip label="Does a class need sections?" className="size-4">
                No. Sections (A, B, C...) are only for a class that is split into groups. A class that sits together needs none.
              </InfoTip>
            </span>
          ) : (
            sections.map((s) => (
              <span
                key={s.id}
                title={sectionSummary(s)}
                className={cn(
                  "pop-in max-w-32 cursor-default truncate rounded-lg px-3 py-1 text-xs font-bold ring-1 ring-inset transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105",
                  t.chip
                )}
              >
                {s.name}
              </span>
            ))
          )}
        </div>
      </div>
    </article>
  );
}
