import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, CircleCheck, UserPlus } from "lucide-react";
import { DEFAULT_TEACHER_RULES } from "../../constants/teacherFields";
import { useTeacherForm } from "../../hooks/useTeacherForm";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useNewPhoto } from "../../hooks/useNewPhoto";
import { useNewResume } from "../../hooks/useNewResume";
import { ResumePicker } from "../../components/profile/ResumePicker";
import { PhotoPicker } from "../../components/profile/PhotoPicker";
import { useCreateTeacherMutation, useGetTeacherSettingsQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { TEACHER_STEPS, emptyTeacherForm, jobAsked, problemKeysOf, stepOfKey, toTeacherInput, type TeacherFormKey } from "../../utils/teachers";
import { askedFields, ownAnswersOf, ownFieldId, ownProblems, refusedOwn, type OwnValues } from "../../utils/teacherOwn";
import type { Teacher } from "../../types";
import { InviteSentCard } from "../../components/logins/InviteSentCard";
import { OwnFieldsCard } from "../../components/teachers/OwnFieldsCard";
import { JobFields, PersonalFields, TeachingFields } from "../../components/teachers/TeacherFields";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Steps } from "../../components/ui/Steps";

/** A teacher added here needs the details of Add teacher, and the email when login access is ticked. (Stable, so the form does not check itself again each time.) */
const WITH_LOGIN = { login: true } as const;
const outlineLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Add teacher (`/school/teachers/new` from Manage Teacher, `/teachers/new` from Teacher): the teacher in steps, like onboarding and Add student:
 * Personal info (with "Give login access": ticked, the email is needed), Job details and Teaching (what they can teach, their limits and days
 * off). Next checks its own step; the last step makes the teacher in one request. With login access their email is the login and an
 * invitation goes to it: the login is Pending until they choose a password from the link (2026-11-26: the school makes no username or
 * password any more).
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
  const [added, setAdded] = useState<Teacher | null>(null);
  // Optional: kept until the teacher is made, then saved for them.
  const photo = useNewPhoto();
  const resume = useNewResume();

  const step = steps[Math.min(position, steps.length - 1)];
  const last = position === steps.length - 1;

  const openStep = useCallback((index: number) => {
    setPosition(index);
    setFurthest((f) => Math.max(f, index));
  }, []);

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
      await photo.saveFor({ kind: "teacher", id: res.data.id });
      await resume.saveFor(res.data.id);
      setAdded(res.data);
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
    photo.clear();
    resume.clear();
  }

  if (added) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add teacher" crumbs={crumbs} />
        <Card className="flex items-center gap-3 border-success-line bg-success-soft/40 px-5 py-4">
          <CircleCheck className="size-6 shrink-0 text-success" aria-hidden />
          <h2 className="text-section-heading">{added.name} is added</h2>
        </Card>
        {photo.problem && <ModalError message={photo.problem} />}
        {resume.problem && <ModalError message={resume.problem} />}
        {added.invite && <InviteSentCard invite={added.invite} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`${base}/${added.id}`} className={outlineLink}>
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
        {step.key === "personal" && (
          <PersonalFields
            form={form}
            needed
            loginAccess
            uploads={
              <>
                <PhotoPicker label="Photo" optional name={form.values.name} photo={photo.preview} onPick={photo.pick} onRemove={photo.clear} />
                <ResumePicker optional file={resume.file} onPick={resume.pick} onRemove={resume.clear} />
              </>
            }
          />
        )}
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
