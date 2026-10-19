import Link from "next/link";
import { ArrowRight, MapPin, School } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { boardLabel } from "@/lib/schoolOptions";
import type { SchoolSteps } from "@/types";

/** A short card with the school's identity, and a link to the full profile. */
export function SchoolSummary({ steps }: { steps: SchoolSteps }) {
  const [s1, s2] = [steps[1], steps[2]];
  const place = [s2.addressLine1, s2.city, s2.state].filter(Boolean).join(", ");
  return (
    <Card className="group">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <School className="size-4 text-primary" aria-hidden />
          Your school
        </CardTitle>
        <Link
          href="/school"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-colors hover:text-primary-deep"
        >
          Full profile
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-lg font-bold leading-snug text-foreground">
          {s1.schoolName}
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {s1.boards.map((entry) => (
            <span
              key={boardLabel(entry)}
              className="rounded-full bg-primary-soft px-2.5 py-1 text-primary-deep"
            >
              {boardLabel(entry)}
            </span>
          ))}
          {s1.schoolType && (
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-foreground-muted">
              {s1.schoolType}
            </span>
          )}
          {s1.udiseCode && (
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-foreground-muted">
              UDISE+ {s1.udiseCode}
            </span>
          )}
        </div>
        {place && (
          <p className="flex items-start gap-2 text-sm text-foreground-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {place}
            {s2.pincode ? ` - ${s2.pincode}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
