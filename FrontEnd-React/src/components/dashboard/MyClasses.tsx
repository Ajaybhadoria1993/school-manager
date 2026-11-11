import { Link } from "react-router";
import { ChevronRight, School, UserRoundCheck } from "lucide-react";
import { useGetMyClassesQuery } from "../../redux/api/classroomApi";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/**
 * A teacher's own classes on their home (docs/parent-teacher-flow.md): each class they are the class teacher of or teach a subject in,
 * with their subjects there; one click opens the class's work (attendance, diary, tests).
 */
export function MyClasses() {
  const res = useGetMyClassesQuery();
  const classes = res.data?.data.items;
  return (
    <section className="space-y-3">
      <h2 className="text-section-heading">My classes</h2>
      {res.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : !classes || classes.length === 0 ? (
        <Card className="px-5 py-6 text-center text-sm text-foreground-muted">No class is given to you yet</Card>
      ) : (
        <ul aria-label="My classes" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <li key={`${c.classId}:${c.sectionId ?? ""}`}>
              <Link
                to={`/class-work/${c.classId}${c.sectionId ? `?section=${c.sectionId}` : ""}`}
                className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
              >
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
                  <School className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-foreground group-hover:text-primary-deep">{c.label}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.isClassTeacher && (
                      <Badge tone="primary" className="gap-1">
                        <UserRoundCheck className="size-3" aria-hidden />
                        Class teacher
                      </Badge>
                    )}
                    {c.subjects.map((s) => (
                      <Badge key={s.id}>{s.name}</Badge>
                    ))}
                  </span>
                </span>
                <ChevronRight className="size-5 text-foreground-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
