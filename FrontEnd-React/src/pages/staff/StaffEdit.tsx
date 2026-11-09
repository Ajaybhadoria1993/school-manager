import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Save } from "lucide-react";
import { useGetStaffMemberQuery, useUpdateStaffMemberMutation } from "../../redux/api/staffApi";
import type { StaffMember } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { formFromStaff, staffFieldId, staffKeyOfPath, staffProblems, toStaffInput, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { StaffForm } from "../../components/staff/StaffForm";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Staff > a person > Change (`/staff/:id/edit`): the boxes of Add staff on one page with one Save, without the Login (the username and the
 * password are changed from the Staff list). The email is only a contact: it can be changed or emptied. A new role applies at the
 * person's next sign-in (their sessions end now). *Also a teacher* can be switched on (they become a teacher at once); a person who
 * teaches here already has it locked on (they stop as a teacher on the Teacher page). Making them inactive or active, a new password,
 * a new username and removing a person with no login are on the Staff list.
 */
export default function StaffEditPage() {
  const { id = "" } = useParams();
  const res = useGetStaffMemberQuery(id);
  const member = res.data?.data;
  if (res.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (!member) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Change staff" crumbs={[{ label: "Staff", to: "/staff" }]} />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the staff member."}</p>
          <Link to="/staff" className={outlineLink}>
            All staff
          </Link>
        </Card>
      </div>
    );
  }
  return <EditForm member={member} />;
}

function EditForm({ member }: { member: StaffMember }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [update, { isLoading: saving }] = useUpdateStaffMemberMutation();
  const initial = useMemo(() => formFromStaff(member), [member]);
  const [values, setValues] = useState<StaffFormValues>(initial);
  const [revealed, setRevealed] = useState<ReadonlySet<StaffFormKey>>(new Set());
  const [refused, setRefused] = useState<StaffProblems>({});
  const [formError, setFormError] = useState<string | null>(null);

  const problems = staffProblems(values, { editing: true });
  const errors: StaffProblems = { ...Object.fromEntries([...revealed].flatMap((k) => (problems[k] ? [[k, problems[k]]] : []))), ...refused };
  const changed = JSON.stringify(values) !== JSON.stringify(initial);

  const change = <K extends StaffFormKey>(key: K, value: StaffFormValues[K]) => {
    setValues((now) => ({ ...now, [key]: value }));
    setRefused(({ [key]: _gone, ...rest }) => rest);
  };
  const focus = (key: StaffFormKey) => document.getElementById(staffFieldId(key))?.focus();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const wrong = Object.keys(problems) as StaffFormKey[];
    if (wrong.length > 0) {
      setRevealed((now) => new Set([...now, ...wrong]));
      setFormError("Some boxes need a change: see the messages in red.");
      focus(wrong[0]);
      return;
    }
    try {
      await update({ id: member.id, ...toStaffInput(values, { editing: true }) }).unwrap();
      push("success", `${values.name.trim()} is saved`);
      navigate("/staff");
    } catch (err) {
      const error = getApiError(err);
      const found: StaffProblems = {};
      for (const row of Array.isArray(error?.details) ? (error.details as { path?: unknown; message?: unknown }[]) : []) {
        const key = typeof row.path === "string" ? staffKeyOfPath(row.path) : null;
        if (key && typeof row.message === "string" && found[key] === undefined) found[key] = row.message;
      }
      if (Object.keys(found).length > 0) {
        setRefused(found);
        setFormError("Some boxes need a change: see the messages in red.");
        focus(Object.keys(found)[0] as StaffFormKey);
      } else {
        setFormError(error?.message ?? "Could not save. Please try again.");
      }
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <StudentFormHeader title="Change staff" subtitle={member.name} crumbs={[{ label: "Staff", to: "/staff" }]} />
      {formError && <ModalError message={formError} />}
      <StaffForm values={values} errors={errors} onChange={change} onReveal={(key) => setRevealed((now) => new Set([...now, key]))} editing teachingLocked={member.isTeacher} />
      <FormActionBar>
        <span />
        <Button type="submit" size="lg" loading={saving} disabled={!changed}>
          {!saving && <Save className="size-4" aria-hidden />}
          Save changes
        </Button>
      </FormActionBar>
    </form>
  );
}
