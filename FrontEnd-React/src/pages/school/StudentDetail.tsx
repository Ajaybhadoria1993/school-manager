import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { CircleCheck, HeartHandshake, Pencil, UserPlus } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetCapacityQuery, useGetStudentQuery, useGetStudentSettingsQuery } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { placeLabel } from "../../utils/students";
import type { CustomFieldDef } from "../../constants/studentFields";
import type { StudentDetail } from "../../types";
import { EditStudentForm } from "../../components/students/detail/EditStudentForm";
import { StudentOverview } from "../../components/students/detail/StudentOverview";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { WithTip } from "../../components/ui/Hint";
import { Skeleton } from "../../components/ui/Skeleton";
import type { SiblingOf } from "./StudentAdmit";

/**
 * Manage school > Students > one student (`/school/students/:id`). Opening it asks for this student only (a student just admitted or
 * saved is already known: nothing is asked). It shows everything about them: this year's class, their details, their parents,
 * their brothers and sisters (each a link), their class in every year, the address. Edit turns the page into the same form as the
 * admission, with one Save at the top; only then are the class layout and the seats read (for the class and section chips).
 */
export default function StudentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const justAdmitted = !!(useLocation().state as { admitted?: boolean } | null)?.admitted;
  const [editing, setEditing] = useState(false);
  const studentRes = useGetStudentQuery(id);
  // Only the edit form needs these.
  const structureRes = useGetStructureQuery(undefined, { skip: !editing });
  const capacityRes = useGetCapacityQuery(undefined, { skip: !editing });
  const student = studentRes.data?.data;
  // What this school needs (which boxes the form shows, and as needed or optional): read when the form opens, or to name the answers
  // of the school's own fields when this student has some.
  const hasOwnAnswers = !!student && Object.keys(student.custom ?? {}).length > 0;
  const settingsRes = useGetStudentSettingsQuery(undefined, { skip: !editing && !hasOwnAnswers });

  if (!student) {
    if (studentRes.error) {
      const notFound = getApiError(studentRes.error)?.status === 404;
      return (
        <div className="space-y-6">
          <StudentFormHeader title={notFound ? "Student not found" : "Could not load the student"} />
          {notFound ? (
            <StudentsNotice icon={UserPlus} tone="navy" title="This student is not in your school">
              <p>The link may be old. Find the student in the list.</p>
            </StudentsNotice>
          ) : (
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-danger">{getApiError(studentRes.error)?.message ?? "Could not load the student."}</p>
              <Button variant="outline" onClick={() => studentRes.refetch()}>
                Try again
              </Button>
            </Card>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (editing) {
    const structure = structureRes.data?.data;
    const rules = settingsRes.data?.data.fields;
    const custom = settingsRes.data?.data.customFields;
    if (!structure || !rules || !custom) {
      return (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      );
    }
    return <EditStudentForm key={student.id} student={student} structure={structure} capacity={capacityRes.data?.data} rules={rules} custom={custom} onDone={() => setEditing(false)} />;
  }

  return (
    <StudentView
      student={student}
      custom={settingsRes.data?.data.customFields ?? []}
      justAdmitted={justAdmitted}
      onEdit={() => setEditing(true)}
      onSibling={(family) => navigate("/school/students/new", { state: { siblingOf: family } })}
    />
  );
}

function StudentView({
  student,
  custom,
  justAdmitted,
  onEdit,
  onSibling,
}: {
  student: StudentDetail;
  custom: CustomFieldDef[];
  justAdmitted: boolean;
  onEdit: () => void;
  onSibling: (family: SiblingOf) => void;
}) {
  const family: SiblingOf = {
    name: student.name,
    guardians: student.guardians.flatMap((g) => (g.mobile ? [{ mobile: g.mobile, relation: g.relation, isPrimary: g.isPrimary }] : [])),
    address: student.address,
  };

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={student.name}
        subtitle={[student.admissionNumber, placeLabel(student.place), student.place?.rollNumber != null ? `Roll ${student.place.rollNumber}` : null].filter(Boolean).join(" · ")}
        actions={
          <>
            <WithTip tip="Admit a brother or sister: the parents are found by their numbers and linked, and the address is filled in.">
              <Button type="button" variant="outline" onClick={() => onSibling(family)}>
                <HeartHandshake className="size-4" aria-hidden />
                Admit a sibling
              </Button>
            </WithTip>
            <WithTip tip="Change the details, the class or section this year, or a parent's details. Nothing is saved until you press Save.">
              <Button type="button" onClick={onEdit}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
            </WithTip>
          </>
        }
      />

      {justAdmitted && (
        <Card className="pop-in flex flex-wrap items-center gap-3 border-emerald-300/60 bg-success-soft/60 px-5 py-4">
          <CircleCheck className="size-5 text-success" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-bold">{student.name}</span> is admitted, with admission number{" "}
            <span className="font-mono font-bold">{student.admissionNumber}</span>, in {placeLabel(student.place)}.
          </p>
          <Link to="/school/students/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primary-hover">
            <UserPlus className="size-4" aria-hidden />
            Admit another student
          </Link>
        </Card>
      )}

      <StudentOverview student={student} custom={custom} />
    </div>
  );
}
