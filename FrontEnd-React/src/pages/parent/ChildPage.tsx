import { useMemo } from "react";
import { useParams } from "react-router";
import { CalendarDays, ClipboardList, FolderTree, MapPin, UserRound, UsersRound } from "lucide-react";
import { useGetChildExamsQuery, useGetMyChildQuery, useGetMyChildTimetableQuery } from "../../redux/api/parentApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { ageText, formatAadhaar, formatMobile } from "../../utils/students";
import type { ChildTimetable, GridView } from "../../types";
import { ChildAttendance } from "../../components/parent/ChildAttendance";
import { ChildExamsSection } from "../../components/parent/ChildExams";
import { ChildLeaves } from "../../components/parent/ChildLeaves";
import { ChildDiary, ChildTests } from "../../components/parent/ChildWork";
import { ClassWeekView } from "../../components/schoolClass/ClassWeekView";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Block, None, Row } from "../../components/teachers/DetailBlocks";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

/** The child's records a parent may want to read, in order; only the ones the school filled in are shown. */
const RECORDS: { key: string; label: string; format?: (v: string) => string }[] = [
  { key: "aadhaarNumber", label: "Aadhaar number", format: formatAadhaar },
  { key: "apaarId", label: "APAAR ID" },
  { key: "pen", label: "PEN (UDISE+)" },
  { key: "srNumber", label: "SR / Scholar number" },
  { key: "religion", label: "Religion" },
  { key: "nationality", label: "Nationality" },
  { key: "emergencyMobile", label: "Emergency / WhatsApp number", format: formatMobile },
  { key: "disability", label: "Disability (CWSN)" },
  { key: "medicalNotes", label: "Medical conditions / allergy" },
  { key: "transportRoute", label: "Transport route" },
  { key: "transportStop", label: "Transport stop" },
  { key: "feeConcession", label: "Fee concession" },
];

/** The published week in the shape the week view draws (the parent's answer carries only what a parent may see). */
function asGridView(week: ChildTimetable): GridView {
  return {
    unit: null as never,
    exists: true,
    status: "published",
    publishedAt: week.publishedAt,
    updatedAt: null,
    days: week.days,
    cells: week.cells,
    allotments: week.allotments.map((a) => ({ ...a, category: "academic", blockSize: 1, group: null })),
    teachers: week.teachers.map((t) => ({ ...t, isActive: true, offDays: [], maxPerDay: null, maxPerWeek: null, subjectIds: [] })),
    busy: [],
    load: [],
    issues: [],
    stats: { total: 0, filled: week.cells.length, free: 0, placed: {} },
  };
}

/**
 * One child, for their parent (`/my-children/:id`, 2026-11-04): first their day (the diary, tests and marks, attendance, leave, and their
 * class's week once the school has published it), then their class this year (with the roll number and the class teacher, N/A when there
 * is none), who they are, their parents, their address and what else the school keeps about them. The server answers only for the
 * parent's own children.
 */
export default function ChildPage() {
  const { id = "" } = useParams();
  const childRes = useGetMyChildQuery(id);
  const weekRes = useGetMyChildTimetableQuery(id);
  // The same read as the Exams section below (one request): the days of this week the timetable gives way on.
  const examsRes = useGetChildExamsQuery(id);
  const child = childRes.data?.data;
  const week = weekRes.data?.data;
  const view = useMemo(() => (week ? asGridView(week) : null), [week]);

  if (childRes.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (!child) {
    return <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(childRes.error)?.message ?? "Could not load the child."}</Card>;
  }

  const records = RECORDS.flatMap((r) => {
    const value = child.records[r.key];
    return typeof value === "string" && value.trim() !== "" ? [{ label: r.label, value: r.format ? r.format(value) : value }] : [];
  });
  if (child.records.rteSeat === true) records.push({ label: "RTE seat", value: "Yes" });
  if (child.records.bpl === true) records.push({ label: "BPL family", value: "Yes" });
  const address = [child.address.line1, child.address.line2, child.address.city, child.address.state, child.address.pincode].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={child.name}
        crumbs={[{ label: "Home", to: "/dashboard" }]}
        info={child.place ? <Badge tone="primary">{child.place.label}</Badge> : undefined}
      />

      {/* The child's day first (what a parent opens the page for), their details after. */}
      <ChildDiary childId={child.id} />

      <ChildTests childId={child.id} />

      <ChildExamsSection childId={child.id} />

      <ChildAttendance childId={child.id} />

      <ChildLeaves childId={child.id} childName={child.name} />

      <section aria-label="Timetable" className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
          <CalendarDays className="size-5 text-primary" aria-hidden />
          Timetable
        </h2>
        {weekRes.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : view && week ? (
          <ClassWeekView view={view} label={week.label} examDays={examsRes.data?.data.week.days} />
        ) : (
          <Card className="px-5 py-8 text-center text-sm text-foreground-muted">The timetable is not published yet</Card>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Block icon={FolderTree} tone="primary" title="Class" index={0}>
          <Row label="Class">{child.place?.label ?? <None />}</Row>
          <Row label="Roll number">{child.place?.rollNumber ?? <None />}</Row>
          <Row label="Class teacher">{child.classTeacher?.name ?? "N/A"}</Row>
        </Block>

        <Block icon={UserRound} tone="success" title="About" index={1}>
          <Row label="Admission number">
            <span className="font-mono">{child.admissionNumber}</span>
          </Row>
          <Row label="Gender">{child.gender}</Row>
          <Row label="Date of birth">
            {formatDay(child.dateOfBirth)} <span className="font-normal text-foreground-muted">({ageText(child.dateOfBirth)})</span>
          </Row>
          <Row label="Admitted on">{formatDay(child.admissionDate)}</Row>
          <Row label="Blood group">{child.bloodGroup ?? <None />}</Row>
        </Block>

        <Block icon={UsersRound} tone="warning" title="Parents" index={2}>
          {child.guardians.map((g) => (
            <Row key={`${g.relation}-${g.name}`} label={g.relation}>
              {g.name}
              {g.mobile && <span className="block font-normal text-foreground-muted">+91 {formatMobile(g.mobile)}</span>}
            </Row>
          ))}
        </Block>

        <Block icon={MapPin} tone="navy" title="Address" index={3}>
          <p className="text-sm font-semibold text-foreground">{address || <None />}</p>
        </Block>

        {records.length > 0 && (
          <Block icon={ClipboardList} tone="info" title="More details" index={4}>
            {records.map((r) => (
              <Row key={r.label} label={r.label}>
                {r.value}
              </Row>
            ))}
          </Block>
        )}
      </div>
    </div>
  );
}
