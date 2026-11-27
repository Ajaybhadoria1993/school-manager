import { useState } from "react";
import { Save } from "lucide-react";
import { DESIGNATIONS, OTHER_CHOICE, STATES } from "../../constants/schoolOptions";
import { useAuth } from "../../hooks/useAuth";
import { useGetMyProfileQuery, useUpdateMyProfileMutation } from "../../redux/api/profileApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { formFromProfile, myProfileChanges, myProfileKeyOf, myProfileProblems, type MyProfileForm, type MyProfileKey } from "../../utils/myProfile";
import { birthDateRange, onlyDigits } from "../../utils/teachers";
import { mobileDigits, todayInIndia } from "../../utils/students";
import type { MyProfile } from "../../types";
import { ROLE_LABELS } from "../layout/nav-config";
import { MyPhotoField } from "../profile/MyPhotoField";
import { ResumeField } from "../profile/ResumeField";
import { ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

const GRID = "grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";
const GENDERS = ["Male", "Female", "Other"] as const;
const digits2 = onlyDigits(2);
const digits6 = onlyDigits(6);

/** What the school decides about the person: to read. */
function FromSchool({ profile, role }: { profile: MyProfile; role: string }) {
  const rows: [string, string | null][] = [
    ["Email (sign in)", profile.email ?? profile.username],
    ["Role", profile.roleLabel ?? role],
    ...(profile.job
      ? ([
          ["Employee code", profile.job.employeeCode],
          ["Designation", profile.job.designation],
          ["Joining date", profile.job.joiningDate ? formatDay(profile.job.joiningDate) : null],
        ] as [string, string | null][])
      : []),
  ];
  return (
    <section aria-label="From your school" className="rounded-xl border border-border bg-surface-muted/50 p-4">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium text-foreground-muted">{label}</dt>
            <dd className="break-words text-sm font-semibold text-foreground">{value || "-"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PersonalForm({ profile }: { profile: MyProfile }) {
  const { user, refreshMe } = useAuth();
  const { push } = useToast();
  const [update, { isLoading: saving }] = useUpdateMyProfileMutation();
  const saved = formFromProfile(profile);
  // What was typed; null while nothing was, so a fresh answer of the server shows through.
  const [typed, setTyped] = useState<MyProfileForm | null>(null);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<Partial<Record<MyProfileKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const form = typed ?? saved;
  const changes = myProfileChanges(form, saved);
  const errors = { ...(tried ? myProfileProblems(form, profile) : {}), ...refused };
  const member = profile.kind === "member";
  const born = birthDateRange(todayInIndia());

  function set(key: MyProfileKey, value: string) {
    setTyped({ ...form, [key]: value });
    setRefused(({ [key]: _gone, ...rest }) => rest);
  }
  const text = (key: MyProfileKey, keep?: (value: string) => string) => ({
    id: `me-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, keep ? keep(e.target.value) : e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !changes) return;
    setTried(true);
    setFormError(null);
    if (Object.keys(myProfileProblems(form, profile)).length > 0) return;
    try {
      await update(changes).unwrap();
      setTyped(null);
      setTried(false);
      push("success", "Your details are saved");
      // The name is also in the top bar.
      await refreshMe().catch(() => undefined);
    } catch (err) {
      const error = getApiError(err);
      const found: Partial<Record<MyProfileKey, string>> = {};
      for (const row of Array.isArray(error?.details) ? (error.details as { path?: unknown; message?: unknown }[]) : []) {
        const key = typeof row.path === "string" ? myProfileKeyOf(row.path, form) : null;
        if (key && typeof row.message === "string") found[key] ??= row.message;
      }
      setRefused(found);
      setFormError(Object.keys(found).length > 0 ? "Some boxes need a change: see the messages in red." : (error?.message ?? "Could not save. Please try again."));
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <ModalError message={formError} />
      <div className={GRID}>
        <Field id="me-name" label="Name" error={errors.name}>
          <Input {...text("name")} maxLength={100} autoComplete="name" />
        </Field>
        {user?.role === "school_admin" && !member && (
          <>
            <Field id="me-designation" label="Your role in the school">
              <Select id="me-designation" value={form.designation} options={DESIGNATIONS} placeholder="Choose role" onChange={(v) => set("designation", v)} />
            </Field>
            {form.designation === OTHER_CHOICE && (
              <Field id="me-designationOther" label="What is your role?" error={errors.designationOther}>
                <Input {...text("designationOther")} maxLength={50} />
              </Field>
            )}
          </>
        )}
        <Field id="me-mobile" label="Mobile number" error={errors.mobile}>
          <Input {...text("mobile", mobileDigits)} prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" />
        </Field>
        {!member && (
          <Field id="me-alternateMobile" label="Alternate mobile" optional error={errors.alternateMobile}>
            <Input {...text("alternateMobile", mobileDigits)} prefix="+91" type="tel" inputMode="numeric" />
          </Field>
        )}
        {member && (
          <>
            <Field id="me-gender" label="Gender" optional error={errors.gender}>
              <ChipPicker label="Gender" value={form.gender} options={GENDERS.map((g) => ({ value: g, label: g }))} onChange={(v) => set("gender", v)} />
            </Field>
            <Field id="me-dateOfBirth" label="Date of birth" optional error={errors.dateOfBirth}>
              <DateBox id="me-dateOfBirth" label="Date of birth" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} min={born.min} max={born.max} invalid={!!errors.dateOfBirth} />
            </Field>
            <Field id="me-line1" label="Address" optional error={errors.line1}>
              <Input {...text("line1")} maxLength={200} />
            </Field>
            <Field id="me-city" label="City" optional error={errors.city}>
              <Input {...text("city")} maxLength={80} />
            </Field>
            <Field id="me-state" label="State" optional error={errors.state}>
              <Select id="me-state" value={form.state} options={STATES} placeholder="Choose state" onChange={(v) => set("state", v)} />
            </Field>
            <Field id="me-pincode" label="PIN code" optional error={errors.pincode}>
              <Input {...text("pincode", digits6)} inputMode="numeric" />
            </Field>
          </>
        )}
        {profile.teaches && (
          <>
            <Field id="me-qualification" label="Qualification" optional error={errors.qualification}>
              <Input {...text("qualification")} maxLength={100} />
            </Field>
            <Field id="me-experienceYears" label="Experience (years)" optional error={errors.experienceYears}>
              <Input {...text("experienceYears", digits2)} inputMode="numeric" />
            </Field>
          </>
        )}
      </div>
      <FromSchool profile={profile} role={user ? ROLE_LABELS[user.role] : ""} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!changes}>
          {!saving && <Save className="size-4" aria-hidden />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

/** Settings > Personal details (everyone who works at the school): the photo, which saves as soon as it is chosen, and their own details. */
export function PersonalDetailsTab() {
  const res = useGetMyProfileQuery();
  const profile = res.data?.data;
  if (res.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!profile) return <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load your details."}</Card>;
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <MyPhotoField name={profile.name} />
        {/* Someone who teaches keeps their resume here too. */}
        {profile.teaches && <ResumeField canChange />}
      </div>
      <PersonalForm profile={profile} />
    </Card>
  );
}
