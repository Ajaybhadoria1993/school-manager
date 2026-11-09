import { useMemo, useState } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useAuth } from "../../hooks/useAuth";
import { useDeleteEventMutation, useGetCalendarQuery, useSetStandardHolidayMutation } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { eventsOnDay, eventsTouching, monthBounds, monthTitle, shiftMonth, shiftYear, yearRange } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { CalendarEvent } from "../../types";
import { CalendarToolbar, type CalendarView } from "../../components/calendar/CalendarToolbar";
import { DayDialog } from "../../components/calendar/DayDialog";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { EventDialog } from "../../components/calendar/EventDialog";
import { EventList } from "../../components/calendar/EventList";
import { MonthGrid } from "../../components/calendar/MonthGrid";
import { YearGrid } from "../../components/calendar/YearGrid";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { AppModal } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useResultModal } from "../../components/ui/ResultModal";
import { Skeleton } from "../../components/ui/Skeleton";

/**
 * The school's calendar (`/calendar`, docs/parent-teacher-flow.md phase 1): a month as a grid of days, or the whole year at once, with
 * its holidays and events. A click on a day opens it: the people who run the school add a holiday or event there (an empty day goes
 * straight to the form), change or take away what is on it (each ends in a window that says so); teachers and parents only read it.
 * The calendar starts with the standard holidays (Diwali, Republic Day...): a national day stays, a festival the school takes off with
 * the bin and brings back from "Taken off" under the list. The server is asked once for a whole year, so moving between its months costs nothing.
 */
export default function CalendarPage() {
  const { user } = useAuth();
  // A year that is over is only looked at: no adding or changing of holidays and events (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const canEdit = (user?.role === "school_admin" || user?.role === "principal") && !readOnly;
  const today = useMemo(() => todayInIndia(), []);
  const [view, setView] = useState<CalendarView>("month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const year = Number(month.slice(0, 4));
  const res = useGetCalendarQuery(yearRange(year));
  const [remove, { isLoading: removing }] = useDeleteEventMutation();
  const [setStandard, { isLoading: switching }] = useSetStandardHolidayMutation();
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; day?: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState<CalendarEvent | null>(null);
  const result = useResultModal();
  const events = res.data?.data.items;
  const hidden = res.data?.data.hidden;
  const loadingYear = res.isFetching && res.currentData === undefined;
  const all = useMemo(() => events ?? [], [events]);

  // What is shown: the month, or the year; the list at the side and the counts follow it.
  const period = view === "month" ? monthBounds(month) : { from: `${year}-01-01`, to: `${year}-12-31` };
  const inPeriod = useMemo(() => eventsTouching(all, period.from, period.to), [all, period.from, period.to]);
  const takenOff = useMemo(() => eventsTouching(hidden ?? [], period.from, period.to), [hidden, period.from, period.to]);
  const holidays = inPeriod.filter((e) => e.kind === "holiday").length;

  function pick(day: string) {
    // An empty day goes straight to the form for the school; anything else opens what is on it.
    if (canEdit && eventsOnDay(all, day).length === 0) setEditing({ event: null, day });
    else setPicked(day);
  }

  function change(e: CalendarEvent) {
    setPicked(null);
    setEditing({ event: e });
  }

  function ask(e: CalendarEvent) {
    setPicked(null);
    setAsking(e);
  }

  async function confirmRemove() {
    if (!asking) return;
    try {
      // A standard festival is not the school's own record: it is switched off for this school, not deleted.
      if (asking.source === "festival") {
        await setStandard({ key: asking.id, shown: false }).unwrap();
        result.done("Taken off the calendar", `${asking.title} is not a holiday for your school now.`);
      } else {
        await remove(asking.id).unwrap();
        result.done("Taken off the calendar", `${asking.title} is not on the calendar any more.`);
      }
    } catch (err) {
      result.failed("Could not take it off", getApiError(err)?.message ?? "Please try again.");
    }
    setAsking(null);
  }

  async function bringBack(e: CalendarEvent) {
    try {
      await setStandard({ key: e.id, shown: true }).unwrap();
      result.done("Back on the calendar", `${e.title} is a holiday again.`);
    } catch (err) {
      result.failed("Could not bring it back", getApiError(err)?.message ?? "Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Calendar"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          canEdit ? (
            <Button onClick={() => setEditing({ event: null })}>
              <CalendarPlus className="size-4" aria-hidden />
              Add holiday or event
            </Button>
          ) : undefined
        }
      />

      {res.isLoading ? (
        <Skeleton className="h-[40rem] rounded-2xl" />
      ) : !events ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the calendar."}</Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
          {/* Dimmed only while another year is being read, not each time a change is saved and the same year is read again. */}
          <Card aria-busy={loadingYear} className={cn("overflow-hidden transition-opacity", loadingYear && "opacity-60")}>
            <CalendarToolbar
              view={view}
              title={view === "month" ? monthTitle(month) : String(year)}
              holidays={holidays}
              events={inPeriod.length - holidays}
              onView={setView}
              onStep={(n) => setMonth((m) => (view === "month" ? shiftMonth(m, n) : shiftYear(m, n)))}
              onToday={() => setMonth(today.slice(0, 7))}
            />
            {view === "month" ? (
              <MonthGrid month={month} events={all} today={today} onPick={pick} />
            ) : (
              <YearGrid
                year={year}
                events={all}
                today={today}
                onPick={pick}
                onOpenMonth={(m) => {
                  setMonth(m);
                  setView("month");
                }}
              />
            )}
          </Card>
          <div className="relative">
            <EventList
              events={inPeriod}
              from={period.from}
              grouped={view === "year"}
              emptyText={view === "month" ? "Nothing this month" : "Nothing this year"}
              canEdit={canEdit}
              takenOff={takenOff}
              onEdit={change}
              onRemove={ask}
              onBring={(e) => void bringBack(e)}
            />
          </div>
        </div>
      )}

      {picked && (
        <DayDialog
          day={picked}
          events={eventsOnDay(all, picked)}
          canEdit={canEdit}
          onClose={() => setPicked(null)}
          onAdd={(day) => {
            setPicked(null);
            setEditing({ event: null, day });
          }}
          onEdit={change}
          onRemove={ask}
        />
      )}
      {editing && (
        <EventDialog
          event={editing.event}
          initialDay={editing.day}
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
          busy={removing || switching}
          onClose={() => setAsking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAsking(null)} isDisabled={removing || switching}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing || switching} onPress={() => void confirmRemove()}>
                Remove
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">{asking.source === "festival" ? "It will not be a holiday for your school." : "Teachers and parents will not see it any more."}</p>
        </AppModal>
      )}
      {result.modal}
    </div>
  );
}
