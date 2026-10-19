import { cn } from "@/lib/utils";

/** The title block that opens a landing section: small blue label, serif headline, a short bar, one line of help. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  const center = align === "center";
  return (
    <div className={cn(center ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}>
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl font-bold leading-snug tracking-tight text-foreground">{title}</h2>
      <div aria-hidden className={cn("mb-4 mt-3 h-1 w-16 rounded-full bg-primary", center && "mx-auto")} />
      {description && <p className="text-sm leading-relaxed text-foreground-muted sm:text-base">{description}</p>}
    </div>
  );
}
