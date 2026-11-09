import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BookOpen, EllipsisVertical, FlaskConical, FolderTree, GraduationCap, Library, Plus, Settings2, UsersRound, type LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { useDismiss } from "../../hooks/useDismiss";
import { classRange, departmentIcon, keyOf, plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import type { ClassOverview } from "../../types";
import { Badge } from "../ui/Badge";
import { ClassOverviewCard } from "./ClassOverviewCard";
import { AbcBlocks, Duotone } from "./kidIcons";

type Picture = (props: { className?: string }) => ReactNode;
const filled = (icon: LucideIcon, name: string): Picture => {
  const FilledIcon: Picture = ({ className }) => <Duotone icon={icon} name={name} className={className} />;
  return FilledIcon;
};

/** The picture of the usual departments, as in the reference (ABC blocks, an open book); a school's own department gets its icon, filled. */
const DEPARTMENT_PICTURES: Record<string, Picture> = {
  "pre-primary": AbcBlocks,
  kindergarten: AbcBlocks,
  "pre-school": AbcBlocks,
  primary: filled(BookOpen, "open-book"),
  middle: filled(Library, "library"),
  secondary: filled(FlaskConical, "flask"),
  "senior secondary": filled(GraduationCap, "graduation-cap"),
};
const pictureOf = (name: string | null, departmentId: string): Picture =>
  (name && departmentId !== "none" ? DEPARTMENT_PICTURES[keyOf(name)] : undefined) ?? filled(name && departmentId !== "none" ? departmentIcon(name) : FolderTree, "department");

/** The badge has no navy: the classes in no department wear the neutral one. */
const BADGE_TONE: Record<Tone, "primary" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  navy: "neutral",
};

/** The department's ⋮ menu: its own screen (classes, sections, the department itself) and its students. */
function DepartmentMenu({ name, manageLabel, manageTo, studentsTo }: { name: string; manageLabel: string; manageTo: string; studentsTo: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`More for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
      >
        <EllipsisVertical className="size-5" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={name} className="pop-in absolute right-0 top-11 z-20 w-56 origin-top-right rounded-xl border border-border bg-surface p-1.5 shadow-float">
          <Link role="menuitem" to={manageTo} onClick={close} className={item}>
            <Settings2 className="size-4 text-foreground-muted" aria-hidden />
            {manageLabel}
          </Link>
          <Link role="menuitem" to={studentsTo} onClick={close} className={item}>
            <UsersRound className="size-4 text-foreground-muted" aria-hidden />
            View students
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * One department of the Classes page (2026-11-04, the user's reference design): a white panel with a stripe of the department's colour
 * on its left; on top its icon, its name, how many classes ("4 classes") and which ("Classes 1 to 4"), **Add class** (opens the
 * department's own screen, where classes are added to it) and a ⋮ menu (Manage the department, View its students); below, its classes as
 * cards, two to a row on a wide screen. `departmentId` is "none" for the classes in no department ("Other classes": no Add class); a
 * school with no departments at all has no `name`, so the panel has no top.
 */
export function DepartmentPanel({ name, departmentId, tone, classes }: { name: string | null; departmentId: string; tone: Tone; classes: ClassOverview[] }) {
  const t = TONES[tone];
  const Picture = pictureOf(name, departmentId);
  const range = classRange(classes.map((c) => c.name));
  const manageTo = `/school/classes/departments/${departmentId}`;

  return (
    <section aria-label={name ?? "Classes"} className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", t.line)} />
      <div className="space-y-4 py-4 pl-4 pr-3 sm:py-5 sm:pl-6 sm:pr-5">
        {name && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", t.tile)}>
              <Picture className="size-7" />
            </span>
            <div className="min-w-[10rem] flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground">{name}</h2>
                <Badge tone={BADGE_TONE[tone]}>{plural(classes.length, "class")}</Badge>
              </div>
              {range && <p className="mt-0.5 text-sm text-foreground-muted">{range}</p>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {departmentId !== "none" && (
                <Link
                  to={manageTo}
                  aria-label={`Add class to ${name}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-primary-deep shadow-sm transition-colors hover:border-[#bfdbfe] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                >
                  <Plus className="size-4" aria-hidden />
                  Add class
                </Link>
              )}
              <DepartmentMenu
                name={name}
                manageLabel={departmentId === "none" ? "Manage other classes" : `Manage ${name}`}
                manageTo={manageTo}
                studentsTo={`/school-class/students?department=${departmentId}`}
              />
            </div>
          </div>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {classes.map((c, index) => (
            <ClassOverviewCard key={c.id} overview={c} index={index} />
          ))}
        </ul>
      </div>
    </section>
  );
}
