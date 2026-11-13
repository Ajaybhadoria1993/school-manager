import { Link, useParams } from "react-router";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useGetTeacherQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { AssignClassForm } from "../../components/teachers/AssignClassForm";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

const linkClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Assign class (`/teachers/:id/assign-class` from Teacher, `/school/teachers/:id/assign-class` from Manage Teacher, 2026-11-13: a page of its
 * own, it was a window): gives a teacher a subject (and its days and periods) and/or the class teacher post of a class, with the class's
 * timetable beside the form. Opened from the **Assign class** button of the teacher's page; a success or Cancel goes back to that page.
 * Needs `teachers.edit` and the running year (the routes say so).
 */
export default function TeacherAssignClassPage() {
  const { id = "" } = useParams();
  const { base, label } = useTeacherBase();
  const res = useGetTeacherQuery(id);
  const teacher = res.data?.data;

  if (res.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  if (!teacher) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Assign class" crumbs={[{ label, to: base }]} />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teacher."}</p>
          <Link to={base} className={linkClass}>
            All teachers
          </Link>
        </Card>
      </div>
    );
  }
  const back = `${base}/${teacher.id}`;
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Assign class" subtitle={teacher.name} crumbs={[{ label, to: base }, { label: teacher.name, to: back }]} />
      {teacher.isActive ? (
        <AssignClassForm teacher={teacher} backTo={back} />
      ) : (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-foreground-muted">{teacher.name} has left the school, so no class can be given to them.</p>
          <Link to={back} className={linkClass}>
            Back to {teacher.name}
          </Link>
        </Card>
      )}
    </div>
  );
}
