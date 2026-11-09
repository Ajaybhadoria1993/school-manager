import { useRef } from "react";
import { Calendar, DateField, DatePicker } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import { CalendarDays, X } from "lucide-react";
import { cn } from "../../utils/helpers";
import { iconClass, useControlStyle } from "./Input";

/** A day as the app keeps it ("2026-11-03"), as the calendar's own date; nothing for an empty or broken one. */
function toCalendarDate(day: string | undefined): CalendarDate | null {
  if (!day) return null;
  try {
    return parseDate(day);
  } catch {
    return null;
  }
}

export interface DateShortcut {
  label: string;
  /** The day it sets, "2026-11-03". */
  value: string;
}

/**
 * A date box: day, month and year typed in place (the way dates are written in India: 03 / 11 / 2026), or picked in HeroUI's calendar
 * (the button at the right; its heading opens a year list, for a date of birth). `value` is "YYYY-MM-DD" or "" for none. `shortcuts`
 * are days set in one click (Today, Tomorrow...), shown under the box. `id` is the Field's: the label names the box, and the
 * cursor can be put in it from outside (`document.getElementById(id).focus()` lands in the first part).
 */
export function DateBox({
  id,
  label,
  value,
  onChange,
  onBlur,
  min,
  max,
  invalid,
  shortcuts,
}: {
  id: string;
  /** The words of the label, for the calendar and the clear button ("Clear joining date"). */
  label: string;
  value: string;
  onChange: (day: string) => void;
  onBlur?: () => void;
  min?: string;
  max?: string;
  invalid?: boolean;
  shortcuts?: readonly DateShortcut[];
}) {
  const style = useControlStyle();
  const wrapper = useRef<HTMLDivElement>(null);

  return (
    <I18nProvider locale="en-IN">
      <div
        id={id}
        ref={wrapper}
        tabIndex={-1}
        className="outline-none"
        // The Field's label and error point at `id`: focusing the wrapper puts the cursor in the day.
        onFocus={(e) => {
          if (e.target === wrapper.current) wrapper.current?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus();
        }}
        onBlur={(e) => {
          if (!wrapper.current?.contains(e.relatedTarget as Node | null)) onBlur?.();
        }}
      >
        <DatePicker
          value={toCalendarDate(value)}
          onChange={(day) => onChange(day ? day.toString() : "")}
          minValue={toCalendarDate(min) ?? undefined}
          maxValue={toCalendarDate(max) ?? undefined}
          isInvalid={invalid}
          granularity="day"
          shouldForceLeadingZeros
          aria-labelledby={`${id}-label`}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className="group w-full"
        >
          <DateField.Group
            fullWidth
            className={cn(
              "relative flex h-10 w-full items-center gap-1 rounded-lg border pl-11 pr-1.5 text-sm text-foreground shadow-none transition-all",
              style === "filled"
                ? "border-transparent bg-primary-soft focus-within:border-primary focus-within:bg-surface focus-within:ring-4 focus-within:ring-primary/15"
                : "border-border bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15",
              "group-data-[invalid=true]:border-danger group-data-[invalid=true]:ring-2 group-data-[invalid=true]:ring-danger/30"
            )}
          >
            <CalendarDays className={iconClass} aria-hidden />
            <DateField.Input className="flex min-w-0 flex-1 items-center">
              {(segment) => (
                <DateField.Segment
                  segment={segment}
                  className="rounded px-0.5 tabular-nums text-foreground outline-none focus:bg-primary-soft focus:text-primary-deep data-[placeholder=true]:text-[#94a3b8] data-[type=literal]:px-0 data-[type=literal]:text-foreground-muted"
                />
              )}
            </DateField.Input>
            <DateField.Suffix className="flex shrink-0 items-center gap-0.5">
              {value && (
                <button
                  type="button"
                  aria-label={`Clear ${label.toLowerCase()}`}
                  title="Clear"
                  onClick={() => onChange("")}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
              <DatePicker.Trigger className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                <DatePicker.TriggerIndicator />
              </DatePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DatePicker.Popover className="rounded-xl border border-border bg-surface p-3 shadow-float">
            <Calendar aria-label={label}>
              <Calendar.Header>
                <Calendar.YearPickerTrigger>
                  <Calendar.YearPickerTriggerHeading />
                  <Calendar.YearPickerTriggerIndicator />
                </Calendar.YearPickerTrigger>
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
              <Calendar.YearPickerGrid>
                <Calendar.YearPickerGridBody />
              </Calendar.YearPickerGrid>
            </Calendar>
          </DatePicker.Popover>
        </DatePicker>

        {shortcuts && shortcuts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shortcuts.map((s) => {
              const on = s.value === value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(s.value)}
                  className={cn(
                    "h-7 cursor-pointer rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                    on ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25" : "border-border bg-surface text-foreground-muted hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </I18nProvider>
  );
}
