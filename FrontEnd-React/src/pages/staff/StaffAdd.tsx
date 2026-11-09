import { useState } from "react";
import { Link } from "react-router";
import { CircleCheck, UserPlus } from "lucide-react";
import { useUsernameCheck, useFreeUsername } from "../../hooks/useUsernameCheck";
import { useCreateStaffMemberMutation } from "../../redux/api/staffApi";
import type { StaffMember } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { emptyStaffForm, staffFieldId, staffKeyOfPath, staffProblems, toStaffInput, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { generatePassword, usernameFor } from "../../utils/teachers";
import { StaffForm } from "../../components/staff/StaffForm";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { CredentialsCard } from "../../components/teachers/CredentialsCard";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/** A clean form with a password already made (the school reads it out or sends it; it can be typed or made again). */
const freshForm = (): StaffFormValues => ({ ...emptyStaffForm(), password: generatePassword() });

/**
 * Staff > Add staff (`/staff/new`): a person who works for the school without teaching. Their details, a role and the **username and
 * password the school makes for them** (the username follows the name until it is typed, and is checked free on the whole platform; the
 * password is made already). **Add staff** adds them and shows the username and the password once, to hand over: they sign in with
 * those (the role decides what they see). There is no invitation email for staff: that stays for the school admin. Nothing is sent
 * until the button; a box that is wrong says so under it, and what the server refuses (a username that was taken a moment ago) says so
 * under its box too.
 */
export default function StaffAddPage() {
  const [create, { isLoading: sending }] = useCreateStaffMemberMutation();
  const [values, setValues] = useState<StaffFormValues>(freshForm);
  const [typedUsername, setTypedUsername] = useState(false);
  const [revealed, setRevealed] = useState<ReadonlySet<StaffFormKey>>(new Set());
  const [refused, setRefused] = useState<StaffProblems>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ member: StaffMember; username: string; password: string } | null>(null);

  const check = useUsernameCheck(values.username, added === null);
  // A username made from the name is swapped for a free one when somebody (in any school) already has it; a typed one is left as typed.
  useFreeUsername(check, typedUsername, (free) => setValues((now) => ({ ...now, username: free })));

  const problems = staffProblems(values);
  const errors: StaffProblems = { ...Object.fromEntries([...revealed].flatMap((k) => (problems[k] ? [[k, problems[k]]] : []))), ...refused };

  const change = <K extends StaffFormKey>(key: K, value: StaffFormValues[K]) => {
    if (key === "username") setTypedUsername(true);
    const followName = key === "name" && !typedUsername ? { username: usernameFor(values.username, value as string) } : {};
    setValues((now) => ({ ...now, [key]: value, ...followName }));
    setRefused(({ [key]: _gone, ...rest }) => rest);
  };
  const reveal = (key: StaffFormKey) => setRevealed((now) => new Set([...now, key]));
  const focus = (key: StaffFormKey) => document.getElementById(staffFieldId(key))?.focus();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    const wrong = Object.keys(problems) as StaffFormKey[];
    // A username the check says is somebody's is not tried: the box already says so, with free ones to take.
    if (wrong.length > 0 || check.state === "taken") {
      setRevealed((now) => new Set([...now, ...wrong]));
      setFormError("Some boxes need a change: see the messages in red.");
      focus(wrong[0] ?? "username");
      return;
    }
    try {
      const made = (await create(toStaffInput(values)).unwrap()).data;
      setAdded({ member: made, username: made.login?.username ?? values.username.trim().toLowerCase(), password: values.password });
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
    setTypedUsername(false);
    setRevealed(new Set());
    setRefused({});
    setFormError(null);
    setAdded(null);
  }

  const crumbs = [{ label: "Staff", to: "/staff" }];

  if (added) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add staff" crumbs={crumbs} />
        <Card role="status" className="flex items-center gap-3 border-success-line bg-success-soft/40 px-5 py-4">
          <CircleCheck className="size-6 shrink-0 text-success" aria-hidden />
          <h2 className="text-lg font-bold tracking-tight text-foreground">{added.member.name} is added</h2>
        </Card>
        <CredentialsCard teacher={added.member.name} username={added.username} password={added.password} />
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
      <StaffForm values={values} errors={errors} onChange={change} onReveal={reveal} check={check} />
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
