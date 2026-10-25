import { Link } from "react-router";
import { ListChecks } from "lucide-react";
import type { FieldsFrom } from "../../../pages/school/ManageFields";
import { cn } from "../../../utils/helpers";
import { WithTip } from "../../ui/Hint";

/** The look of the page's outline buttons, as a link (the same as `Button variant="outline"`). */
const OUTLINE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * "Manage fields": the way to the school's fields (`/school/students/fields`, a page of its own) from the screens where a school needs
 * them before it has students to export (Add student, the empty Students page). `from` tells that page where Back goes. `guard` can
 * hold the click back (it returns false after asking something, such as Add student's "what you typed is cleared").
 */
export function ManageFieldsLink({ from, guard, className }: { from: FieldsFrom; guard?: () => boolean; className?: string }) {
  return (
    <WithTip tip="Choose which details Add student asks and which are mandatory. The same list makes the Excel's columns.">
      <Link
        to="/school/students/fields"
        state={{ from }}
        onClick={(e) => {
          if (guard && !guard()) e.preventDefault();
        }}
        className={cn(OUTLINE, className)}
      >
        <ListChecks className="size-4" aria-hidden />
        Manage fields
      </Link>
    </WithTip>
  );
}
