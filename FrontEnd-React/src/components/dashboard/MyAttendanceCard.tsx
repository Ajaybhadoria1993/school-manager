import { useRef, useState } from "react";
import { CalendarCheck2, UserRoundCheck } from "lucide-react";
import { useGetMyAttendanceQuery, useGetMyMonthQuery, useMarkMePresentMutation } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { lateText, teacherLook } from "../../utils/attendance";
import { clock12, weekdayDay } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { Button as HeroButton } from "@heroui/react";
import { AppModal } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useResultModal } from "../ui/ResultModal";
import { Skeleton } from "../ui/Skeleton";
import { TeacherDaysDialog } from "../attendance/TeacherDaysDialog";

/**
 * A teacher's own attendance, on their home (2026-11-06). Nobody takes a teacher's attendance: they mark themselves present, here, and the
 * time is kept for the school. The card says what today is for them (not marked yet, present with the time, late and by how much, a holiday,
 * a day off, absent because school ended) and, while it is open, has one button. Every mark ends in a window that says what happened.
 */
export function MyAttendanceCard() {
  const res = useGetMyAttendanceQuery();
  const [mark, { isLoading: marking }] = useMarkMePresentMutation();
  const result = useResultModal();
  const sending = useRef(false);
  const day = res.data?.data;
  // The teacher's own month is read only when they ask for it (the card itself is one read).
  const [showMonth, setShowMonth] = useState(false);

  async function present() {
    if (sending.current) return;
    sending.current = true;
    try {
      const saved = (await mark().unwrap()).data;
      const at = saved.checkedInTime ? clock12(saved.checkedInTime) : "";
      const late = saved.status === "late" ? ` ${lateText(saved.lateByMinutes)}.` : "";
      if (saved.alreadyMarked) result.done("You are already marked present", `You were marked at ${at}.${late}`);
      else result.done("You are marked present", `Marked at ${at}.${late}`);
    } catch (err) {
      result.failed("Could not mark you present", getApiError(err)?.message ?? "Please try again.");
    } finally {
      sending.current = false;
    }
  }

  return (
    <section aria-label="My attendance" className="space-y-3">
      <h2 className="text-section-heading flex items-center gap-2">
        <CalendarCheck2 className="size-5 text-primary" aria-hidden />
        My attendance
      </h2>
      {res.isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : !day ? (
        <Card className="px-5 py-6 text-center text-sm text-foreground-muted">{getApiError(res.error)?.message ?? "Could not load your attendance."}</Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground-muted">{weekdayDay(day.date)}</p>
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
              {day.status === "pending" || day.status === "upcoming" ? (
                "Not marked yet"
              ) : (
                <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-sm font-bold", teacherLook(day.status).tone)}>{teacherLook(day.status).label}</span>
              )}
              {day.checkedInTime && <span className="text-base font-semibold text-foreground">{clock12(day.checkedInTime)}</span>}
              {day.checkedInTime && day.lateByMinutes !== null && <span className="text-sm font-semibold text-foreground-muted">{lateText(day.lateByMinutes)}</span>}
            </p>
            {day.why && <p className="text-sm text-foreground-muted">{day.why}</p>}
            {day.school.start && day.school.end && (
              <p className="text-sm text-foreground-muted">
                School {clock12(day.school.start)} to {clock12(day.school.end)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="lg" onClick={() => setShowMonth(true)}>
              My days
            </Button>
            {day.canCheckIn && (
              <Button size="lg" loading={marking} onClick={() => void present()}>
                {!marking && <UserRoundCheck className="size-4" aria-hidden />}
                I am present
              </Button>
            )}
          </div>
        </Card>
      )}
      {showMonth && <MyDays onClose={() => setShowMonth(false)} />}
      {result.modal}
    </section>
  );
}

/** My month: each day that counts with what it was and the time (read only). Asked for when it is opened. */
function MyDays({ onClose }: { onClose: () => void }) {
  const res = useGetMyMonthQuery();
  const month = res.data?.data;
  if (!month) {
    return (
      <AppModal title="My attendance" icon={CalendarCheck2} onClose={onClose} footer={<HeroButton variant="primary" onPress={onClose}>Close</HeroButton>}>
        {res.error ? <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load your days."}</p> : <Skeleton className="h-32 rounded-xl" />}
      </AppModal>
    );
  }
  return <TeacherDaysDialog teacher={month.row} title="My attendance" onClose={onClose} />;
}
