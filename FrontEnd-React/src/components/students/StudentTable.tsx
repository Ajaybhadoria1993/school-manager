import { Link, useNavigate } from "react-router";
import { ChevronRight, Phone } from "lucide-react";
import { TONES } from "../../constants/tones";
import { formatDay } from "../../utils/academicYear";
import { cn } from "../../utils/helpers";
import { ageText, avatarTone, formatMobile, placeLabel } from "../../utils/students";
import type { StudentRow } from "../../types";
import { Skeleton } from "../ui/Skeleton";
import { StudentAvatar } from "./StudentAvatar";

const TH = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";

/** The class and section as a coloured chip (the colour is the student's, as on their card), with the roll number under it. */
function ClassChip({ student }: { student: StudentRow }) {
  const t = TONES[avatarTone(student.admissionNumber)];
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset", t.chip)}>{placeLabel(student.place)}</span>
      {student.place?.rollNumber != null && <span className="text-xs text-foreground-muted">Roll {student.place.rollNumber}</span>}
    </span>
  );
}

function Parent({ student }: { student: StudentRow }) {
  const guardian = student.primaryGuardian;
  if (!guardian) return <span className="text-foreground-muted">No parent</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm font-semibold text-foreground">
        {guardian.name} <span className="font-normal text-foreground-muted">({guardian.relation})</span>
      </span>
      {guardian.mobile && (
        <span className="mt-0.5 flex items-center gap-1 text-xs text-foreground-muted">
          <Phone className="size-3" aria-hidden />
          {formatMobile(guardian.mobile)}
        </span>
      )}
    </span>
  );
}

/**
 * The students of this page as a table (the page the server sent; nothing is sorted or filtered here). A row opens the student: the
 * name is the real link (for the keyboard and a new tab), and a click anywhere else on the row follows it. On a phone the table keeps
 * one column, the student, and shows the class and the parent under the name, so the page never scrolls sideways.
 */
export function StudentTable({ students, loading }: { students: StudentRow[]; loading?: boolean }) {
  const navigate = useNavigate();

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-opacity", loading && "opacity-70")}>
      <table className="w-full border-collapse text-sm" aria-label="Students" aria-busy={loading || undefined}>
        <thead className="border-b border-border bg-background">
          <tr>
            <th scope="col" className={TH}>
              Student
            </th>
            <th scope="col" className={cn(TH, "hidden md:table-cell")}>
              Class and section
            </th>
            <th scope="col" className={cn(TH, "hidden md:table-cell")}>
              Primary parent
            </th>
            <th scope="col" className={cn(TH, "hidden lg:table-cell")}>
              Admitted
            </th>
            <th scope="col" className="w-10">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr
              key={student.id}
              onClick={(e) => {
                // The name is a link: let it do its own work instead of going twice.
                if (!(e.target as HTMLElement).closest("a")) navigate(`/school/students/${student.id}`);
              }}
              className="group cursor-pointer border-t border-surface-muted transition-colors first:border-t-0 hover:bg-background"
            >
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center gap-3">
                  <StudentAvatar name={student.name} seed={student.admissionNumber} size="sm" className="transition-transform duration-200 group-hover:scale-105" />
                  <div className="min-w-0">
                    <Link
                      to={`/school/students/${student.id}`}
                      aria-label={`${student.name}, ${student.admissionNumber}, ${placeLabel(student.place)}`}
                      className="block truncate font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                    >
                      {student.name}
                    </Link>
                    <span className="block truncate font-mono text-xs font-semibold text-foreground-muted">{student.admissionNumber}</span>
                    {/* The columns that are hidden on a phone, under the name. */}
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
                      <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", TONES[avatarTone(student.admissionNumber)].chip)}>
                        {placeLabel(student.place)}
                      </span>
                      {student.primaryGuardian && (
                        <span className="truncate text-xs text-foreground-muted">
                          {student.primaryGuardian.name}
                          {student.primaryGuardian.mobile && <> · {formatMobile(student.primaryGuardian.mobile)}</>}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </td>
              <td className="hidden px-4 py-3 align-middle md:table-cell">
                <ClassChip student={student} />
              </td>
              <td className="hidden max-w-[18rem] px-4 py-3 align-middle md:table-cell">
                <Parent student={student} />
              </td>
              <td className="hidden px-4 py-3 align-middle lg:table-cell">
                <span className="block text-sm font-semibold text-foreground">{formatDay(student.admissionDate)}</span>
                <span className="block text-xs text-foreground-muted">
                  {student.gender} · {ageText(student.dateOfBirth)}
                </span>
              </td>
              <td className="pr-3 text-right align-middle">
                <ChevronRight className="size-4 text-foreground-muted/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The table's place while the first page is on its way. */
export function StudentTableSkeleton() {
  return (
    <div className="space-y-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-[4.25rem] rounded-none" />
      ))}
    </div>
  );
}
