import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  AtSign,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardList,
  Fingerprint,
  FolderTree,
  HeartHandshake,
  HeartPulse,
  History,
  MapPin,
  Phone,
  School,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { TONES, type Tone } from "../../../constants/tones";
import { formatDay } from "../../../utils/academicYear";
import { cn } from "../../../utils/helpers";
import { ageText, avatarTone, formatAadhaar, formatMobile, placeLabel } from "../../../utils/students";
import type { StudentDetail } from "../../../types";
import { Card } from "../../ui/Card";
import { InfoTip } from "../../ui/Hint";
import { StudentAvatar } from "../StudentAvatar";

function Block({ icon: Icon, tone, title, tip, index, className, children }: { icon: LucideIcon; tone: Tone; title: string; tip?: ReactNode; index: number; className?: string; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <Card className={cn("stagger-item relative overflow-hidden p-5", className)} style={{ "--i": index } as React.CSSProperties}>
      <div aria-hidden className={cn("pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />
      <h2 className="relative flex items-center gap-2.5 text-base font-bold tracking-tight text-foreground">
        <span aria-hidden className={cn("flex size-9 items-center justify-center rounded-xl", t.gradient)}>
          <Icon className="size-4.5" />
        </span>
        {title}
        {tip && <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>}
      </h2>
      <div className="relative mt-4">{children}</div>
    </Card>
  );
}

/** A label and its value, one row of a block. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/70 py-2 last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

const none = <span className="font-normal text-foreground-muted">Not given</span>;

/** An answer to a field of the school's own, as the page shows it: a day as "1 Apr 2026", a tick as Yes / No. */
function ownAnswer(field: CustomFieldDef, answer: string | number | boolean | undefined) {
  if (answer === undefined || answer === "") return field.type === "yesNo" ? "No" : none;
  if (field.type === "yesNo") return answer === true ? "Yes" : "No";
  if (field.type === "date" && typeof answer === "string") return formatDay(answer);
  return String(answer);
}

/**
 * A student's page when it is only read: who they are, this year's place, their parents, brothers and sisters, history, address, and
 * the school's own fields (`custom`: the ones asked, and any other this student has an answer for).
 */
export function StudentOverview({ student, custom = [] }: { student: StudentDetail; custom?: CustomFieldDef[] }) {
  const own = custom.filter((f) => f.mode !== "hidden" || student.custom?.[f.key] !== undefined);
  const t = TONES[avatarTone(student.admissionNumber)];
  const place = student.place;
  const a = student.address;
  const addressLines = [a.line1, a.line2, [a.city, [a.state, a.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const current = student.enrolments.find((e) => e.current);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Block icon={FolderTree} tone="success" title="This year" index={0} tip="The class and section of the current academic year. Moving the student changes this year only; earlier years stay in the history below.">
        {place ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("rounded-xl px-4 py-2 text-lg font-extrabold ring-1 ring-inset", t.chip)}>{placeLabel(place)}</span>
              <span className="text-sm text-foreground-muted">{place.rollNumber != null ? `Roll number ${place.rollNumber}` : "No roll number yet"}</span>
            </div>
            {current && (
              <dl className="mt-4">
                <Row label="Academic year">{current.academicYear?.name ?? "This year"}</Row>
                <Row label="In this class since">{formatDay(current.enrolledAt.slice(0, 10))}</Row>
              </dl>
            )}
          </>
        ) : (
          <p className="text-sm text-foreground-muted">No class in the current academic year.</p>
        )}
      </Block>

      <Block icon={UserRound} tone="primary" title="About" index={1}>
        <dl>
          <Row label="Admission number">
            <span className="font-mono">{student.admissionNumber}</span>
          </Row>
          <Row label="Gender">{student.gender}</Row>
          <Row label="Date of birth">
            {formatDay(student.dateOfBirth)} <span className="font-normal text-foreground-muted">({ageText(student.dateOfBirth)})</span>
          </Row>
          <Row label="Admitted on">{formatDay(student.admissionDate)}</Row>
          <Row label="Blood group">{student.bloodGroup ?? none}</Row>
          <Row label="Category">{student.category ?? none}</Row>
        </dl>
      </Block>

      <Block
        icon={UsersRound}
        tone="warning"
        title="Parents and guardians"
        index={2}
        className="lg:col-span-2"
        tip="One parent is one record for all their children. The primary contact's mobile number will be their sign-in to the parent app; it is verified the first time they sign in."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {student.guardians.map((g) => (
            <li key={g.id} className={cn("rounded-2xl border p-4", g.isPrimary ? "border-primary/30 bg-primary-soft/30" : "border-border bg-background/60")}>
              <div className="flex items-center gap-3">
                <StudentAvatar name={g.name} seed={g.mobile ?? g.id} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{g.name}</p>
                  <p className="text-xs text-foreground-muted">{g.relation}</p>
                </div>
                {g.isPrimary && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
                    <Star className="size-3" aria-hidden />
                    Primary
                  </span>
                )}
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-foreground-muted" aria-hidden />
                  <dt className="sr-only">Mobile</dt>
                  <dd>
                    {g.mobile ? (
                      <a href={`tel:+91${g.mobile}`} className="font-semibold text-primary-deep underline-offset-2 hover:underline">
                        +91 {formatMobile(g.mobile)}
                      </a>
                    ) : (
                      none
                    )}
                    {g.mobile && !g.mobileVerified && <span className="ml-1.5 text-xs text-foreground-muted">(not verified yet)</span>}
                  </dd>
                </div>
                {g.alternateMobile && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5 text-foreground-muted" aria-hidden />
                    <dt className="sr-only">Another number</dt>
                    <dd className="text-foreground">+91 {formatMobile(g.alternateMobile)}</dd>
                  </div>
                )}
                {g.email && (
                  <div className="flex items-center gap-2">
                    <AtSign className="size-3.5 text-foreground-muted" aria-hidden />
                    <dt className="sr-only">Email</dt>
                    <dd className="truncate text-foreground">{g.email}</dd>
                  </div>
                )}
                {g.occupation && (
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="size-3.5 text-foreground-muted" aria-hidden />
                    <dt className="sr-only">Occupation</dt>
                    <dd className="text-foreground">{g.occupation}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </Block>

      <Block icon={HeartHandshake} tone="danger" title="Brothers and sisters" index={3} tip="Other children of the same parents at your school. They are linked through the parent, so nothing is typed twice.">
        {student.siblings.length === 0 ? (
          <p className="text-sm text-foreground-muted">No other child of these parents at your school yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Brothers and sisters">
            {student.siblings.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/school/students/${s.id}`}
                  className="group inline-flex items-center gap-2 rounded-xl border border-border bg-surface py-1.5 pl-1.5 pr-3 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
                >
                  <StudentAvatar name={s.name} seed={s.admissionNumber} size="sm" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground group-hover:text-primary-deep">{s.name}</span>
                    <span className="block text-xs text-foreground-muted">{placeLabel(s.className ? { className: s.className, sectionName: s.sectionName } : null)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block icon={History} tone="info" title="Class history" index={4} tip="One row per academic year. A new year adds a row at promotion; old rows are never changed.">
        <ol className="space-y-2">
          {student.enrolments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-background/70 px-3 py-2">
              <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold", e.current ? "bg-success-soft text-success" : "bg-surface-muted text-foreground-muted")}>
                {e.academicYear?.name ?? "Unknown year"}
                {e.current && " · now"}
              </span>
              <span className="text-sm font-semibold text-foreground">{placeLabel(e)}</span>
              {e.rollNumber != null && <span className="text-xs text-foreground-muted">Roll {e.rollNumber}</span>}
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-foreground-muted">
                <CalendarClock className="size-3.5" aria-hidden />
                since {formatDay(e.enrolledAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ol>
      </Block>

      <Block icon={MapPin} tone="navy" title="Address" index={5}>
        {addressLines.length > 0 ? (
          <address className="text-sm not-italic leading-relaxed text-foreground">
            {addressLines.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </address>
        ) : (
          <p className="text-sm text-foreground-muted">Not given.</p>
        )}
      </Block>

      <Block icon={student.previousSchool ? School : ClipboardList} tone="primary" title="Previous school" index={6}>
        {student.previousSchool ? (
          <dl>
            <Row label="School">{student.previousSchool.name}</Row>
            <Row label="Last class">{student.previousSchool.lastClass ?? none}</Row>
            <Row label="TC number">{student.previousSchool.tcNumber ?? none}</Row>
            <Row label="TC date">{student.previousSchool.tcDate ? formatDay(student.previousSchool.tcDate) : none}</Row>
          </dl>
        ) : (
          <p className="text-sm text-foreground-muted">Not given (a first school, or not known).</p>
        )}
      </Block>

      <Block icon={Fingerprint} tone="info" title="IDs and records" index={7}>
        <dl>
          <Row label="Aadhaar">{student.aadhaarNumber ? <span className="font-mono">{formatAadhaar(student.aadhaarNumber)}</span> : none}</Row>
          <Row label="Samagra ID">{student.samagraId ?? none}</Row>
          <Row label="APAAR ID">{student.apaarId ?? none}</Row>
          <Row label="PEN (UDISE+)">{student.pen ?? none}</Row>
          <Row label="SR / Scholar no.">{student.srNumber ?? none}</Row>
        </dl>
      </Block>

      <Block icon={HeartPulse} tone="danger" title="More details" index={8}>
        <dl>
          <Row label="Religion">{student.religion ?? none}</Row>
          <Row label="Nationality">{student.nationality ?? none}</Row>
          <Row label="Emergency / WhatsApp">{student.emergencyMobile ? formatMobile(student.emergencyMobile) : none}</Row>
          <Row label="Disability (CWSN)">{student.disability ?? none}</Row>
          <Row label="Medical / allergy">{student.medicalNotes ?? none}</Row>
          <Row label="RTE seat">{student.rteSeat ? "Yes" : "No"}</Row>
          <Row label="BPL family">{student.bpl ? "Yes" : "No"}</Row>
          <Row label="Fee concession">{student.feeConcession ?? none}</Row>
          <Row label="Transport">{student.transportRoute || student.transportStop ? [student.transportRoute, student.transportStop].filter(Boolean).join(" · ") : none}</Row>
        </dl>
      </Block>

      {own.length > 0 && (
        <Block icon={Sparkles} tone="success" title="Your school's own details" index={9}>
          <dl>
            {own.map((f) => (
              <Row key={f.key} label={f.label}>
                {ownAnswer(f, student.custom?.[f.key])}
              </Row>
            ))}
          </dl>
        </Block>
      )}
    </div>
  );
}
