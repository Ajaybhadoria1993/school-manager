import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronDown, Plus, UserPlus, UsersRound, type LucideIcon } from "lucide-react";
import { useCan } from "../../hooks/useCan";
import { useDismiss } from "../../hooks/useDismiss";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { cn } from "../../utils/helpers";

/** What the New menu can add: its words, where it goes, its shortcut (Alt + the key) and who may do it. More can be added here later. */
interface NewItem {
  key: string;
  label: string;
  note: string;
  to: string;
  icon: LucideIcon;
  /** `KeyboardEvent.code` (the key itself, whatever the keyboard's letters or the Option key types on a Mac) and the letter to show. */
  code: string;
  letter: string;
  permission: string;
}

const NEW_ITEMS: readonly NewItem[] = [
  { key: "student", label: "Add student", note: "Admit a new student to a class", to: "/school/students/new", icon: UserPlus, code: "KeyS", letter: "S", permission: "students.add" },
  { key: "teacher", label: "Add teacher", note: "Add a teacher to your school", to: "/teachers/new", icon: UsersRound, code: "KeyT", letter: "T", permission: "teachers.add" },
];

const Kbd = ({ children }: { children: string }) => (
  <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-surface-muted px-1.5 font-sans text-xs font-semibold text-foreground-muted">{children}</kbd>
);

/**
 * The "New" button of the top bar, like Infinity Medisetu's: it opens a card of what can be added from anywhere, each with a line about it
 * and its keyboard shortcut (Alt + a letter). The shortcuts work with the card closed, from any page of the app: they are only for what
 * this person may add (the school's Permissions), never while a year that is over is open (read only), never while a dialog is open
 * (it must not be left by a key), and a key held down is one press. Nothing to add: no button.
 */
export function NewMenu() {
  const can = useCan();
  const readOnly = useReadOnlyYear();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  const items = useMemo(() => (readOnly ? [] : NEW_ITEMS.filter((item) => can(item.permission))), [can, readOnly]);

  useEffect(() => {
    if (items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      // Alt and the letter only: with Shift, Ctrl or Command it is another shortcut (of the browser or the system).
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
      const item = items.find((i) => i.code === e.code);
      if (!item) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
      e.preventDefault();
      setOpen(false);
      navigate(item.to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, navigate]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--primary-shadow)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
      >
        <Plus className="size-4" aria-hidden />
        New
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="New" className="pop-in absolute right-0 top-12 z-30 w-[min(22rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-border bg-surface p-2 shadow-float">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                role="menuitem"
                aria-keyshortcuts={`Alt+${item.letter}`}
                onClick={close}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
              >
                <Icon className="size-[18px] shrink-0 text-foreground-muted" aria-hidden />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[15px] font-semibold text-foreground">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-foreground-muted">{item.note}</span>
                </span>
                <span aria-hidden className="flex shrink-0 items-center gap-1.5">
                  <Kbd>Alt</Kbd>
                  <Kbd>{item.letter}</Kbd>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
