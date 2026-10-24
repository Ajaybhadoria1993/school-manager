import { cn } from "../../utils/helpers";

/** Grey placeholder shown while data loads, so the page does not jump when it arrives. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}
