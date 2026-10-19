import { cn } from "@/lib/utils";
import { Label } from "./Input";

/**
 * A labelled form row: the label is tied to the control by `htmlFor`, the hint explains what to type,
 * and the error (when there is one) replaces the hint and is announced to screen readers.
 * Rows are required unless marked `optional`, and a required row shows the red star.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
        {optional ? (
          <span className="ml-1 font-normal text-foreground-muted">(optional)</span>
        ) : (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className={cn("mt-1.5 text-xs text-foreground-muted")}>{hint}</p>
      ) : null}
    </div>
  );
}
