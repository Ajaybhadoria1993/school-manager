import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, CircleCheck, UserPlus } from "lucide-react";
import { DEFAULT_TEACHER_RULES } from "../../constants/teacherFields";
import { teacherFieldId, useTeacherForm } from "../../hooks/useTeacherForm";
import { useFreeUsername, useUsernameCheck } from "../../hooks/useUsernameCheck";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useCreateTeacherMutation, useGetTeacherSettingsQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { TEACHER_STEPS, emptyTeacherForm, generatePassword, jobAsked, problemKeysOf, stepOfKey, toTeacherInput, usernameFor, type TeacherFormKey } from "../../utils/teachers";
import { askedFields, ownAnswersOf, ownFieldId, ownProblems, refusedOwn, type OwnValues } from "../../utils/teacherOwn";
import type { Teacher } from "../../types";
import { CredentialsCard } from "../../components/teachers/CredentialsCard";
import { OwnFieldsCard } from "../../components/teachers/OwnFieldsCard";
import { JobFields, LoginFields, PersonalFields, TeachingFields } from "../../components/teachers/TeacherFields";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Steps } from "../../components/ui/Steps";

/** Every teacher added here gets a login, so the form always asks for one. (Stable, so the form does not check itself again each time.) */
const WITH_LOGIN = { login: true } as const;
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Add teacher (`/school/teachers/new` from Manage Teacher, `/teachers/new` from Teacher): the teacher in four steps, like onboarding and Add student: Personal info, Job
 * details, Teaching (what they can teach, their limits and days off) and Login (a username, the name with a number, checked free on
 * the whole platform as it is typed, and a first password the school can have made). Next checks its own step; the last step makes
 * the teacher and the login in one request. The password is shown once, afterwards, to give to the teacher: only a hash of it is kept.
 */
export default function TeacherAddPage() {
  // Opened from Teacher (`/teachers/new`) or from Manage Teacher: the breadcrumb and View teacher stay there.
  const { base, label } = useTeacherBase();
  const crumbs = [{ label, to: base }];
  const [create, { isLoading: sending }] = useCreateTeacherMutation();
  // What the school asks (Teacher > Manage fields): the usual details (needed, optional or not asked) and its own fields.
  const settings = useGetTeacherSettingsQuery().data?.data;
  const rules = useMemo(() => ({ ...DEFAULT_TEACHER_RULES, ...settings?.fields }), [settings?.fields]);
  const options = useMemo(() => ({ ...WITH_LOGIN, rules }), [rules]);
  const form = useTeacherForm(useMemo(emptyTeacherForm, []), options);
  // The school's own fields the school asks: asked in the Job step, sent with the teacher.
  const own = askedFields(settings?.customFields);
  // The Job step is left out when the school asks none of its details and has no field of its own.
  const steps = useMemo(() => TEACHER_STEPS.filter((s) => s.key !== "job" || jobAsked(rules) || own.length > 0), [rules, own.length]);
  const [ownValues, setOwnValues] = useState<OwnValues>({});
  const [ownShown, setOwnShown] = useState(false);
  const [ownServer, setOwnServer] = useState<Record<string, string>>({});
  const ownErrors = { ...(ownShown ? ownProblems(own, ownValues) : {}), ...ownServer };

  const [position, setPosition] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [passed, setPassed] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [focusKeys, setFocusKeys] = useState<TeacherFormKey[] | null>(null);
  const [added, setAdded] = useState<{ teacher: Teacher; password: string } | null>(null);

  const step = steps[Math.min(position, steps.length - 1)];
  const last = position === steps.length - 1;
  const usernameCheck = useUsernameCheck(form.values.username, step.key === "login");
  // The username made from the name is swapped for a free one when somebody (any school) already has it.
  useFreeUsername(usernameCheck, form.wasTyped("username"), (free) => form.set("username", free));

  const openStep = useCallback(
    (index: number) => {
      // Arriving at the Login step: a username from the name (with a number; the same one again for the same name) and a password
      // already made, unless the person has typed their own. (Not when it is already open: a refused username must stay as it is.)
      if (steps[index].key === "login" && index !== position) {
        if (!form.wasTyped("username")) form.set("username", usernameFor(form.values.username, form.values.name));
        if (form.values.password === "") form.set("password", generatePassword());
      }
      setPosition(index);
      setFurthest((f) => Math.max(f, index));
    },
    [form, position, steps]
  );

  // A new step starts at the top of the page; a refused box gets the cursor once its step is on the screen.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [position]);
  useEffect(() => {
    if (!focusKeys) return;
    form.focusFirst(focusKeys);
    setFocusKeys(null);
  }, [focusKeys, form]);

  /** Opens the first step that has a wrong box in `keys` and puts the cursor in it. */
  function showStepOf(keys: readonly TeacherFormKey[]) {
    const index = steps.findIndex((s) => keys.some((k) => stepOfKey(k) === s.key));
    if (index < 0) return;
    openStep(index);
    setFocusKeys(keys.filter((k) => stepOfKey(k) === steps[index].key));
  }

  function goNext() {
    const wrong = problemKeysOf(form.problems, step.key);
    if (wrong.length > 0) {
      form.reveal(wrong);
      form.focusFirst(wrong);
      return;
    }
    // The Job step also holds the school's own fields: a needed one left empty, or a wrong answer, holds Next back.
    const ownWrong = step.key === "job" ? Object.keys(ownProblems(own, ownValues)) : [];
    if (ownWrong.length > 0) {
      setOwnShown(true);
      document.getElementById(ownFieldId(ownWrong[0]))?.focus();
      return;
    }
    setPassed((p) => (p.includes(position) ? p : [...p, position]));
    openStep(position + 1);
  }

  async function send() {
    setFormError(null);
    try {
      const res = await create({ ...toTeacherInput(form.values, WITH_LOGIN), ...(own.length > 0 ? { custom: ownAnswersOf(own, ownValues, "add") } : {}) }).unwrap();
      setAdded({ teacher: res.data, password: form.values.password });
    } catch (err) {
      const error = getApiError(err);
      const keys = form.showServerErrors(error?.details);
      const ownRefused = refusedOwn(error?.details);
      if (Object.keys(ownRefused).length > 0) {
        setOwnServer(ownRefused);
        setFormError("Some boxes need a change: see the messages in red.");
        openStep(steps.findIndex((s) => s.key === "job"));
      } else if (keys.length > 0) {
        setFormError("Some boxes need a change: see the messages in red.");
        showStepOf(keys);
      } else {
        setFormError(error?.message ?? "Could not add the teacher. Please try again.");
      }
    }
  }

  /** Enter in a box, or the button: on a step before the last it goes on; on the last one it adds the teacher. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    if (!last) {
      goNext();
      return;
    }
    const wrong = Object.keys(form.problems) as TeacherFormKey[];
    if (wrong.length > 0) {
      form.reveal(wrong);
      setFormError("Some boxes need a change: see the messages in red.");
      const first = steps.find((s) => problemKeysOf(form.problems, s.key).length > 0);
      if (first && first.key !== step.key) showStepOf(problemKeysOf(form.problems, first.key));
      else form.focusFirst(problemKeysOf(form.problems, step.key));
      return;
    }
    // The school's own fields: a needed one left empty, or a wrong answer, is said in the Job step.
    const ownWrong = Object.keys(ownProblems(own, ownValues));
    if (ownWrong.length > 0) {
      setOwnShown(true);
      setFormError("Some boxes need a change: see the messages in red.");
      if (step.key !== "job") openStep(steps.findIndex((s) => s.key === "job"));
      return;
    }
    // Taken, as the box already says (with free ones under it): nothing is sent.
    if (usernameCheck.state === "taken") {
      document.getElementById(teacherFieldId("username"))?.focus();
      return;
    }
    void send();
  }

  function startAgain() {
    form.reset(emptyTeacherForm());
    setOwnValues({});
    setOwnShown(false);
    setOwnServer({});
    setPosition(0);
    setFurthest(0);
    setPassed([]);
    setFormError(null);
    setAdded(null);
  }

  if (added) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add teacher" crumbs={crumbs} />
        <Card className="flex items-center gap-3 border-success-line bg-success-soft/40 px-5 py-4">
          <CircleCheck className="size-6 shrink-0 text-success" aria-hidden />
          <h2 className="text-section-heading">{added.teacher.name} is added</h2>
        </Card>
        <CredentialsCard teacher={added.teacher.name} username={added.teacher.login?.username ?? form.values.username} password={added.password} />
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`${base}/${added.teacher.id}`} className={outlineLink}>
            View teacher
          </Link>
          <Button type="button" onClick={startAgain}>
            <UserPlus className="size-4" aria-hidden />
            Add another teacher
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <StudentFormHeader title="Add teacher" crumbs={crumbs} />

      {formError && <ModalError message={formError} />}

      <Card className="px-5 py-4 sm:px-7 sm:py-5">
        <Steps steps={steps} active={position} completed={passed} furthest={furthest} onSelect={openStep} />
      </Card>

      {/* `key` gives each step a fresh start; the values are the form's, so nothing typed is lost by moving. */}
      <div key={step.key} className="rise-in min-w-0 space-y-6">
        {step.key === "personal" && <PersonalFields form={form} needed />}
        {step.key === "job" && (
          <>
            <JobFields form={form} />
            {own.length > 0 && (
              <OwnFieldsCard
                index={1}
                fields={own}
                values={ownValues}
                errors={ownErrors}
                onChange={(key, value) => {
                  setOwnValues((now) => ({ ...now, [key]: value }));
                  setOwnServer(({ [key]: _gone, ...rest }) => rest);
                }}
              />
            )}
          </>
        )}
        {step.key === "teaching" && <TeachingFields form={form} />}
        {step.key === "login" && <LoginFields form={form} check={usernameCheck} />}
      </div>

      <FormActionBar>
        <span />
        <div className="flex items-center gap-3">
          {position > 0 && (
            <Button type="button" variant="outline" size="lg" disabled={sending} aria-label="Previous step" onClick={() => openStep(position - 1)}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
          )}
          {last ? (
            <Button type="submit" size="lg" loading={sending}>
              {!sending && <UserPlus className="size-4" aria-hidden />}
              Add teacher
            </Button>
          ) : (
            <Button type="submit" size="lg">
              Next step
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </FormActionBar>
    </form>
  );
}
