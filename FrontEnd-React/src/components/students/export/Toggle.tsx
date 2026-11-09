import { cn } from "../../../utils/helpers";

/**
 * A bare on / off switch (the row says what it is about), a real switch for a screen reader. `tone` tells the two switches of a row
 * apart: green for "in the Excel" / "asked", blue for Mandatory.
 */
export function Toggle({
  checked,
  onChange,
  label,
  title = label,
  disabled,
  tone = "primary",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** What the pointer says; the label by default. */
  title?: string;
  disabled?: boolean;
  tone?: "primary" | "success";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? (tone === "success" ? "bg-success" : "bg-primary") : "bg-border"
      )}
    >
      <span aria-hidden className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[1.125rem]" : "translate-x-0.5")} />
    </button>
  );
}
