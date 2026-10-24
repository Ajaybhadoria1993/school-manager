import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Armchair, CalendarX2, CopyCheck, Eraser, Trash2, UserPlus } from "lucide-react";
import { useStudentForm } from "../../hooks/useStudentForm";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useAdmitStudentMutation, useGetCapacityQuery, useGetStudentSettingsQuery, useLookupGuardianMutation } from "../../redux/api/studentsApi";
import type { CustomFieldDef, FieldRules } from "../../constants/studentFields";
import { getApiError } from "../../utils/apiErrors";
import { emptyGuardian, emptyStudentForm, formatMobile, placeLabel, toAdmission, type StudentFormValues } from "../../utils/students";
import { isIndianMobile } from "../../utils/validators";
import type { AcademicStructure, GuardianMatch, Relation, SectionItem, SectionLoad, StudentAddress, StudentCapacity } from "../../types";
import { AddressFields } from "../../components/students/form/AddressFields";
import { AdmitSidebar } from "../../components/students/form/AdmitSidebar";
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
import { Skeleton } from "../../components/ui/Skeleton";
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
  const form = useStudentForm(initial, { mode: "admit", classHasSections, lookup, rules, custom });

  // A section the person said "yes, even though it is full" to.
  const [overCapacityFor, setOverCapacityFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
      } else if (!form.showServerErrors(error?.details)) {
        setFormError(error?.message ?? "Could not admit the student. Please try again.");
      } else {
        setFormError(error?.message === "Invalid request data" ? "Some boxes need a change: see the messages in red." : (error?.message ?? null));
      }
    }
  }

  const flags = () => ({ allowOverCapacity: !!form.values.sectionId && overCapacityFor === form.values.sectionId, confirmNotDuplicate: false });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError(null);
    if (!form.check()) {
      setFormError("Some boxes need a change: see the messages in red.");
      return;
    }
    void send(flags());
  }

  /** Clear all: every box goes back to empty (the parents of a brother or sister too), and what was asked or refused is forgotten. */
  function clearAll() {
    form.reset(emptyStudentForm(rules));
    setOverCapacityFor(null);
    setFormError(null);
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-6">
        <StudentFormHeader
          title="Add student"
          subtitle={family ? `A brother or sister of ${family.name} · ${year}` : `Academic year ${year}`}
        />

        {formError && <ModalError message={formError} />}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <StudentFields form={form} mode="admit" index={0} />
            <PlacementFields
              form={form}
              structure={structure}
              capacity={capacity}
              index={1}
              onPickFull={(section, load) => setAsk({ kind: "full-pick", section, load, className: structure.classes.find((c) => c.id === section.classId)?.name ?? "" })}
            />
            <GuardiansCard form={form} mode="admit" index={2} />
            <AddressFields form={form} index={3} />
            <IdFields form={form} index={4} />
            <PreviousSchoolFields form={form} index={5} />
            <MoreFields form={form} startOpen={false} index={6} />
            <CustomFields form={form} index={7} />
          </div>
          <AdmitSidebar values={form.values} problems={form.problems} rules={rules} custom={custom} structure={structure} />
        </div>

        <FormActionBar>
          <Button type="button" variant="ghost" className="text-foreground-muted hover:text-danger" disabled={!form.dirty || sending} onClick={() => setAsk({ kind: "clear" })}>
            <Trash2 className="size-4" aria-hidden />
            Clear all
          </Button>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-foreground-muted md:block">Enter in any box also admits. Escape puts a box back.</p>
            <Button type="submit" size="lg" loading={sending} disabled={!form.dirty} aria-label="Admit the student">
              {!sending && <UserPlus className="size-4" aria-hidden />}
              Admit student
            </Button>
          </div>
        </FormActionBar>
      </form>

      {/* Outside the form: a dialog's buttons must not submit it. */}
      {ask?.kind === "clear" && (
        <AskDialog title="Clear the whole form?" icon={Eraser} confirmLabel="Clear all" onClose={() => setAsk(null)} onConfirm={clearAll}>
          <p>Everything you typed is removed and the boxes are empty again. Nothing has been saved yet, so nothing is deleted from your school.</p>
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
