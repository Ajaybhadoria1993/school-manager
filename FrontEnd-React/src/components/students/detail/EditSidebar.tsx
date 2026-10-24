import type { ReactNode } from "react";
import { Lightbulb, ShieldCheck, Hash, UsersRound, Save } from "lucide-react";
import { TONES } from "../../../constants/tones";
import { formatDay } from "../../../utils/academicYear";
import { cn } from "../../../utils/helpers";
import { ageText, formatMobile, placeLabel } from "../../../utils/students";
import type { StudentDetail } from "../../../types";
import { Card } from "../../ui/Card";
import { StickyAside } from "../../ui/StickyAside";
import { StudentAvatar } from "../StudentAvatar";

/** One line of the summary: the label at the left, the value at the right (cut with "..." when it is long, its full text on hover). */
function Row({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-foreground-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-foreground" title={title}>
        {children}
      </dd>
    </div>
  );
}

/**
 * The student as they are SAVED (not as the boxes read now): the initials, the name, a green Active mark, and the facts a person looks
 * for while editing, so a change can be compared with what is there. It follows the saved student, so it updates after a Save.
 */
function Summary({ student }: { student: StudentDetail }) {
  const parent = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];
  const address = [student.address.city, student.address.state].filter(Boolean).join(", ") || "Not given";
  return (
    <Card className="p-5" aria-label="The student as saved">
      <div className="text-center">
        <StudentAvatar name={student.name} seed={student.admissionNumber} size="lg" className="mx-auto" />
        <p className="mt-3 text-base font-bold text-foreground">{student.name}</p>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          Active
        </span>
      </div>
      <dl className="mt-4 divide-y divide-border/70 border-t border-border pt-2">
        <Row label="Admission no.">
          <span className="font-mono text-[13px]">{student.admissionNumber}</span>
        </Row>
        <Row label="Class">{placeLabel(student.place)}</Row>
        <Row label="Age">{ageText(student.dateOfBirth)}</Row>
        <Row label="Gender">{student.gender}</Row>
        <Row label="Parent" title={parent?.name}>
          {parent ? parent.name : "None"}
        </Row>
        <Row label="Phone">{parent?.mobile ? formatMobile(parent.mobile) : "Not given"}</Row>
        <Row label="Address" title={address}>
          {address}
        </Row>
        <Row label="Blood group">{student.bloodGroup ?? "Not given"}</Row>
        <Row label="Admitted on">{formatDay(student.admissionDate)}</Row>
      </dl>
    </Card>
  );
}

const TIPS: { icon: typeof Save; tone: "success" | "info" | "warning" | "primary"; text: string }[] = [
  { icon: Save, tone: "success", text: "Nothing is saved until you press Save changes. Escape in a box puts that box back as it was." },
  { icon: ShieldCheck, tone: "warning", text: "Another section or class moves the student for this academic year only. Earlier years stay in their class history." },
  { icon: UsersRound, tone: "primary", text: "A parent's details are shared by all their children: a change here shows on every one of them." },
  { icon: Hash, tone: "info", text: "The admission number cannot be changed." },
];

function EditTips() {
  return (
    <Card className="p-5" aria-label="Quick tips">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span aria-hidden className={cn("flex size-7 items-center justify-center rounded-lg", TONES.warning.tile)}>
          <Lightbulb className="size-4" />
        </span>
        Quick tips
      </h2>
      <ul className="mt-4 space-y-3.5">
        {TIPS.map((tip) => (
          <li key={tip.text} className="flex gap-2.5 text-xs leading-relaxed text-foreground-muted">
            <tip.icon className={cn("mt-0.5 size-4 shrink-0", TONES[tip.tone].text)} aria-hidden />
            {tip.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The column beside the edit form: the student as saved, and a few tips. It only reads. */
export function EditSidebar({ student }: { student: StudentDetail }) {
  return (
    <StickyAside label="About this student">
      <Summary student={student} />
      <EditTips />
    </StickyAside>
  );
}
