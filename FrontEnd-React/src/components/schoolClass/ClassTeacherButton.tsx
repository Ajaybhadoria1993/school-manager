import { useCallback, useState } from "react";
import { ChevronDown, Search, UserMinus, UserPlus, UserRound, UserRoundCheck } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { useGetTeachersQuery, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { ConfirmModal } from "../classes/ConfirmModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

/**
 * The class teacher of a class or section, on the class's own page, beside the title (2026-11-13): with none it is a button **Add class teacher**,
 * with one it is "Class teacher: Meena Singh" and the same button **replaces** them. It opens a list of the school's teachers (read only when it is
 * opened) that can be searched; a teacher who is already the class teacher of another class says so with a tag, the current one says "Current".
 * Choosing a teacher who is nobody's class teacher, where there was none, is done at once. Anything else asks first, in a window that says what
 * happens: the class teacher who is there now will no longer be, and a teacher who is the class teacher of another class is **taken off it** (that
 * class has none then): one request (\`releaseOthers\`), all or nothing. Who may change it, and whether the year allows it, is the page's to say.
 *
 * `look="button"` (2026-11-17, the class timetable's toolbar) is the height and shape of the other buttons of that row instead of the small pill beside a
 * title; `onAssigned` tells the page who the class teacher is now (the toolbar does not read the week again, which would throw away unsaved lessons).
 * A class that has a class teacher also has **No class teacher** at the foot of the list (2026-11-17): it asks first, naming them, and takes them away
 * (one request with no teacher); `onAssigned` then says null.
 */
export function ClassTeacherButton({
  classId,
  sectionId,
  label,
  current,
  look = "pill",
  onAssigned,
}: {
  classId: string;
  sectionId: string | null;
  label: string;
  current: { id: string; name: string } | null;
  look?: "pill" | "button";
  /** The class teacher now: the one chosen, or null when the class teacher was taken away. */
  onAssigned?: (teacher: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const [query, setQuery] = useState("");
  const teachers = useGetTeachersQuery({ status: "active" }, { skip: !open });
  const [setClassTeacher] = useSetClassTeacherMutation();
  const { push } = useToast();
  // A pick that needs a question first: the teacher, and the other classes they are the class teacher of.
  const [asking, setAsking] = useState<{ teacher: Teacher; others: string[] } | null>(null);
  // "No class teacher" was chosen: the window asks before the class teacher is taken away.
  const [askingOff, setAskingOff] = useState(false);

  const items = (teachers.data?.data.items ?? []).filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));
  /** The other classes this teacher is the class teacher of (this class is not "another"). */
  const othersOf = (t: Teacher) => t.classTeacherOf.filter((l) => l !== label);

  /** Makes them the class teacher here; one that was the class teacher of other classes leaves them. A refusal is thrown to whoever asked. */
  async function assign(t: Teacher, others: string[]) {
    const res = await setClassTeacher({ classId, sectionId, teacherId: t.id, ...(others.length > 0 ? { releaseOthers: true } : {}) }).unwrap();
    const left = res.data.released ?? [];
    push("success", `${t.name} is the class teacher of ${label}${left.length > 0 ? `, and no longer of ${left.join(", ")}` : ""}`);
    onAssigned?.({ id: t.id, name: t.name });
  }

  /** Takes the class teacher away: the class has none until one is chosen. A refusal is thrown to whoever asked (the window says it). */
  async function takeOff() {
    await setClassTeacher({ classId, sectionId, teacherId: null }).unwrap();
    push("success", `${label} has no class teacher now`);
    onAssigned?.(null);
  }

  function pick(t: Teacher) {
    if (t.id === current?.id) return;
    setOpen(false);
    setQuery("");
    const others = othersOf(t);
    if (!current && others.length === 0) {
      assign(t, others).catch((err) => push("error", getApiError(err)?.message ?? "Could not make the class teacher. Please try again."));
      return;
    }
    setAsking({ teacher: t, others });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
          // In the toolbar a long name is cut short (16rem) so that it never pushes Save to a second line.
          look === "button" ? "h-10 max-w-64 gap-2 rounded-lg border px-4 text-sm shadow-sm" : "h-8 gap-1.5 rounded-full border px-3 text-xs",
          current ? "border-primary/25 bg-primary-soft text-primary-deep hover:border-primary/50" : "border-dashed border-primary/50 bg-surface text-primary-deep hover:bg-primary-soft/50"
        )}
      >
        {current ? <UserRound className={cn("shrink-0", look === "button" ? "size-4" : "size-3.5")} aria-hidden /> : <UserPlus className={cn("shrink-0", look === "button" ? "size-4" : "size-3.5")} aria-hidden />}
        <span className="min-w-0 truncate">{current ? `Class teacher: ${current.name}` : "Add class teacher"}</span>
        <ChevronDown className={cn("shrink-0 transition-transform duration-200", look === "button" ? "size-4" : "size-3.5", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className={cn("pop-in absolute left-0 z-30 w-80 max-w-[85vw] origin-top-left rounded-2xl border border-border bg-surface p-2 shadow-float", look === "button" ? "top-12" : "top-10")}>
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">{current ? `Replace the class teacher of ${label}` : `Choose the class teacher of ${label}`}</p>
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
            <input
              type="search"
              aria-label="Search teachers"
              autoFocus
              autoComplete="off"
              placeholder="Search a teacher"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            />
          </div>

          {teachers.isLoading ? (
            <div className="space-y-1.5 p-1" aria-busy="true">
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ) : teachers.error && !teachers.data ? (
            <div className="space-y-2 p-2">
              <p className="text-sm text-danger">{getApiError(teachers.error)?.message ?? "Could not load the teachers."}</p>
              <Button variant="outline" size="sm" onClick={() => void teachers.refetch()}>
                Try again
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-foreground-muted">{query.trim() ? "No teacher with that name" : "No teacher in the school yet"}</p>
          ) : (
            <div role="listbox" aria-label="Teachers to choose from" className="max-h-64 space-y-0.5 overflow-y-auto">
              {items.map((t) => {
                const isCurrent = t.id === current?.id;
                const others = othersOf(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    aria-disabled={isCurrent}
                    onClick={() => pick(t)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      isCurrent ? "cursor-default bg-primary-soft/60" : "cursor-pointer hover:bg-surface-muted"
                    )}
                  >
                    <span className="min-w-0 truncate font-semibold text-foreground">{t.name}</span>
                    {isCurrent ? <Badge tone="primary">Current</Badge> : others.length > 0 && <Badge tone="warning">{`Class teacher of ${others.join(", ")}`}</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          {current && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                setAskingOff(true);
              }}
              className="mt-1.5 flex w-full cursor-pointer items-center gap-2 rounded-lg border-t border-border px-2.5 py-2 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger-soft/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-danger/20"
            >
              <UserMinus className="size-4 shrink-0" aria-hidden />
              No class teacher
            </button>
          )}
        </div>
      )}

      {askingOff && current && (
        <ConfirmModal
          title={`Take ${current.name} off as the class teacher of ${label}?`}
          confirmLabel="Take off"
          icon={UserMinus}
          onClose={() => setAskingOff(false)}
          onConfirm={() => takeOff()}
        >
          <p>
            {label} will have <strong>no class teacher</strong> until you choose one.
          </p>
        </ConfirmModal>
      )}

      {asking && (
        <ConfirmModal
          title={`Make ${asking.teacher.name} the class teacher of ${label}?`}
          confirmLabel="Make class teacher"
          icon={UserRoundCheck}
          tone="primary"
          onClose={() => setAsking(null)}
          onConfirm={() => assign(asking.teacher, asking.others)}
        >
          {current && (
            <p>
              {label} has <strong>{current.name}</strong> as its class teacher now. {current.name} will no longer be.
            </p>
          )}
          {asking.others.length > 0 && (
            <p>
              {asking.teacher.name} is the class teacher of <strong>{asking.others.join(", ")}</strong> already. {asking.teacher.name} will be taken off {asking.others.length === 1 ? "it" : "them"}, and{" "}
              {asking.others.join(", ")} will have no class teacher.
            </p>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}
