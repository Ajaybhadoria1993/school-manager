import { CalendarDays, CalendarRange, Tag } from "lucide-react";
import { sessionFrom, suggestYearName } from "../../utils/academicYear";
import { cn } from "../../utils/helpers";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

export interface AcademicYearValues {
  name: string;
  startDate: string;
  endDate: string;
}

type YearField = keyof AcademicYearValues;

/** Usual sessions, offered as one-click shortcuts. They only fill the boxes: every date stays the school's to change. */
const PRESETS: { label: string; startMonth: number }[] = [
  { label: "April to March", startMonth: 4 },
  { label: "June to May", startMonth: 6 },
  { label: "January to December", startMonth: 1 },
];

/** The session running today for a year that starts in `startMonth`: in October 2026, April gives 2026-2027. */
function runningSession(startMonth: number) {
  const today = new Date();
  const year = today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1;
  return sessionFrom(startMonth, year);
}

/**
 * The academic year as a school names it: its name and its own first and last day (no date is assumed). A shortcut row fills
 * the usual sessions in one click. The name follows the dates ("2026-2027") until the school types a name of its own.
 * `errors` are keyed by field ("name", "startDate", "endDate").
 */
export function AcademicYearFields({
  idPrefix,
  values,
  errors,
  onChange,
}: {
  idPrefix: string;
  values: AcademicYearValues;
  errors: Partial<Record<YearField, string>>;
  onChange: (field: YearField, value: string) => void;
}) {
  const id = (field: YearField) => `${idPrefix}-${field}`;
  // The name is the school's own once it differs from what the dates suggest; until then it follows them.
  const nameFollowsDates = !values.name || values.name === suggestYearName(values.startDate, values.endDate);

  function setDates(startDate: string, endDate: string) {
    if (startDate !== values.startDate) onChange("startDate", startDate);
    if (endDate !== values.endDate) onChange("endDate", endDate);
    if (nameFollowsDates) {
      const suggested = suggestYearName(startDate, endDate);
      if (suggested && suggested !== values.name) onChange("name", suggested);
    }
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Usual sessions" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground-muted">Quick fill:</span>
        {PRESETS.map((preset) => {
          const session = runningSession(preset.startMonth);
          const picked = values.startDate === session.startDate && values.endDate === session.endDate;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={picked}
              onClick={() => setDates(session.startDate, session.endDate)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                picked
                  ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40"
                  : "border-border bg-surface text-foreground hover:-translate-y-0.5 hover:border-primary/50"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id={id("startDate")} label="Start date" error={errors.startDate}>
          <Input
            id={id("startDate")}
            type="date"
            icon={CalendarDays}
            value={values.startDate}
            min="2000-01-01"
            max="2100-12-31"
            onChange={(e) => setDates(e.target.value, values.endDate)}
            aria-invalid={!!errors.startDate}
          />
        </Field>
        <Field id={id("endDate")} label="End date" error={errors.endDate}>
          <Input
            id={id("endDate")}
            type="date"
            icon={CalendarRange}
            value={values.endDate}
            min={values.startDate || "2000-01-01"}
            max="2100-12-31"
            onChange={(e) => setDates(values.startDate, e.target.value)}
            aria-invalid={!!errors.endDate}
          />
        </Field>
        <Field id={id("name")} label="Academic year name" error={errors.name} hint="Filled in from the dates; change it if you call it differently.">
          <Input
            id={id("name")}
            icon={Tag}
            value={values.name}
            maxLength={20}
            placeholder="For example 2026-2027"
            onChange={(e) => onChange("name", e.target.value)}
            aria-invalid={!!errors.name}
          />
        </Field>
      </div>
    </div>
  );
}
