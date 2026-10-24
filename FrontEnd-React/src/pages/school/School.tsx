import { BookOpen, Building2, MapPin, Phone, UserRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSchoolProfile } from "../../hooks/useSchoolProfile";
import { MONTHS, designationLabel, formatAffiliations, formatBoards, formatClassRange, formatPhone } from "../../constants/schoolOptions";
import { formatDayRange } from "../../utils/academicYear";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { Skeleton } from "../../components/ui/Skeleton";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-foreground-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">
        {children || "-"}
      </dd>
    </div>
  );
}

/** Everything the school told us during onboarding, as the school's profile page. */
export default function SchoolProfilePage() {
  const { user, tenant } = useAuth();
  const profile = useSchoolProfile();
  if (!user) return null;
  const s = profile?.steps;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My school"
        title={tenant?.name ?? "Your school"}
        description="The details you gave when you registered. Editing them from here is coming soon."
        actions={<Badge tone="success">Approved</Badge>}
      />

      {!s ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {[
            {
              title: "School",
              icon: Building2,
              rows: [
                ["Name", s[1].schoolName],
                ["Type", s[1].schoolType],
                ["Board and medium", formatBoards(s[1].boards)],
                ["Classes", formatClassRange(s[1].lowestClass, s[1].highestClass)],
                ["Affiliation no.", formatAffiliations(s[1].boards)],
                ["UDISE+ code", s[1].udiseCode],
                ["Established", s[1].establishedYear],
              ],
            },
            {
              title: "Address and contact",
              icon: MapPin,
              rows: [
                [
                  "Address",
                  [s[2].addressLine1, s[2].addressLine2, s[2].city]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["District", s[2].district],
                ["Division", s[2].division],
                [
                  "State and PIN",
                  [s[2].state, s[2].pincode].filter(Boolean).join(" - "),
                ],
                [
                  "Phone",
                  <span
                    key="phone"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Phone
                      className="size-3.5 text-foreground-muted"
                      aria-hidden
                    />
                    {formatPhone(s[2].schoolPhone)}
                  </span>,
                ],
                ["Email", s[2].schoolEmail],
                ["Website", s[2].website],
              ],
            },
            {
              title: "Academics",
              icon: BookOpen,
              rows: [
                ["Students (approx.)", s[1].approxStudents],
                ["Session starts", MONTHS[s[1].sessionStartMonth - 1]],
                ["First academic year", s[1].academicYear?.name ? `${s[1].academicYear.name}, ${formatDayRange(s[1].academicYear.startDate, s[1].academicYear.endDate)}` : ""],
              ],
            },
            {
              title: "Administrator",
              icon: UserRound,
              rows: [
                ["Name", s[3].adminName],
                ["Role", designationLabel(s[3].designation, s[3].designationOther)],
                ["Mobile", formatPhone(s[3].mobile)],
                ["Login email", user.email],
              ],
            },
          ].map((card, i) => (
            <Card
              key={card.title}
              className="stagger-item"
              style={{ "--i": i } as React.CSSProperties}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <card.icon className="size-4 text-primary" aria-hidden />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border">
                  {card.rows.map(([label, value]) => (
                    <Row key={String(label)} label={String(label)}>
                      {value as React.ReactNode}
                    </Row>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
