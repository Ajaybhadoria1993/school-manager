import { useState } from "react";
import { Link } from "react-router";
import { CircleAlert, CircleCheck, Send, UserPlus } from "lucide-react";
import { useCreateStaffMemberMutation } from "../../redux/api/staffApi";
import type { StaffInviteDelivery, StaffMember } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { emptyStaffForm, staffFieldId, staffKeyOfPath, staffProblems, toStaffInput, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { StaffForm } from "../../components/staff/StaffForm";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Staff > Add staff (`/staff/new`): a person who works for the school without teaching. Their details, a role and the email the
 * invitation goes to; **Send invitation** adds them as "Invited" and emails a link. They open it, choose a password, and from then on sign
 * in with the email and the password (the role decides what they see). Nothing is sent until the button; a box that is wrong says so under
 * it, and what the server refuses (an email that already has a login) says so under its box too.
 */
export default function StaffAddPage() {
  const [create, { isLoading: sending }] = useCreateStaffMemberMutation();
  const [values, setValues] = useState<StaffFormValues>(emptyStaffForm);
  const [revealed, setRevealed] = useState<ReadonlySet<StaffFormKey>>(new Set());
  const [refused, setRefused] = useState<StaffProblems>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<(StaffMember & StaffInviteDelivery) | null>(null);

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
      setSent((await create({ ...toStaffInput(values), email: values.email.trim().toLowerCase() } as never).unwrap()).data);
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
    setValues(emptyStaffForm());
    setRevealed(new Set());
    setRefused({});
    setFormError(null);
    setSent(null);
  }

  const crumbs = [{ label: "Staff", to: "/staff" }];

  if (sent) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add staff" crumbs={crumbs} />
        <Card role="status" className={sent.emailSent ? "flex items-start gap-3 border-success-line bg-success-soft/40 px-5 py-4" : "flex items-start gap-3 border-warning-line bg-warning-soft/60 px-5 py-4"}>
          {sent.emailSent ? <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />}
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-foreground">{sent.emailSent ? "Invitation sent" : `${sent.name} is added, but the email did not go out`}</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {sent.emailSent
                ? `An email with a link was sent to ${sent.email}. ${sent.name} opens it, chooses a password and joins as ${sent.roleLabel}. From then on they sign in with that email and password.`
                : `${sent.name} is in Staff as Invited. Open Staff and press Resend invite to try the email again.`}
            </p>
            {sent.devInviteLink && <p className="mt-2 break-all text-xs text-foreground-muted">Link (development only, no mail server is set up): {sent.devInviteLink}</p>}
          </div>
        </Card>
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
      <StaffForm values={values} errors={errors} onChange={change} onReveal={reveal} />
      <FormActionBar>
        <span />
        <Button type="submit" size="lg" loading={sending}>
          {!sending && <Send className="size-4" aria-hidden />}
          Send invitation
        </Button>
      </FormActionBar>
    </form>
  );
}
