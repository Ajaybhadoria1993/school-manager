import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Save } from "lucide-react";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useTeacherForm } from "../../hooks/useTeacherForm";
import { useGetTeacherQuery, useUpdateTeacherMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { formFromTeacher, stepOfKey, toTeacherInput, type TeacherFormKey } from "../../utils/teachers";
import type { Teacher } from "../../types";
import { JobFields, PersonalFields, TeachingFields } from "../../components/teachers/TeacherFields";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const linkClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const WITHOUT_LOGIN = { login: false } as const;
// A teacher who has a login needs a mobile number (as when the login was made) but not a gender: an older teacher was given a login without one.
const WITH_LOGIN_BOXES = { login: true, requireGender: false } as const;

/**
 * Manage school > Teachers > Change (`/school/teachers/:id/edit`): the boxes of Add teacher (personal, job, teaching) on one page with
 * one Save. The login is not here: it is made and given a new password on the teacher's own page. A teacher who has a login needs a
 * mobile number; one who has none needs only a name.
 */
export default function TeacherEditPage() {
  const { id = "" } = useParams();
  const { base, label } = useTeacherBase();
  const res = useGetTeacherQuery(id);
  const teacher = res.data?.data;

  if (res.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (!teacher) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Change teacher" crumbs={[{ label, to: base }]} />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teacher."}</p>
          <Link to={base} className={linkClass}>
            All teachers
          </Link>
        </Card>
      </div>
    );
  }
  return <EditForm teacher={teacher} />;
}

function EditForm({ teacher }: { teacher: Teacher }) {
  const navigate = useNavigate();
  const { base, label } = useTeacherBase();
  const { push } = useToast();
  const [update, { isLoading: saving }] = useUpdateTeacherMutation();
  const initial = useMemo(() => formFromTeacher(teacher), [teacher]);
  const hasLogin = teacher.login !== null;
  const form = useTeacherForm(initial, hasLogin ? WITH_LOGIN_BOXES : WITHOUT_LOGIN);
  const [formError, setFormError] = useState<string | null>(null);

  // The login's own boxes are not on this form: they are not asked here, whatever they hold.
  const problemKeys = (Object.keys(form.problems) as TeacherFormKey[]).filter((k) => stepOfKey(k) !== "login");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    if (problemKeys.length > 0) {
      form.reveal(problemKeys);
      form.focusFirst(problemKeys);
      setFormError("Some boxes need a change: see the messages in red.");
      return;
    }
    try {
      await update({ id: teacher.id, ...toTeacherInput(form.values, WITHOUT_LOGIN) }).unwrap();
      push("success", `${form.values.name.trim()} is saved`);
      navigate(`${base}/${teacher.id}`);
    } catch (err) {
      const error = getApiError(err);
      const keys = form.showServerErrors(error?.details);
      if (keys.length > 0) {
        setFormError("Some boxes need a change: see the messages in red.");
        form.focusFirst(keys);
      } else {
        setFormError(error?.message ?? "Could not save the teacher. Please try again.");
      }
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <StudentFormHeader title="Change teacher" subtitle={teacher.name} crumbs={[{ label, to: base }, { label: teacher.name, to: `${base}/${teacher.id}` }]} />

      {formError && <ModalError message={formError} />}

      <PersonalFields form={form} needed={hasLogin} genderNeeded={false} />
      <JobFields form={form} index={2} />
      <TeachingFields form={form} index={3} />

      <FormActionBar>
        <span />
        <Button type="submit" size="lg" loading={saving} disabled={!form.changed}>
          {!saving && <Save className="size-4" aria-hidden />}
          Save changes
        </Button>
      </FormActionBar>
    </form>
  );
}
