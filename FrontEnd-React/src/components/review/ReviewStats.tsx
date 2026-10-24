import { BookOpenCheck, CalendarDays, GraduationCap, Layers, type LucideIcon } from "lucide-react";
import { useCountUp } from "../../hooks/useMotion";
import { boardLabel, formatClassRange, MONTHS } from "../../constants/schoolOptions";
import { classCount } from "../../utils/review";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import type { SchoolSteps } from "../../types";

function Value({ value }: { value: number | string | null }) {
  const counted = useCountUp(typeof value === "number" ? value : 0);
  if (value === null) return <span className="text-foreground-muted/60">-</span>;
  return <>{typeof value === "number" ? counted.toLocaleString("en-IN") : value}</>;
}

/** One number about the school: it counts up, the card lifts on hover and a coloured line draws along its bottom. */
function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number | string | null;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
  index: number;
}) {
  const t = TONES[tone];
  return (
    <div
      className="stagger-item group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-float"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div aria-hidden className={cn("absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br to-transparent blur-xl", t.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-muted">{label}</p>
          <p className="mt-1 truncate text-3xl font-extrabold tracking-[-0.03em] text-foreground">
            <Value value={value} />
          </p>
        </div>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110", t.tile)}>
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
      <p className="relative mt-2 truncate text-xs text-foreground-muted">{hint}</p>
      <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-1 origin-left scale-x-[0.18] transition-transform duration-500 ease-out group-hover:scale-x-100", t.line)} />
    </div>
  );
}

/** The four numbers a reviewer looks at first. */
export function ReviewStats({ s1 }: { s1: SchoolSteps[1] }) {
  const classes = classCount(s1.lowestClass, s1.highestClass);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        index={1}
        label="Students"
        value={s1.approxStudents}
        hint={s1.approxStudents ? "About, as the school says" : "Not given"}
        icon={GraduationCap}
        tone="primary"
      />
      <Tile
        index={2}
        label="Classes"
        value={classes}
        hint={formatClassRange(s1.lowestClass, s1.highestClass) || "Not given"}
        icon={Layers}
        tone="info"
      />
      <Tile
        index={3}
        label="Boards"
        value={s1.boards.length > 0 ? s1.boards.length : null}
        hint={s1.boards.map(boardLabel).join(", ") || "None added"}
        icon={BookOpenCheck}
        tone="success"
      />
      <Tile
        index={4}
        label="Session starts"
        value={MONTHS[s1.sessionStartMonth - 1] ?? null}
        hint="The academic year begins"
        icon={CalendarDays}
        tone="warning"
      />
    </div>
  );
}
