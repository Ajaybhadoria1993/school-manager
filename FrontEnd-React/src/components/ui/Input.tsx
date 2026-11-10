import {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes,
  createContext,
  forwardRef,
  useContext,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/helpers";

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-body-label", className)} {...props} />
);

/**
 * Two looks for a text control. "outline" (the default) is a white box with a hairline border, used
 * inside the app. "filled" is a soft blue box with no border, used on the sign-in screens: AuthShell
 * switches every control inside it to "filled", so the pages do not have to ask for it one by one. "boxed" is taller with a firm border and
 * its icon in a block of its own, for the student admission form (BoxedControls).
 */
type ControlStyle = "outline" | "filled" | "boxed";
const ControlStyleContext = createContext<ControlStyle>("outline");

/** Wrap a form in this and every Input, Select and Textarea inside it takes the soft "filled" look. */
export function FilledControls({ children }: { children: React.ReactNode }) {
  return <ControlStyleContext.Provider value="filled">{children}</ControlStyleContext.Provider>;
}

/** The look the current form asks for. Select (components/ui/Select.tsx) reads it too, so every control matches. */
/** Wrap a form in this and every Input, Select and date box inside it takes the taller "boxed" look. */
export function BoxedControls({ children }: { children: React.ReactNode }) {
  return <ControlStyleContext.Provider value="boxed">{children}</ControlStyleContext.Provider>;
}

export const useControlStyle = () => useContext(ControlStyleContext);

export function controlClass(style: ControlStyle) {
  return cn(
    "w-full rounded-lg text-sm text-foreground placeholder:text-[#94a3b8] transition-all focus:outline-none disabled:opacity-60 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/30",
    style === "filled"
      ? "border border-transparent bg-primary-soft focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted"
      : style === "boxed"
        ? // "!": index.css colours every border from outside Tailwind's layers, which beats any plain border colour written here.
          "rounded-[10px] border border-foreground/60! bg-surface text-[15px] hover:border-foreground/80! focus:border-primary! focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted aria-[invalid=true]:border-danger!"
        : "border border-border bg-surface focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted aria-[invalid=true]:border-danger"
  );
}

export const controlHeight = (style: ControlStyle) => (style === "boxed" ? "h-12" : style === "filled" ? "h-11" : "h-10");

/** How far the text of a box starts when an icon is at its left. */
export const iconPadding = (style: ControlStyle) => (style === "boxed" ? "pl-14" : "pl-11");

export const iconClass = "pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-foreground-muted";

/** The icon at the left of a box: on its own, or in a block of its own in the boxed look. */
export function ControlIcon({ icon: Icon }: { icon: LucideIcon }) {
  const style = useControlStyle();
  if (style !== "boxed") return <Icon className={iconClass} aria-hidden />;
  return (
    <span data-slot="control-icon" aria-hidden className="pointer-events-none absolute inset-y-px left-px flex w-11 items-center justify-center rounded-l-[9px] border-r border-foreground/40! bg-surface-muted text-foreground">
      <Icon className="size-[18px]" />
    </span>
  );
}

interface WithIcon {
  /** A small icon inside the left edge of the box, like the fields on the sign-in and onboarding screens. */
  icon?: LucideIcon;
  /** Fixed text before what is typed, such as "+91" on a phone number. */
  prefix?: string;
  /**
   * Keep what is typed in small letters (capitals turn small right in the box, and the page only ever hears the small version).
   * Every `type="email"` box does this on its own; pass it for a box that takes an email in a plain text box (the sign-in box).
   */
  lowercase?: boolean;
}

/**
 * Make the box's text small letters, leaving the cursor where it was. A browser will not say where the cursor is in an email box (and
 * switching the box's type to find out scrambles it), so there a capital typed in the middle sends the cursor to the end; typing an
 * address from left to right, the normal way, is never affected.
 */
function makeSmall(box: HTMLInputElement) {
  const small = box.value.toLowerCase();
  if (small === box.value) return;
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = box.selectionStart;
    end = box.selectionEnd;
  } catch {
    // Some box types refuse to say where the cursor is.
  }
  box.value = small;
  if (start === null || end === null) return;
  try {
    box.setSelectionRange(start, end);
  } catch {
    // Same: the cursor stays at the end.
  }
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & WithIcon>(
  ({ className, icon: Icon, prefix, lowercase, onChange, ...props }, ref) => {
    const style = useControlStyle();
    const keepSmall = lowercase ?? props.type === "email";
    const input = (
      <input
        ref={ref}
        onChange={
          keepSmall
            ? (e) => {
                makeSmall(e.currentTarget);
                onChange?.(e);
              }
            : onChange
        }
        className={cn(
          controlClass(style),
          controlHeight(style),
          "px-3.5",
          Icon && !prefix && iconPadding(style),
          prefix && (Icon ? (style === "boxed" ? "pl-[6.5rem]" : "pl-[5.75rem]") : "pl-[4.25rem]"),
          className
        )}
        {...props}
      />
    );
    if (!Icon && !prefix) return input;
    return (
      <div className="relative">
        {Icon && <ControlIcon icon={Icon} />}
        {prefix && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 border-r border-border pr-3 text-sm font-medium text-foreground-muted",
              Icon ? (style === "boxed" ? "left-[3.5rem]" : "left-[2.9rem]") : "left-3.5"
            )}
          >
            {prefix}
          </span>
        )}
        {input}
      </div>
    );
  }
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  const style = useControlStyle();
  return <textarea ref={ref} className={cn(controlClass(style), "px-3.5 py-2.5", className)} {...props} />;
});
Textarea.displayName = "Textarea";

export function FormField({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-foreground-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
