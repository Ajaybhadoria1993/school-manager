import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useAuth } from "../../hooks/useAuth";
import { useDeleteEventMutation, useGetCalendarQuery } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { dayRange, monthTitle } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import type { CalendarEvent } from "../../types";
import { EventDialog } from "../../components/calendar/EventDialog";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { AppModal } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useResultModal } from "../../components/ui/ResultModal";
import { Skeleton } from "../../components/ui/Skeleton";

/**
 * The school's calendar (`/calendar`, docs/parent-teacher-flow.md phase 1): its holidays and events, month by month. The people who run
 * the school add one (a window), change it (its pencil) or take it away (its bin, after asking); each ends in a window that says so.
 * Teachers and parents see the same list, without those buttons.
 */
export default function CalendarPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "school_admin" || user?.role === "principal";
  const res = useGetCalendarQuery();
  const [remove, { isLoading: removing }] = useDeleteEventMutation();
  const [editing, setEditing] = useState<CalendarEvent | "new" | null>(null);
  const [asking, setAsking] = useState<CalendarEvent | null>(null);
  const result = useResultModal();
  const events = res.data?.data.items;
  const months = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) groups.set(e.startDate.slice(0, 7), [...(groups.get(e.startDate.slice(0, 7)) ?? []), e]);
    return [...groups.entries()];
  }, [events]);

  async function confirmRemove() {
    if (!asking) return;
    try {
      await remove(asking.id).unwrap();
      result.done("Taken off the calendar", `${asking.title} is not on the calendar any more.`);
    } catch (err) {
      result.failed("Could not take it off", getApiError(err)?.message ?? "Please try again.");
    }
    setAsking(null);
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Calendar"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <CalendarPlus className="size-4" aria-hidden />
              Add holiday or event
            </Button>
          ) : undefined
        }
      />

      {res.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !events ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the calendar."}</Card>
      ) : events.length === 0 ? (
        <StudentsNotice icon={CalendarDays} tone="primary" title="Nothing on the calendar yet" />
      ) : (
        months.map(([month, items]) => (
          <section key={month} aria-label={monthTitle(month)} className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{monthTitle(month)}</h2>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((e) => (
                <li key={e.id} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
                  <span
                    aria-hidden
                    className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none", e.kind === "holiday" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-deep")}
                  >
                    <span className="text-lg font-extrabold">{Number(e.startDate.slice(8, 10))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-foreground">{e.title}</span>
                    <span className="block text-sm text-foreground-muted">
                      <span className={cn("font-semibold", e.kind === "holiday" ? "text-danger" : "text-primary-deep")}>{e.kind === "holiday" ? "Holiday" : "Event"}</span> · {dayRange(e.startDate, e.endDate)}
                    </span>
                    {e.note && <span className="mt-1 block text-sm text-foreground">{e.note}</span>}
                  </span>
                  {canEdit && (
                    <span className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Change ${e.title}`} onClick={() => setEditing(e)}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={`Remove ${e.title}`} className="hover:text-danger" onClick={() => setAsking(e)}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <EventDialog
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(title, message) => {
            setEditing(null);
            result.done(title, message);
          }}
        />
      )}
      {asking && (
        <AppModal
          title={`Remove ${asking.title}?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={removing}
          onClose={() => setAsking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAsking(null)} isDisabled={removing}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing} onPress={() => void confirmRemove()}>
                Remove
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">Teachers and parents will not see it any more.</p>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
