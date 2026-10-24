import { TONES } from "../../constants/tones";
import { cn, initials } from "../../utils/helpers";
import { avatarTone } from "../../utils/students";

/** A student's (or a parent's) initials on a coloured badge. The colour comes from `seed` (the admission number), so it never changes. */
export function StudentAvatar({ name, seed, size = "md", className }: { name: string; seed: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-extrabold tracking-tight",
        size === "lg" ? "size-16 rounded-2xl text-xl" : size === "md" ? "size-12 rounded-2xl text-base" : "size-9 rounded-xl text-xs",
        TONES[avatarTone(seed)].gradient,
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
