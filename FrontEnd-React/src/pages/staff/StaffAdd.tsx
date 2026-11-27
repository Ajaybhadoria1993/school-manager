import { useState } from "react";
import { Link } from "react-router";
import { CircleCheck, UserPlus } from "lucide-react";
import { useNewPhoto } from "../../hooks/useNewPhoto";
import { useCreateStaffMemberMutation } from "../../redux/api/staffApi";
import { PhotoPicker } from "../../components/profile/PhotoPicker";
import type { StaffMember } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { emptyStaffForm, staffFieldId, staffKeyOfPath, staffProblems, toStaffInput, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { StaffForm } from "../../components/staff/StaffForm";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { InviteSentCard } from "../../components/logins/InviteSentCard";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const freshForm = (): StaffFormValues => emptyStaffForm();

/**
 * Staff > Add staff (`/staff/new`): a person who works for the school without teaching. Their details and a role, and **Give login access**
 * (2026-11-26): ticked, the email is needed; it becomes their login and gets an invitation to choose a password (the login is Pending until
 * then; the role decides what they see). The school makes no username or password. Nothing is sent until the button; a box that is wrong
 * says so under it, and what the server refuses (an email that is somebody's login) says so under its box too.
 */
export default function StaffAddPage() {
  const [create, { isLoading: sending }] = useCreateStaffMemberMutation();
  const [values, setValues] = useState<StaffFormValues>(freshForm);
  const [revealed, setRevealed] = useState<ReadonlySet<StaffFormKey>>(new Set());
  const [refused, setRefused] = useState<StaffProblems>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [added, setAdded] = useState<StaffMember | null>(null);
  // Optional: kept until the person is made, then saved for them.
  const photo = useNewPhoto();

  const problems = staffProblems(values);
  const errors: StaffProblems = { ...Object.fromEntries([...revealed].flatMap((k) => (problems[k] ? [[k, problems[k]]] : []))), ...refused };

  const change = <K extends StaffFormKey>(key: K, value: StaffFormValues[K]) => {
    setValues((now) => ({ ...now, [key]: value }));
    setRefused(({ [key]: _gone, ...rest }) => rest);
  };
  const reveal = (key: StaffFormKey) => setRevealed((now) => new Set([...now, key]));
  const focus = (key: StaffFormKey) => document.getElementById(staffFieldId(key))?.focus();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    const wrong = Object.keys(problems) as StaffFormKey[];
    if (wrong.length > 0) {
      setRevealed((now) => new Set([...now, ...wrong]));
      setFormError("Some boxes need a change: see the messages in red.");
      focus(wrong[0]);
      return;
    }
    try {
      const made = (await create(toStaffInput(values)).unwrap()).data;
      await photo.saveFor({ kind: "staff", id: made.id });
      setAdded(made);
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
        setFormError(error?.message ?? "Could not add the staff member. Please try again.");
      }
    }
  }

  function again() {
    setValues(freshForm());
    setRevealed(new Set());
    setRefused({});
    setFormError(null);
    setAdded(null);
    photo.clear();
  }

  const crumbs = [{ label: "Staff", to: "/staff" }];

  if (added) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add staff" crumbs={crumbs} />
        <Card role="status" className="flex items-center gap-3 border-success-line bg-success-soft/40 px-5 py-4">
          <CircleCheck className="size-6 shrink-0 text-success" aria-hidden />
          <h2 className="text-section-heading">{added.name} is added</h2>
        </Card>
        {photo.problem && <ModalError message={photo.problem} />}
        {added.invite && <InviteSentCard invite={added.invite} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/staff" className={outlineLink}>
            Back to staff
          </Link>
          <Button type="button" onClick={again}>
            <UserPlus className="size-4" aria-hidden />
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <StudentFormHeader title="Add staff" crumbs={crumbs} />
      {formError && <ModalError message={formError} />}
      <StaffForm
        values={values}
        errors={errors}
        onChange={change}
        onReveal={reveal}
        photo={<PhotoPicker label="Photo" optional name={values.name} photo={photo.preview} onPick={photo.pick} onRemove={photo.clear} />}
      />
      <FormActionBar>
        <span />
        <Button type="submit" size="lg" loading={sending}>
          {!sending && <UserPlus className="size-4" aria-hidden />}
          Add staff
        </Button>
      </FormActionBar>
    </form>
  );
}
