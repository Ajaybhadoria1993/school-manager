import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Popover } from "@heroui/react";
import { Check, DoorOpen, Plus, Search, Trash2, UserCog } from "lucide-react";
import { cn } from "../../utils/helpers";
import { matchChoices, type Spread, type SubjectChoice, type TeacherChoice } from "../../utils/timetable";
import { Input } from "../ui/Input";

/** One row of the list: a subject of the choices, or, last, the offer to make what was typed a new subject. */
type Row = { kind: "choice"; choice: SubjectChoice } | { kind: "create"; name: string };

/** What a row says under the subject's name: its usual teacher (and what is wrong with them then), or where the subject comes from. */
function detail(choice: SubjectChoice, teacher: string | null, trouble: string | null): { text: string; bad: boolean } {
  if (trouble) return { text: trouble, bad: true };
  if (choice.kind === "class") return { text: teacher ?? "No teacher yet", bad: false };
  if (choice.kind === "school") return { text: "In your school, not in this class yet", bad: false };
  return { text: "Usual subject, added to your school", bad: false };
}

/**
 * The box that opens on a period of the week: type the first letters of a subject, see what fits (the class's own subjects first, how
 * many periods each has in already, and a teacher who cannot take this period in red), and pick it with a click or Enter. Something
 * typed that is in no list can be added as a new subject. For a period that already has a lesson, the same box changes the subject, lists
 * the teachers to pick from (it says so when the school has none), and below that are the ways to set its room or to take it out. A
 * period with several subjects (a choice) sets a teacher for each in the window instead. It only says what was picked: the page puts it in the week.
 */
export function PeriodPicker({
  anchor,
  title,
  times,
  choices,
  current,
  teacherName,
  trouble,
  onChoose,
  onCreate,
  spread,
  teachers,
  onTeacher,
  onEditLesson,
  onTakeOut,
  onClose,
}: {
  /** The period (its button) the box opens beside. */
  anchor: RefObject<HTMLElement | null>;
  /** For example "Monday, Period 1". */
  title: string;
  /** For example "08:30 to 09:10". */
  times: string;
  choices: readonly SubjectChoice[];
  /** The subjects the period has now. */
  current: readonly string[];
  teacherName: (teacherId: string | null) => string | null;
  /** What is wrong with the subject's usual teacher at this period, or null. */
  trouble: (choice: SubjectChoice) => string | null;
  /** The page puts the subject in and closes the box (it may first have to add the subject to the school). */
  onChoose: (choice: SubjectChoice) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
  /** A Pre-Primary class: put the subject in this period all week (the usual way), in half of this day (before or after the lunch) or in the whole day. */
  spread?: { value: Spread; dayName: string; onChange: (next: Spread) => void };
  /** Only for a period with one lesson: its teachers (none: the school has no teacher), and what was picked. */
  teachers?: { subjectName: string; choices: readonly TeacherChoice[] };
  onTeacher?: (teacherId: string | null) => void;
  /** Only for a period that has a lesson. */
  onEditLesson?: () => void;
  onTakeOut?: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  // A subject that has to be added to the school first takes a moment: the box waits for it.
  const [busy, setBusy] = useState(false);
  // On a phone the box is a modal one that does not go away when the page moves (the keyboard coming up moves it), and the cursor is not
  // put in the search box (the list is shown first; the keyboard comes when the box is touched). Asked once, when the box opens.
  const [small] = useState(() => window.matchMedia?.("(max-width: 639px)").matches ?? false);

  const typed = text.trim().replace(/\s+/g, " ");
  const rows = useMemo<Row[]>(() => {
    const found = matchChoices(choices, typed);
    const exact = choices.some((c) => c.label.toLowerCase() === typed.toLowerCase());
    return [...found.map((choice): Row => ({ kind: "choice", choice })), ...(typed && !exact ? [{ kind: "create", name: typed } as Row] : [])];
  }, [choices, typed]);
  const at = Math.min(active, Math.max(rows.length - 1, 0));

  // The row the keys are on stays in sight. Only the list is scrolled, by hand: scrollIntoView could scroll the page too, and a box
  // beside a period closes when the page moves under it.
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-row="${at}"]`);
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = Math.max(row.offsetTop - 6, 0);
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 6;
  }, [at]);

  // A box that is not modal (so the next period can be clicked in one go) is closed by the browser only when the focus leaves it, which a
  // click on an empty part of the page does not do: so a press anywhere outside it, but on its own period, closes it.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target || root.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [anchor, onClose]);

  async function choose(row: Row | undefined) {
    if (!row || busy) return;
    setBusy(true);
    try {
      await (row.kind === "choice" ? onChoose(row.choice) : onCreate(row.name));
    } finally {
      setBusy(false);
    }
  }

  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(at + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(at - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choose(rows[at]);
    }
  }

  const filled = current.length > 0;

  return (
    <Popover.Content isOpen onOpenChange={(open) => !open && onClose()} triggerRef={anchor} isNonModal={!small} placement="bottom start" offset={6} className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-surface p-0 shadow-float">
      <Popover.Dialog ref={root} aria-label={`${title}: choose the subject`} className="flex max-h-[inherit] flex-col overflow-y-auto p-0 outline-none">
        <div className="shrink-0 border-b border-border px-3.5 pb-3 pt-3">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-bold text-foreground">{title}</span>
            <span className="text-xs text-foreground-muted">{times}</span>
          </p>
          {spread && (
            <div role="radiogroup" aria-label="Put the subject in" className="mt-2 grid grid-cols-3 gap-0.5 rounded-lg bg-surface-muted p-0.5">
              {(["week", "half", "day"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={spread.value === v}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => spread.onChange(v)}
                  className={cn(
                    "h-7 cursor-pointer truncate rounded-md px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    spread.value === v ? "bg-surface text-primary-deep shadow-sm" : "text-foreground-muted hover:text-foreground"
                  )}
                >
                  {v === "week" ? "This period" : v === "half" ? `Half ${spread.dayName}` : `Whole ${spread.dayName}`}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2">
            <Input
              autoFocus={!small}
              icon={Search}
              role="combobox"
              aria-label="Subject for this period"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-autocomplete="list"
              aria-activedescendant={rows.length > 0 ? `${uid}-row-${at}` : undefined}
              autoComplete="off"
              placeholder={filled ? "Type to change the subject" : "Type a subject"}
              value={text}
              readOnly={busy}
              onChange={(e) => {
                setText(e.target.value);
                setActive(0);
              }}
              onKeyDown={keys}
              className="h-9"
            />
          </div>
        </div>

        <ul id={`${uid}-list`} ref={list} role="listbox" aria-label="Subjects" aria-busy={busy} className={cn("relative min-h-20 overflow-y-auto p-1.5", teachers ? "max-h-40" : "max-h-64", busy && "pointer-events-none opacity-60")}>
          {rows.map((row, i) => {
            const isActive = i === at;
            const common = {
              id: `${uid}-row-${i}`,
              role: "option" as const,
              "aria-selected": isActive,
              "data-row": i,
              // The mouse must not take the focus from the box: typing goes on after a hover or a click.
              onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
              onMouseMove: () => setActive(i),
              onClick: () => void choose(row),
            };
            if (row.kind === "create") {
              return (
                <li key="create" {...common} aria-label={`Add “${row.name}” as a new subject`} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-primary-deep", isActive && "bg-primary-soft")}>
                  <Plus className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">Add “{row.name}” as a new subject</span>
                </li>
              );
            }
            const { choice } = row;
            const here = current.includes(choice.value);
            const info = detail(choice, teacherName(choice.teacherId), trouble(choice));
            return (
              <li key={choice.value} {...common} aria-label={choice.label} aria-describedby={`${uid}-d-${i}`} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5", isActive && "bg-primary-soft")}>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm text-foreground", here ? "font-bold text-primary-deep" : "font-semibold")}>{choice.label}</span>
                  <span id={`${uid}-d-${i}`} className={cn("block truncate text-xs", info.bad ? "font-medium text-danger" : "text-foreground-muted")}>
                    {info.text}
                  </span>
                </span>
                {choice.kind === "class" && choice.periodsPerWeek > 0 && (
                  <span className={cn("shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums", choice.placed >= choice.periodsPerWeek ? "text-success" : "text-foreground-muted")} title="Periods in the week now, of the periods a week it was given">
                    {choice.placed}/{choice.periodsPerWeek}
                  </span>
                )}
                {here && <Check className="size-4 shrink-0 text-primary" aria-label="In this period now" />}
              </li>
            );
          })}
        </ul>

        {teachers && (
          <div className="flex shrink-0 flex-col border-t border-border p-1.5">
            <p className="shrink-0 px-2.5 pb-0.5 pt-1 text-xs font-bold uppercase tracking-wide text-foreground-muted">Teacher</p>
            {teachers.choices.length === 0 ? (
              <p className="px-2.5 py-1.5 text-sm font-medium text-foreground-muted">No teacher available in your school</p>
            ) : (
              <div role="radiogroup" aria-label={`Teacher for ${teachers.subjectName}`} className="max-h-36 overflow-y-auto">
                {teachers.choices.map((c) => (
                  <button
                    key={c.value ?? "usual"}
                    type="button"
                    role="radio"
                    aria-checked={c.selected}
                    aria-label={c.label}
                    disabled={c.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onTeacher?.(c.value)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm text-foreground", c.selected ? "font-bold text-primary-deep" : "font-semibold")}>{c.label}</span>
                      {c.note && <span className={cn("block truncate text-xs", c.bad ? "font-medium text-danger" : "text-foreground-muted")}>{c.note}</span>}
                    </span>
                    {c.selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filled && (onEditLesson || onTakeOut) && (
          <div className="flex shrink-0 items-center gap-1.5 border-t border-border bg-surface-muted/50 p-2">
            {onEditLesson && (
              <button type="button" onClick={onEditLesson} className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {teachers ? <DoorOpen className="size-4" aria-hidden /> : <UserCog className="size-4" aria-hidden />}
                {teachers ? "Room" : "Teacher & room"}
              </button>
            )}
            {onTakeOut && (
              <button type="button" onClick={onTakeOut} className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20">
                <Trash2 className="size-4" aria-hidden />
                Take it out
              </button>
            )}
          </div>
        )}
      </Popover.Dialog>
    </Popover.Content>
  );
}
