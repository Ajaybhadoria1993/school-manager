import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Armchair, ArrowLeft, ArrowRight, CalendarX2, CopyCheck, Eraser, ListChecks, Trash2, UserPlus } from "lucide-react";
import { useStudentForm } from "../../hooks/useStudentForm";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useAdmitStudentMutation, useGetCapacityQuery, useGetStudentSettingsQuery, useLookupGuardianMutation } from "../../redux/api/studentsApi";
import type { CustomFieldDef, FieldRules } from "../../constants/studentFields";
import { stepKeyOfPath, stepsFor, problemPathsOf, firstStepWithProblems, type AdmitStepKey } from "../../utils/admitSteps";
import { getApiError } from "../../utils/apiErrors";
import { emptyGuardian, emptyStudentForm, formatMobile, placeLabel, toAdmission, type StudentFormValues } from "../../utils/students";
import { isIndianMobile } from "../../utils/validators";
import type { AcademicStructure, GuardianMatch, Relation, SectionItem, SectionLoad, StudentAddress, StudentCapacity } from "../../types";
import { AddressFields } from "../../components/students/form/AddressFields";
import { AdmissionCard } from "../../components/students/form/AdmissionCard";
import { AdmitSidebar } from "../../components/students/form/AdmitSidebar";
import { ManageFieldsLink } from "../../components/students/export/ManageFieldsLink";
import { CustomFields } from "../../components/students/form/CustomFields";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { GuardiansCard } from "../../components/students/form/GuardiansCard";
import { MoreFields } from "../../components/students/form/MoreFields";
import { PlacementFields } from "../../components/students/form/PlacementFields";
import { IdFields, PreviousSchoolFields } from "../../components/students/form/RecordsFields";
import { StudentFields } from "../../components/students/form/StudentFields";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { Steps } from "../../components/ui/Steps";
import { useToast } from "../../components/ui/toast-context";

/** "Admit a brother or sister" on a student's page sends the family along: the parents' numbers (looked up here) and the address. */
export interface SiblingOf {
  name: string;
  guardians: { mobile: string; relation: Relation; isPrimary: boolean }[];
  address: StudentAddress;
}

/** A question the page asks before sending the admission again. */
type Ask =
  | { kind: "clear" }
  | { kind: "fields" }
  | { kind: "full-pick"; section: SectionItem; load: SectionLoad; className: string }
  | { kind: "full"; message: string }
  | { kind: "duplicate"; message: string; student: { id: string; name: string; admissionNumber: string; className: string | null; sectionName: string | null } };

function initialValues(family: SiblingOf | undefined, rules: FieldRules): StudentFormValues {
  const empty = emptyStudentForm(rules);
  if (!family) return empty;
  const guardians = family.guardians
    .filter((g) => isIndianMobile(g.mobile))
    .map((g) => ({ ...emptyGuardian(g.isPrimary, g.relation), mobile: g.mobile }));
  if (guardians.length > 0 && !guardians.some((g) => g.isPrimary)) guardians[0].isPrimary = true;
  return {
    ...empty,
    lastName: family.name.split(" ").slice(-1)[0] ?? "",
    guardians: guardians.length > 0 ? guardians : empty.guardians,
    address: {
      line1: family.address.line1 ?? "",
      line2: family.address.line2 ?? "",
      city: family.address.city ?? "",
      state: family.address.state ?? "",
      pincode: family.address.pincode ?? "",
    },
  };
}

const plainLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover";

/**
 * Manage school > Students > Admit (`/school/students/new`), laid out like a new-patient page of a clinic app: a plain header (Back,
 * the title), the form as cards on the left, and on the right a live preview, how much of the form is filled in and a few tips. The one
 * **Admit** button sits in a bar pinned to the bottom of the screen, with **Clear all** beside it (dimmed until something is typed).
 * Nothing is sent while typing, except one lookup when a parent's full mobile number is typed. Admit (or Enter in a box) checks every
 * box first with the server's words; then one POST makes the student, links or makes the parents and gives them this year's class and
 * section. A full section and a possible duplicate are asked about and sent again with the answer. The class layout and the seats come
 * from what the list page already read (nothing is asked again within a minute).
 */
export default function StudentAdmitPage() {
  const family = (useLocation().state as { siblingOf?: SiblingOf } | null)?.siblingOf;
  const structureRes = useGetStructureQuery();
  const capacityRes = useGetCapacityQuery();
  // What this school needs: the form is made once it is known (a school that needs both parents starts with the father and the mother).
  const settingsRes = useGetStudentSettingsQuery();
  const structure = structureRes.data?.data;
  const capacity = capacityRes.data?.data;
  const rules = settingsRes.data?.data.fields;
  const custom = settingsRes.data?.data.customFields;

  if (!structure || !capacity || !rules || !custom) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="hidden h-72 rounded-2xl lg:block" />
        </div>
      </div>
    );
  }

  if (!capacity.academicYear) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Add student" />
        <StudentsNotice
          icon={CalendarX2}
          tone="warning"
          title="Your school has no current academic year yet"
          actions={
            <Link to="/dashboard" className={plainLink}>
              Go to the dashboard
            </Link>
          }
        >
          <p>A student is admitted into a class and section of an academic year. Set the year up on the dashboard first.</p>
        </StudentsNotice>
      </div>
    );
  }

  return <AdmitForm structure={structure} capacity={capacity} rules={rules} custom={custom} family={family} year={capacity.academicYear.name} />;
}

function AdmitForm({
  structure,
  capacity,
  rules,
  custom,
  family,
  year,
}: {
  structure: AcademicStructure;
  capacity: StudentCapacity;
  rules: FieldRules;
  custom: CustomFieldDef[];
  family: SiblingOf | undefined;
  year: string;
}) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [lookupGuardian] = useLookupGuardianMutation();
  const [admit, { isLoading: sending }] = useAdmitStudentMutation();

  const classHasSections = useCallback((id: string) => !!structure.classes.find((c) => c.id === id)?.sections.length, [structure]);
  const lookup = useCallback(async (mobile: string): Promise<GuardianMatch | null> => (await lookupGuardian({ mobile }).unwrap()).data.guardian, [lookupGuardian]);
  const [initial] = useState(() => initialValues(family, rules));
  // The previous school is needed for Class 1 to 12 and not before it: the class chosen says which.
  const classNameOf = useCallback((id: string) => structure.classes.find((c) => c.id === id)?.name, [structure]);
  const form = useStudentForm(initial, { mode: "admit", classHasSections, lookup, rules, classNameOf, custom });

  // A section the person said "yes, even though it is full" to.
  const [overCapacityFor, setOverCapacityFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // The steps: Academic, Personal info, Parents and (when the school asks anything of it) More details. The form's values live in
  // `form`, so going back and forth loses nothing; a step is passed when Next is pressed with its boxes right.
  const stepList = useMemo(() => stepsFor(form.rules ?? rules, custom), [form.rules, rules, custom]);
  const [position, setPosition] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [passed, setPassed] = useState<AdmitStepKey[]>([]);
  // Boxes to put the focus on once the step that has them is on screen (a refusal about an earlier step opens it first).
  const [focusPaths, setFocusPaths] = useState<string[] | null>(null);
  const at = Math.min(position, stepList.length - 1);
  const stepKey = stepList[at].key;
  const last = at === stepList.length - 1;

  const openStep = useCallback((index: number) => {
    setPosition(index);
    setFurthest((f) => Math.max(f, index));
  }, []);
  // A new step starts at the top of the page, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [at]);
  useEffect(() => {
    if (!focusPaths) return;
    form.focusFirst(focusPaths);
    setFocusPaths(null);
  }, [focusPaths, form]);

  /** Opens the step of the first of these boxes that belongs to a step of this form, and puts the focus there. */
  function showStepOf(paths: string[]) {
    for (const path of paths) {
      const index = stepList.findIndex((s) => s.key === stepKeyOfPath(path));
      if (index < 0) continue;
      openStep(index);
      setFocusPaths(paths.filter((p) => stepKeyOfPath(p) === stepList[index].key));
      return;
    }
  }

  /** Next step: this step's boxes are checked on their own; wrong ones show their message, otherwise the next step opens. */
  function goNext() {
    const wrong = problemPathsOf(form.problems, stepKey);
    if (wrong.length > 0) {
      form.reveal(wrong);
      return;
    }
    setPassed((p) => (p.includes(stepKey) ? p : [...p, stepKey]));
    openStep(at + 1);
  }

  // A brother or sister: their parents' numbers are looked up once, as if they had been typed.
  const lookedUpFamily = useRef(false);
  useEffect(() => {
    if (lookedUpFamily.current || !family) return;
    lookedUpFamily.current = true;
    form.values.guardians.forEach((g, i) => {
      if (isIndianMobile(g.mobile)) {
        form.setGuardian(i, { lookedUp: g.mobile });
        void form.lookUp(g.key, g.mobile);
      }
    });
  }, [family, form]);

  async function send(flags: { allowOverCapacity: boolean; confirmNotDuplicate: boolean }) {
    setFormError(null);
    try {
      const res = await admit(toAdmission(form.values, flags, custom.filter((f) => f.mode !== "hidden"))).unwrap();
      push("success", res.message ?? `${res.data.name} admitted`);
      navigate(`/school/students/${res.data.id}`, { state: { admitted: true } });
    } catch (err) {
      const error = getApiError(err);
      const first = (Array.isArray(error?.details) ? error.details[0] : undefined) as Record<string, unknown> | undefined;
      if (error?.code === "SECTION_FULL") {
        setAsk({ kind: "full", message: error.message });
      } else if (error?.code === "DUPLICATE_STUDENT" && first?.student) {
        setAsk({ kind: "duplicate", message: error.message, student: first.student as Extract<Ask, { kind: "duplicate" }>["student"] });
      } else if (error?.code === "GUARDIAN_EXISTS" && first?.guardian) {
        const index = Number(/^guardians\.(\d+)\./.exec(String(first.path))?.[1] ?? 0);
        form.showMatch(index, first.guardian as GuardianMatch);
        setFormError(`${(first.guardian as GuardianMatch).name} is already in your school with this mobile number. They are shown below: choose Use as is or Update details, then press Admit again.`);
        showStepOf(["guardians"]);
      } else if (!form.showServerErrors(error?.details)) {
        setFormError(error?.message ?? "Could not admit the student. Please try again.");
      } else {
        setFormError(error?.message === "Invalid request data" ? "Some boxes need a change: see the messages in red." : (error?.message ?? null));
        // The messages are under their boxes: open the step of the first one.
        showStepOf((error?.details as { path?: unknown }[]).map((d) => String(d.path ?? "")));
      }
    }
  }

  const flags = () => ({ allowOverCapacity: !!form.values.sectionId && overCapacityFor === form.values.sectionId, confirmNotDuplicate: false });

  /** Enter in a box or the button: on a step before the last it goes to the next step; on the last one it admits. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    if (!last) {
      goNext();
      return;
    }
    if (!form.check()) {
      setFormError("Some boxes need a change: see the messages in red.");
      // Every box of every step is checked: the first step with a wrong one is opened (it may be an earlier one).
      const first = firstStepWithProblems(form.problems, stepList);
      if (first >= 0 && first !== at) showStepOf(problemPathsOf(form.problems, stepList[first].key));
      return;
    }
    void send(flags());
  }

  /** Clear all: every box goes back to empty (the parents of a brother or sister too), and what was asked or refused is forgotten. */
  function clearAll() {
    form.reset(emptyStudentForm(rules));
    setOverCapacityFor(null);
    setFormError(null);
    setPosition(0);
    setFurthest(0);
    setPassed([]);
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-6">
        <StudentFormHeader
          title="Add student"
          subtitle={family ? `A brother or sister of ${family.name} · ${year}` : `Academic year ${year}`}
          actions={
            <ManageFieldsLink
              from="admit"
              // What is typed would be cleared by leaving: ask first (nothing typed: go straight there).
              guard={() => {
                if (!form.dirty) return true;
                setAsk({ kind: "fields" });
                return false;
              }}
            />
          }
        />

        {formError && <ModalError message={formError} />}

        <Card className="px-5 py-4 sm:px-7 sm:py-5">
          <Steps steps={stepList} active={at} completed={stepList.flatMap((s, i) => (passed.includes(s.key) ? [i] : []))} furthest={furthest} onSelect={openStep} />
          <p className="mt-3 hidden text-sm text-foreground-muted lg:block">{stepList[at].hint}</p>
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* `key` gives each step a fresh start (its animation); the values are the form's, so nothing typed is lost by moving. */}
          <div key={stepKey} className="rise-in min-w-0 space-y-6">
            {stepKey === "academic" && (
              <>
                <PlacementFields
                  form={form}
                  structure={structure}
                  capacity={capacity}
                  index={0}
                  onPickFull={(section, load) => setAsk({ kind: "full-pick", section, load, className: structure.classes.find((c) => c.id === section.classId)?.name ?? "" })}
                />
                <AdmissionCard form={form} index={1} />
                <PreviousSchoolFields form={form} index={2} />
              </>
            )}
            {stepKey === "personal" && (
              <>
                <StudentFields form={form} mode="admit" index={0} admissionDate={false} />
                <AddressFields form={form} index={1} />
                <IdFields form={form} index={2} />
              </>
            )}
            {stepKey === "parents" && <GuardiansCard form={form} mode="admit" index={0} />}
            {stepKey === "more" && (
              <>
                <MoreFields form={form} startOpen index={0} />
                <CustomFields form={form} index={1} />
              </>
            )}
          </div>
          <AdmitSidebar values={form.values} problems={form.problems} rules={form.rules ?? rules} custom={custom} structure={structure} />
        </div>

        <FormActionBar>
          <Button type="button" variant="ghost" className="text-foreground-muted hover:text-danger" disabled={!form.dirty || sending} onClick={() => setAsk({ kind: "clear" })}>
            <Trash2 className="size-4" aria-hidden />
            Clear all
          </Button>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-foreground-muted xl:block">
              {last ? "Enter in any box also admits. Escape puts a box back." : "Enter in a box goes to the next step. Escape puts a box back."}
            </p>
            {at > 0 && (
              <Button type="button" variant="outline" size="lg" disabled={sending} aria-label="Previous step" onClick={() => openStep(at - 1)}>
                <ArrowLeft className="size-4" aria-hidden />
                Back
              </Button>
            )}
            {last ? (
              <Button type="submit" size="lg" loading={sending} disabled={!form.dirty} aria-label="Admit the student">
                {!sending && <UserPlus className="size-4" aria-hidden />}
                Admit student
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

      {/* Outside the form: a dialog's buttons must not submit it. */}
      {ask?.kind === "clear" && (
        <AskDialog title="Clear the whole form?" icon={Eraser} confirmLabel="Clear all" onClose={() => setAsk(null)} onConfirm={clearAll}>
          <p>Everything you typed is removed and the boxes are empty again. Nothing has been saved yet, so nothing is deleted from your school.</p>
        </AskDialog>
      )}
      {ask?.kind === "fields" && (
        <AskDialog
          title="Leave this form?"
          icon={ListChecks}
          confirmLabel="Go to Manage fields"
          onClose={() => setAsk(null)}
          onConfirm={() => navigate("/school/students/fields", { state: { from: "admit" } })}
        >
          <p>Everything you typed is cleared, because the form starts again when you come back. Nothing has been saved yet.</p>
          <p>Choose the fields first, then come back and fill the form.</p>
        </AskDialog>
      )}
      {ask?.kind === "full-pick" && (
        <AskDialog
          title={`${ask.className} - ${ask.section.name} is full`}
          icon={Armchair}
          confirmLabel="Put the student here anyway"
          onClose={() => setAsk(null)}
          onConfirm={() => {
            setOverCapacityFor(ask.section.id);
            form.set("sectionId", ask.section.id);
          }}
        >
          <p>
            {ask.load.enrolled} of {ask.load.capacity} seats are taken. You can still put the student in this section; it will have more students
            than its seats.
          </p>
          <p>Or pick another section, or give this one more seats in Classes & Sections.</p>
        </AskDialog>
      )}
      {ask?.kind === "full" && (
        <AskDialog
          title="This section is full"
          icon={Armchair}
          confirmLabel="Admit anyway"
          onClose={() => setAsk(null)}
          onConfirm={() => {
            setOverCapacityFor(form.values.sectionId);
            void send({ ...flags(), allowOverCapacity: true });
          }}
        >
          <p>{ask.message}</p>
          <p>It filled up after this page was opened. Admit the student anyway, or cancel and pick another section.</p>
        </AskDialog>
      )}
      {ask?.kind === "duplicate" && (
        <AskDialog
          title="This child may already be admitted"
          icon={CopyCheck}
          confirmLabel="It is another child: admit"
          onClose={() => setAsk(null)}
          onConfirm={() => void send({ ...flags(), confirmNotDuplicate: true })}
        >
          <p>
            <Link to={`/school/students/${ask.student.id}`} className="font-semibold text-primary-deep underline-offset-2 hover:underline">
              {ask.student.name} ({ask.student.admissionNumber})
            </Link>{" "}
            has the same name, the same date of birth and the same primary parent ({formatMobile(form.values.guardians.find((g) => g.isPrimary)?.mobile)}), in{" "}
            {placeLabel(ask.student.className ? { className: ask.student.className, sectionName: ask.student.sectionName } : null)}.
          </p>
          <p>If it is the same child, cancel: nothing is saved. Twins or another child with the same name? Admit them.</p>
        </AskDialog>
      )}
    </>
  );
}
