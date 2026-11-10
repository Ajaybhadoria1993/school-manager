import { Link } from "react-router";
import { ChevronRight, UsersRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useGetMyChildrenQuery } from "../../redux/api/parentApi";
import { getApiError } from "../../utils/apiErrors";
import { StudentAvatar } from "../students/StudentAvatar";
import { StudentsNotice } from "../students/StudentsNotice";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { WelcomeHeader } from "./school/WelcomeHeader";

/**
 * The home of a signed-in parent (2026-11-04): a greeting and their children at the school, each with the class, the roll number and the
 * admission number; a child opens their own page (record, class teacher, timetable). One read. Nothing of the school's own (its setup,
 * numbers or shortcuts): those are for the people who run the school.
 */
export function ParentDashboard() {
  const { user, tenant } = useAuth();
  const res = useGetMyChildrenQuery();
  const children = res.data?.data.items;
  if (!user) return null;

  return (
    <div className="space-y-6">
      <WelcomeHeader firstName={user.name.split(" ")[0]} schoolName={tenant?.name ?? "your school"} shortcuts={false} />

      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !children ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load your children."}</Card>
      ) : children.length === 0 ? (
        <StudentsNotice icon={UsersRound} tone="navy" title="No child is linked to your login yet" />
      ) : (
        <section className="space-y-3">
          <h2 className="text-section-heading">Your children</h2>
          <ul aria-label="Your children" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/my-children/${c.id}`}
                  className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                >
                  <StudentAvatar name={c.name} seed={c.admissionNumber} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-foreground group-hover:text-primary-deep">{c.name}</span>
                    <span className="block text-sm font-semibold text-foreground">
                      {c.place?.label ?? "No class this year"}
                      {c.place?.rollNumber != null && <span className="font-normal text-foreground-muted"> · Roll {c.place.rollNumber}</span>}
                    </span>
                    <span className="block font-mono text-xs text-foreground-muted">{c.admissionNumber}</span>
                  </span>
                  <ChevronRight className="size-5 text-foreground-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
