import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The product's tagline, shown under the name unless a screen passes its own second line. */
export const TAGLINE = "Schools, simplified";

/** The logo (a blue badge with a graduation cap and an open book) next to the product name. */
export function BrandMark({
  href = "/",
  tagline,
  size = "md",
  tone = "default",
  compact = false,
  className,
  onClick,
}: {
  href?: string | null;
  onClick?: () => void;
  /** A second line under the name that replaces the tagline (for example the school's name). */
  tagline?: string;
  size?: "sm" | "md" | "lg";
  /** "inverse" is for dark backgrounds such as the navy side panels. */
  tone?: "default" | "inverse";
  /** Just the logo, no name: for a folded sidebar. */
  compact?: boolean;
  className?: string;
}) {
  const logo = size === "lg" ? "size-12" : size === "sm" ? "size-9" : "size-10";
  const inverse = tone === "inverse";

  const content = (
    <>
      {/* The badge is blue on its own, so the same file works on white and on the navy panels. */}
      <Image
        src="/brand/logo-mark.svg"
        alt=""
        width={48}
        height={48}
        priority
        className={cn("shrink-0", logo)}
      />
      <span className={cn("min-w-0 leading-none", compact && "sr-only")}>
        <span
          className={cn(
            "block font-extrabold tracking-[-0.02em]",
            size === "lg" ? "text-2xl" : "text-lg",
            inverse ? "text-white" : "text-navy",
          )}
        >
          Edu
          <span className={inverse ? "text-sky" : "text-primary"}>Shiksha</span>
        </span>
        <span
          className={cn(
            "mt-1 block truncate text-[10px] font-bold uppercase tracking-[0.18em]",
            inverse ? "text-white/70" : "text-foreground-muted",
            // The default tagline is a nicety: on a phone the header needs the room for its buttons.
            !tagline && "hidden sm:block",
          )}
        >
          {tagline ?? TAGLINE}
        </span>
      </span>
    </>
  );

  const classes = cn("inline-flex min-w-0 items-center gap-3", className);
  return href ? (
    <Link
      href={href}
      onClick={onClick}
      className={classes}
      aria-label="EduShiksha home"
    >
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  );
}
