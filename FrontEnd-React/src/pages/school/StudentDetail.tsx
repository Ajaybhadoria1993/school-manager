import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowRightLeft, CircleCheck, HeartHandshake, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { useCan } from "../../hooks/useCan";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetCapacityQuery, useGetStudentQuery, useGetStudentSettingsQuery, useReactivateStudentsMutation } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { formatDay } from "../../utils/academicYear";
import { formatMoment, placeLabel } from "../../utils/students";
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
import { useToast } from "../../components/ui/toast-context";
import { PlacementDialog } from "../../components/students/status/PlacementDialog";
import { TransferDialog } from "../../components/students/detail/TransferDialog";
import { DeactivateDialog } from "../../components/students/status/DeactivateDialog";
import { CredentialsCard } from "../../components/teachers/CredentialsCard";
import type { SiblingOf } from "./StudentAdmit";

/**
 * Manage school > Students > one student (`/school/students/:id`). Opening it asks for this student only (a student just admitted or
 * saved is already known: nothing is asked). It shows everything about them: this year's class, their details, their parents,
 * their brothers and sisters (each a link), their class in every year, the address. Edit turns the page into the same form as the
 * admission, with one Save at the top; only then are the class layout and the seats read (for the class and section chips).
 */
/** The page's address state from Add student. */
export interface Arrived {
  admitted?: boolean;
  parentLogin?: { name: string; username: string; password: string };
  parentLoginError?: string;
}

export default function StudentDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const arrived = useLocation().state as Arrived | null;
  const justAdmitted = !!arrived?.admitted;
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
      arrived={arrived}
      onEdit={() => setEditing(true)}
      onSibling={(family) => navigate("/school/students/new", { state: { siblingOf: family } })}
    />
  );
}

function StudentView({
  student,
  custom,
  justAdmitted,
  arrived,
  onEdit,
  onSibling,
}: {
  student: StudentDetail;
  custom: CustomFieldDef[];
  justAdmitted: boolean;
  /** What Add student says on arriving: the parent's login it made (shown once), or why it could not. */
  arrived: Arrived | null;
  onEdit: () => void;
  onSibling: (family: SiblingOf) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reactivate] = useReactivateStudentsMutation();
  const { push } = useToast();
  // A year that is over is only looked at: no Edit, Transfer, Make inactive or Add a sibling (the server refuses them too).
  const readOnly = useReadOnlyYear();
  const can = useCan();
  const inactive = student.status === "inactive";
  const family: SiblingOf = {
    name: student.name,
    guardians: student.guardians.flatMap((g) => (g.mobile ? [{ mobile: g.mobile, relation: g.relation, isPrimary: g.isPrimary }] : [])),
    address: student.address,
  };

  /** Active again: one request; the page, the lists and the seats are read again by their tags. */
  async function makeActive() {
    // A student who left in an earlier year has no class this year: ask where to put them.
    if (!student.place) {
      setPlacing(true);
      return;
    }
    setWorking(true);
    setProblem(null);
    try {
      const res = await reactivate({ ids: [student.id] }).unwrap();
      push("success", res.message ?? "Active again");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not make the student active. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={student.name}
        subtitle={[student.admissionNumber, inactive ? "Inactive" : placeLabel(student.place), !inactive && student.place?.rollNumber != null ? `Roll ${student.place.rollNumber}` : null].filter(Boolean).join(" · ")}
        actions={
          readOnly ? undefined : inactive ? (
            can("students.status") ? (
              <WithTip tip="Puts the student back in their class and section, in the list, the seats and the Excel.">
                <Button type="button" loading={working} onClick={() => void makeActive()}>
                  <UserCheck className="size-4" aria-hidden />
                  Make active
                </Button>
              </WithTip>
            ) : undefined
          ) : (
            <>
              {can("students.add") && (
                <WithTip tip="Admit a brother or sister: the parents are found by their numbers and linked, and the address is filled in.">
                  <Button type="button" variant="outline" onClick={() => onSibling(family)}>
                    <HeartHandshake className="size-4" aria-hidden />
                    Add a sibling
                  </Button>
                </WithTip>
              )}
              {can("students.edit", "students.status") && (
                <WithTip tip="Move the student to another class or section of this school, or to another school with a transfer certificate. Nothing is deleted: it is written in their history.">
                  <Button type="button" variant="outline" onClick={() => setTransferring(true)}>
                    <ArrowRightLeft className="size-4" aria-hidden />
                    Transfer
                  </Button>
                </WithTip>
              )}
              {can("students.status") && (
                <WithTip tip="The student left the school: takes them out of the list, the seats and the Excel. Nothing is deleted, and one click makes them active again.">
                  <Button type="button" variant="outline" onClick={() => setAsking(true)}>
                    <UserX className="size-4" aria-hidden />
                    Make inactive
                  </Button>
                </WithTip>
              )}
              {can("students.edit") && (
                <WithTip tip="Change the details, the class or section this year, or a parent's details. Nothing is saved until you press Save.">
                  <Button type="button" onClick={onEdit}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </Button>
                </WithTip>
              )}
            </>
          )
        }
      />

      {problem && <p className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{problem}</p>}

      {inactive && student.inactive && (
        <Card className="flex flex-wrap items-center gap-3 border-amber-300/60 bg-warning-soft/60 px-5 py-4">
          <UserX className="size-5 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-bold">Inactive</span> since {formatMoment(student.inactive.at)}, made inactive by {student.inactive.by.name}
            {student.inactive.reason ? `: ${student.inactive.reason}` : ""}. They are not in the list, the seats or the Excel. Their details stay here, and Make active
            brings them back.
            {student.inactive.transfer && (student.inactive.transfer.tcNumber || student.inactive.transfer.tcDate || student.inactive.transfer.remarks) && (
              <span className="mt-1 block text-xs text-foreground-muted">
                {[
                  student.inactive.transfer.tcNumber ? `Certificate ${student.inactive.transfer.tcNumber}` : null,
                  student.inactive.transfer.tcDate ? `dated ${formatDay(student.inactive.transfer.tcDate)}` : null,
                  student.inactive.transfer.remarks,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </p>
        </Card>
      )}

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

      {/* The parent's login Add student made: shown this once, to hand over (only a hash of the password is kept). */}
      {arrived?.parentLogin && (
        <section className="space-y-2">
          <h2 className="text-section-heading">Login of {arrived.parentLogin.name}</h2>
          <CredentialsCard teacher={arrived.parentLogin.name} username={arrived.parentLogin.username} password={arrived.parentLogin.password} />
        </section>
      )}
      {arrived?.parentLoginError && (
        <Card className="border-warning-line bg-warning-soft/50 px-5 py-4 text-sm text-foreground">
          The parent&apos;s login was not made: {arrived.parentLoginError} Make it from the parent&apos;s card below.
        </Card>
      )}

      <StudentOverview student={student} custom={custom} />

      {asking && <DeactivateDialog students={[student]} onClose={() => setAsking(false)} />}
      {transferring && <TransferDialog student={student} onClose={() => setTransferring(false)} />}
      {placing && <PlacementDialog students={[student]} onClose={() => setPlacing(false)} />}
    </div>
  );
}
