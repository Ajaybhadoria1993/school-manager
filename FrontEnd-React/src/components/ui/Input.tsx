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
  <label className={cn("mb-1.5 block text-sm font-semibold text-foreground", className)} {...props} />
);

/**
 * Two looks for a text control. "outline" (the default) is a white box with a hairline border, used
 * inside the app. "filled" is a soft blue box with no border, used on the sign-in screens: AuthShell
 * switches every control inside it to "filled", so the pages do not have to ask for it one by one.
 */
type ControlStyle = "outline" | "filled";
const ControlStyleContext = createContext<ControlStyle>("outline");

/** Wrap a form in this and every Input, Select and Textarea inside it takes the soft "filled" look. */
export function FilledControls({ children }: { children: React.ReactNode }) {
  return <ControlStyleContext.Provider value="filled">{children}</ControlStyleContext.Provider>;
}

/** The look the current form asks for. Select (components/ui/Select.tsx) reads it too, so every control matches. */
export const useControlStyle = () => useContext(ControlStyleContext);

export function controlClass(style: ControlStyle) {
  return cn(
    "w-full rounded-lg text-sm text-foreground placeholder:text-[#94a3b8] transition-all focus:outline-none disabled:opacity-60 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/30",
    style === "filled"
      ? "border border-transparent bg-primary-soft focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted"
      : "border border-border bg-surface focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-surface-muted aria-[invalid=true]:border-danger"
  );
}

export const controlHeight = (style: ControlStyle) => (style === "filled" ? "h-11" : "h-10");

export const iconClass = "pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-foreground-muted";

interface WithIcon {
  /** A small icon inside the left edge of the box, like the fields on the sign-in and onboarding screens. */
  icon?: LucideIcon;
  /** Fixed text before what is typed, such as "+91" on a phone number. */
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & WithIcon>(
  ({ className, icon: Icon, prefix, ...props }, ref) => {
    const style = useControlStyle();
    const input = (
      <input
        ref={ref}
        className={cn(
          controlClass(style),
          controlHeight(style),
          "px-3.5",
          Icon && !prefix && "pl-11",
          prefix && (Icon ? "pl-[5.75rem]" : "pl-[4.25rem]"),
          className
        )}
        {...props}
      />
    );
    if (!Icon && !prefix) return input;
    return (
      <div className="relative">
        {Icon && <Icon className={iconClass} aria-hidden />}
        {prefix && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 border-r border-border pr-3 text-sm font-medium text-foreground-muted",
              Icon ? "left-[2.9rem]" : "left-3.5"
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
