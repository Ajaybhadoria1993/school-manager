import { DoorOpen, UsersRound } from "lucide-react";
import { useGetMyExamDutiesQuery } from "../../redux/api/examsApi";
import type { MyExamDuty } from "../../types";
import { clock12, examDays, weekdayDay } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";

/**
 * A teacher's exam duty on their home (2026-11-27, the user: "teacher ko pata chal jaaye ki mujhe is room mein duty hai, aur exam se related time, date,
 * room sab information mil jaaye"): each room they watch in an exam that is not over, with the exam and its days, the other teacher there, who sits in
 * it (class and roll numbers), and each day the room has papers with the time and the papers. One read; a teacher with no duty sees nothing of it.
 */
export function MyExamDuties() {
  const items = useGetMyExamDutiesQuery().data?.data.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-section-heading">Exam duty</h2>
      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((d) => (
          <DutyCard key={`${d.exam.id}:${d.room}`} duty={d} />
        ))}
      </div>
    </section>
  );
}

const rolls = (from: number, to: number) => (from === to ? `${from}` : `${from} to ${to}`);

function DutyCard({ duty }: { duty: MyExamDuty }) {
  const today = todayInIndia();
  return (
    <Card role="region" aria-label={`Exam duty in ${duty.room}`} className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
          <DoorOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-foreground">{duty.room}</p>
          <p className="text-sm text-foreground-muted">{`${duty.exam.name} · ${examDays(duty.exam.startDate, duty.exam.endDate)}`}</p>
        </div>
        <Badge tone="primary" className="shrink-0">{`${duty.students} ${duty.students === 1 ? "child" : "children"}`}</Badge>
      </div>

      <div className="space-y-2 border-t border-border px-5 py-3 text-sm">
        {duty.with.length > 0 && (
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <UsersRound className="size-4 text-foreground-muted" aria-hidden />
            {`With ${duty.with.join(" and ")}`}
          </p>
        )}
        <p className="flex flex-wrap gap-1.5">
          {duty.seats.map((s) => (
            <span key={`${s.place}:${s.fromRoll}`} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-semibold text-foreground">
              {`${s.place} · roll ${rolls(s.fromRoll, s.toRoll)}`}
            </span>
          ))}
        </p>
      </div>

      {duty.days.length === 0 ? (
        <p className="border-t border-border px-5 py-3 text-sm text-foreground-muted">No paper yet</p>
      ) : (
        <table aria-label={`Days of ${duty.room}`} className="w-full border-t border-border text-left text-sm">
          <thead className="bg-surface-muted/50">
            <tr className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
              <th scope="col" className="px-5 py-2">Day</th>
              <th scope="col" className="px-3 py-2">Time</th>
              <th scope="col" className="px-3 py-2">Papers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {duty.days.map((d) => (
              <tr key={d.date} className={cn("align-top", d.date === today && "bg-primary-soft/40", d.date < today && "text-foreground-muted")}>
                <td className="whitespace-nowrap px-5 py-2.5 font-semibold">{weekdayDay(d.date)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{`${clock12(d.startTime)} to ${clock12(d.endTime)}`}</td>
                <td className="space-y-0.5 px-3 py-2.5">
                  {d.papers.map((p) => (
                    <p key={`${p.subject}:${p.startTime}:${p.classes.join()}`}>{`${p.subject} · ${p.classes.join(", ")} · ${clock12(p.startTime)} to ${clock12(p.endTime)}`}</p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
