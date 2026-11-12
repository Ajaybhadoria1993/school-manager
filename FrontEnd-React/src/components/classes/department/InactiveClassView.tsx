import { Archive, CircleCheck } from "lucide-react";
import { useReactivateClassMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { classMark, plural, seatsLabel } from "../../../utils/academics";
import { formatDate } from "../../../utils/helpers";
import type { ClassItem } from "../../../types";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/toast-context";

/**
 * A class that is inactive is read, not changed (the server refuses a change): its name, seats and sections as they were, who made it
 * inactive and when, and one button, Make active. Nothing of it was deleted. It is shown when an inactive class is opened (from a link,
 * or from the Inactive list); the department's own list only holds the active classes.
 */
export function InactiveClassView({ classItem }: { classItem: ClassItem }) {
  const { push } = useToast();
  const [reactivate, { isLoading }] = useReactivateClassMutation();

  async function makeActive() {
    try {
      await reactivate(classItem.id).unwrap();
      push("success", `${classItem.name} is active again`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? `Could not make ${classItem.name} active.`);
    }
  }

  const note = classItem.inactive;
  return (
    <div className="fade-in">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-background px-5 py-5">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-border text-xl font-bold text-foreground-muted">
          {classMark(classItem.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-section-heading">{classItem.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-muted">
            <Archive className="size-4" aria-hidden />
            Inactive
            {note && <> · made inactive by {note.by.name} on {formatDate(note.at)}</>}
          </p>
        </div>
        <Button type="button" loading={isLoading} onClick={() => void makeActive()} aria-label={`Make ${classItem.name} active`}>
          {!isLoading && <CircleCheck className="size-4" aria-hidden />}
          Make active
        </Button>
      </div>

      <div className="space-y-3 px-5 py-5 text-sm">
        <p className="text-foreground-muted">
          Nothing was deleted. Its students&apos; history, sections and timetable are kept. It does not appear when you admit a student or plan the timetable until it is
          made active.
        </p>
        <p className="font-semibold text-foreground">
          {seatsLabel(classItem) ?? "Seats not set"}
          {classItem.sections.length > 0 && <span className="font-normal text-foreground-muted"> · {plural(classItem.sections.length, "section")}</span>}
        </p>
        {classItem.sections.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {classItem.sections.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-semibold text-foreground">Section {s.name}</span>
                <span className="text-foreground-muted">
                  {s.capacity === null ? "Seats not set" : plural(s.capacity, "seat")}
                  {s.room && ` · ${s.room}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
