import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, Building2, CalendarDays, Clock3, Globe, GraduationCap, Mail, MapPin, Pencil, Phone, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { useSchoolProfile } from "../../hooks/useSchoolProfile";
import { useUpdateSchoolProfileMutation } from "../../redux/api/onboardingApi";
import { useGetSchedulesQuery } from "../../redux/api/timetableApi";
import { API_URL } from "../../redux/api/baseQueryWithReauth";
import { MONTHS, SCHOOL_TYPES, STATES, designationLabel, formatAffiliations, formatBoards, formatClassRange, formatPhone } from "../../constants/schoolOptions";
import { formatDayRange } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { readWeek, setupOf, WEEK_DAYS, daySummary } from "../../utils/schoolWeek";
import type { SchoolSteps, UpdateSchoolProfileInput } from "../../types";
import { LogoField } from "../../components/onboarding/LogoField";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { AppModal, ModalError } from "../../components/ui/AppModal";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

type ProfileDraft = Omit<UpdateSchoolProfileInput, "approxStudents" | "establishedYear"> & {
  approxStudents: string;
  establishedYear: string;
};

function draftFrom(steps: SchoolSteps): ProfileDraft {
  return {
    schoolName: steps[1].schoolName,
    schoolType: steps[1].schoolType ?? "",
    approxStudents: steps[1].approxStudents?.toString() ?? "",
    udiseCode: steps[1].udiseCode,
    establishedYear: steps[1].establishedYear?.toString() ?? "",
    addressLine1: steps[2].addressLine1,
    addressLine2: steps[2].addressLine2,
    city: steps[2].city,
    state: steps[2].state,
    division: steps[2].division,
    district: steps[2].district,
    pincode: steps[2].pincode,
    schoolPhone: steps[2].schoolPhone,
    schoolEmail: steps[2].schoolEmail,
    website: steps[2].website,
  };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-foreground-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold text-foreground">{children === "" || children === null || children === undefined ? <span className="font-normal text-foreground-muted">Not provided</span> : children}</dd>
    </div>
  );
}

function SchoolAvatar({ schoolName, logoUrl }: { schoolName: string; logoUrl: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-primary-soft shadow-card sm:size-20">
      {logoUrl && !broken ? (
        <img src={`${API_URL}${logoUrl}`} alt={`${schoolName} logo`} className="size-full bg-white object-contain" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden className="flex size-full items-center justify-center bg-gradient-to-br from-primary to-primary-deep text-2xl font-bold text-primary-foreground">
          {schoolName.trim().slice(0, 1).toUpperCase() || <Building2 className="size-9" aria-hidden />}
        </span>
      )}
    </div>
  );
}

function ContactTile({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-muted/40 p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs text-foreground-muted">{label}</p>
        {value ? (
          href ? <a href={href} className="block break-all text-sm font-semibold text-foreground hover:text-primary">{value}</a> : <p className="break-all text-sm font-semibold text-foreground">{value}</p>
        ) : <p className="text-sm text-foreground-muted">Not provided</p>}
      </div>
    </div>
  );
}

/** The school's profile and public contact details, with its academic setup kept read-only here. */
export default function SchoolProfilePage() {
  const { user, tenant, refreshMe } = useAuth();
  const profile = useSchoolProfile();
  const scheduleQuery = useGetSchedulesQuery(undefined, { skip: user?.role !== "school_admin" });
  const [updateProfile, { isLoading: saving }] = useUpdateSchoolProfileMutation();
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const schedules = scheduleQuery.data?.data.items ?? [];
  const week = useMemo(() => readWeek(schedules).plan, [schedules]);
  if (!user) return null;
  const s = profile?.steps;
  const completionFields = s ? [
    s[1].schoolName,
    s[1].schoolType,
    s[1].boards.length > 0,
    s[1].lowestClass && s[1].highestClass,
    s[2].addressLine1,
    s[2].city,
    s[2].state,
    s[2].district,
    s[2].pincode,
    s[2].schoolPhone,
    s[2].schoolEmail,
  ] : [];
  const completion = completionFields.length ? Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100) : 0;

  function beginEdit() {
    if (!s) return;
    setDraft(draftFrom(s));
    setFormError(null);
    setEditing(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setFormError(null);
    if (!draft.schoolType || !draft.state) {
      setFormError("Choose a school type and state before saving.");
      return;
    }
    try {
      await updateProfile({
        ...draft,
        approxStudents: Number(draft.approxStudents),
        establishedYear: draft.establishedYear ? Number(draft.establishedYear) : null,
      }).unwrap();
      await refreshMe().catch(() => undefined);
      setEditing(false);
      setDraft(null);
      push("success", "School details have been updated.");
    } catch (error) {
      setFormError(getApiError(error)?.message ?? "Could not save the school details. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="School account"
        title="School Details"
        description="Your school profile, contact information and academic setup."
      />

      {!s ? (
        <div className="space-y-5" aria-busy="true">
          <Skeleton className="h-64 rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div aria-hidden className="h-1.5 bg-gradient-to-r from-primary to-emerald-500/80" />
            <div className="space-y-5 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <SchoolAvatar schoolName={s[1].schoolName} logoUrl={s[1].logoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{s[1].schoolName}</h2>
                    <Badge tone={tenant?.approvalStatus === "approved" ? "success" : "warning"}>{tenant?.approvalStatus === "approved" ? "Approved" : "Setup in progress"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground-secondary">{[s[1].schoolType, formatBoards(s[1].boards)].filter(Boolean).join(" · ") || "School profile"}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-foreground-muted">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" aria-hidden />{[s[2].city, s[2].state].filter(Boolean).join(", ") || "Location not added"}</span>
                    {formatClassRange(s[1].lowestClass, s[1].highestClass) && <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-3.5 text-primary" aria-hidden />Classes {formatClassRange(s[1].lowestClass, s[1].highestClass)}</span>}
                  </div>
                </div>
                <Button onClick={beginEdit} disabled={!s} className="shrink-0 self-start sm:self-center">
                  <Pencil className="size-4" aria-hidden />
                  Edit Profile
                </Button>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/35 p-3.5 sm:flex-row sm:items-center sm:gap-5">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-foreground-muted">
                    <span>Profile completion</span><span className="font-bold text-foreground">{completion}%</span>
                  </div>
                  <div role="progressbar" aria-label="School profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${completion}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-border pt-3 text-sm sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                  <CalendarDays className="size-4 text-primary" aria-hidden />
                  <span className="text-xs text-foreground-muted">Session starts</span>
                  <span className="font-semibold text-foreground">{MONTHS[s[1].sessionStartMonth - 1]}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.9fr)]">
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Phone className="size-4" aria-hidden /></span>Contact</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ContactTile icon={Phone} label="Phone" value={formatPhone(s[2].schoolPhone)} href={s[2].schoolPhone ? `tel:${s[2].schoolPhone}` : undefined} />
                    <ContactTile icon={Mail} label="Email" value={s[2].schoolEmail} href={s[2].schoolEmail ? `mailto:${s[2].schoolEmail}` : undefined} />
                    <ContactTile icon={Globe} label="Website" value={s[2].website} href={s[2].website ? (/^https?:\/\//i.test(s[2].website) ? s[2].website : `https://${s[2].website}`) : undefined} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><MapPin className="size-4" aria-hidden /></span>Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-primary/15 bg-primary-soft/40 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-primary">School address</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{[s[2].addressLine1, s[2].addressLine2].filter(Boolean).join(", ") || "Not provided"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-muted/40 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-muted">Location</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{[s[2].city, s[2].district, s[2].division, s[2].state, s[2].pincode].filter(Boolean).join(", ") || "Not provided"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Users className="size-4" aria-hidden /></span>School administrator</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2">
                  <Detail label="Name">{s[3].adminName}</Detail>
                  <Detail label="Role">{designationLabel(s[3].designation, s[3].designationOther)}</Detail>
                  <Detail label="Mobile">{formatPhone(s[3].mobile)}</Detail>
                  <Detail label="Login email">{user.email}</Detail>
                  </dl>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Building2 className="size-4" aria-hidden /></span>School Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <Detail label="School type">{s[1].schoolType}</Detail>
                  <Detail label="Board and medium">{formatBoards(s[1].boards)}</Detail>
                  <Detail label="Classes">{formatClassRange(s[1].lowestClass, s[1].highestClass)}</Detail>
                  <Detail label="Affiliation number">{formatAffiliations(s[1].boards)}</Detail>
                  <Detail label="UDISE+ code">{s[1].udiseCode}</Detail>
                  <Detail label="Established">{s[1].establishedYear}</Detail>
                  <Detail label="Approx. students">{s[1].approxStudents}</Detail>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><BookOpen className="size-4" aria-hidden /></span>Academic setup</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4">
                  <Detail label="Academic year starts">{MONTHS[s[1].sessionStartMonth - 1]}</Detail>
                  <Detail label="First academic year">{s[1].academicYear?.name ? `${s[1].academicYear.name}, ${formatDayRange(s[1].academicYear.startDate, s[1].academicYear.endDate)}` : ""}</Detail>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Clock3 className="size-4" aria-hidden /></span>School timings</CardTitle>
                  <Link to="/school/timings" className="text-xs font-semibold text-primary hover:underline">Manage timings</Link>
                </CardHeader>
                <CardContent>
                  {scheduleQuery.error ? (
                    <p role="alert" className="text-sm text-danger">{getApiError(scheduleQuery.error)?.message ?? "Could not load school timings."}</p>
                  ) : schedules.length === 0 ? (
                    <p className="text-sm text-foreground-muted">School timings have not been set yet.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {WEEK_DAYS.map((day) => {
                        const setup = setupOf(week, day);
                        if (!setup) return null;
                        return <div key={day} className="flex items-start justify-between gap-3 py-2.5 text-sm"><span className="font-medium text-foreground-secondary">{["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day]}</span><span className="text-right text-foreground-muted">{daySummary(setup)}</span></div>;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {editing && draft && (
        <AppModal
          title="Edit school details"
          icon={Building2}
          size="lg"
          busy={saving}
          onClose={() => {
            setEditing(false);
            setDraft(null);
            setFormError(null);
          }}
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => { setEditing(false); setDraft(null); setFormError(null); }} disabled={saving}>Cancel</Button>
              <Button type="submit" form="school-profile-form" loading={saving}>Save changes</Button>
            </>
          }
        >
          <form id="school-profile-form" onSubmit={saveProfile} className="space-y-5">
            <ModalError message={formError} />
            <LogoField logoUrl={s[1].logoUrl} />
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">School information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="school-profile-name" label="School name">
                  <Input id="school-profile-name" value={draft.schoolName} onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })} required maxLength={150} />
                </Field>
                <Field id="school-profile-type" label="School type">
                  <Select id="school-profile-type" value={draft.schoolType} options={SCHOOL_TYPES} onChange={(schoolType) => setDraft({ ...draft, schoolType })} placeholder="Choose school type" />
                </Field>
                <Field id="school-profile-students" label="Approx. students">
                  <Input id="school-profile-students" type="number" min={1} max={50000} value={draft.approxStudents} onChange={(e) => setDraft({ ...draft, approxStudents: e.target.value })} required />
                </Field>
                <Field id="school-profile-udise" label="UDISE+ code" optional>
                  <Input id="school-profile-udise" value={draft.udiseCode} onChange={(e) => setDraft({ ...draft, udiseCode: e.target.value })} inputMode="numeric" pattern="[0-9]{11}" maxLength={11} />
                </Field>
                <Field id="school-profile-established" label="Established year" optional>
                  <Input id="school-profile-established" type="number" min={1800} max={new Date().getFullYear()} value={draft.establishedYear} onChange={(e) => setDraft({ ...draft, establishedYear: e.target.value })} />
                </Field>
              </div>
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-foreground">Address and contact</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="school-profile-address1" label="Address line 1" className="sm:col-span-2">
                  <Input id="school-profile-address1" value={draft.addressLine1} onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })} required maxLength={200} />
                </Field>
                <Field id="school-profile-address2" label="Address line 2" optional className="sm:col-span-2">
                  <Input id="school-profile-address2" value={draft.addressLine2} onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })} maxLength={200} />
                </Field>
                <Field id="school-profile-city" label="City">
                  <Input id="school-profile-city" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} required maxLength={80} />
                </Field>
                <Field id="school-profile-state" label="State or union territory">
                  <Select id="school-profile-state" value={draft.state} options={STATES} onChange={(state) => setDraft({ ...draft, state })} placeholder="Choose state" />
                </Field>
                <Field id="school-profile-district" label="District">
                  <Input id="school-profile-district" value={draft.district} onChange={(e) => setDraft({ ...draft, district: e.target.value })} required maxLength={80} />
                </Field>
                <Field id="school-profile-division" label="Division" optional>
                  <Input id="school-profile-division" value={draft.division} onChange={(e) => setDraft({ ...draft, division: e.target.value })} maxLength={80} />
                </Field>
                <Field id="school-profile-pincode" label="PIN code">
                  <Input id="school-profile-pincode" value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value })} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} />
                </Field>
                <Field id="school-profile-phone" label="School phone">
                  <Input id="school-profile-phone" type="tel" value={draft.schoolPhone} onChange={(e) => setDraft({ ...draft, schoolPhone: e.target.value })} required />
                </Field>
                <Field id="school-profile-email" label="School email">
                  <Input id="school-profile-email" type="email" value={draft.schoolEmail} onChange={(e) => setDraft({ ...draft, schoolEmail: e.target.value })} required maxLength={254} />
                </Field>
                <Field id="school-profile-website" label="Website" optional className="sm:col-span-2">
                  <Input id="school-profile-website" type="url" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://school.in" maxLength={200} />
                </Field>
              </div>
            </section>
          </form>
        </AppModal>
      )}
    </div>
  );
}
