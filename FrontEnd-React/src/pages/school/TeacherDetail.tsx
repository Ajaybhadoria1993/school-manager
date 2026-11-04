import { useState } from "react";
import { Link, useParams } from "react-router";
import { AtSign, BookOpen, Briefcase, CalendarDays, KeyRound, LogOut, Pencil, Repeat2, RotateCcw, UserRound, UserRoundCog } from "lucide-react";
import { employmentLabel } from "../../constants/teachers";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { DAY_SHORT } from "../../constants/timetable";
import { useGetSubjectsQuery, useGetTeacherQuery, useUpdateTeacherMutation } from "../../redux/api/timetableApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { formatMobile } from "../../utils/students";
import type { Teacher } from "../../types";
import { AssignClassDialog } from "../../components/teachers/AssignClassDialog";
import { ChangeUsernameDialog } from "../../components/teachers/ChangeUsernameDialog";
import { Block, None, Row } from "../../components/teachers/DetailBlocks";
import { LeaveTeacherModal } from "../../components/teachers/LeaveTeacherModal";
import { TeacherClassesBlock } from "../../components/teachers/TeacherClassesBlock";
import { MakeLoginDialog, ResetPasswordDialog } from "../../components/teachers/LoginDialogs";
import { ReplaceTeacherDialog } from "../../components/teachers/ReplaceTeacherDialog";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const linkClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const addressText = (a: Teacher["address"]) => [a.line1, a.city, a.state, a.pincode].filter(Boolean).join(", ");

/**
 * One teacher (`/teachers/:id` from Teacher, `/school/teachers/:id` from Manage Teacher): the classes they are given (class teacher of,
 * the subjects they teach, Assign class), then everything the school keeps about them in four cards (personal, job, teaching, login),
 * with Week, Change and the teacher leaving (or coming back) at the top. The login card shows the username (Change username) and
 * whether it works; the password is never shown, only made again (New password, Make a login).
 */
export default function TeacherDetailPage() {
  const { id = "" } = useParams();
  const { base, label } = useTeacherBase();
  const res = useGetTeacherQuery(id);
  const subjectNames = new Map((useGetSubjectsQuery("all").data?.data.items ?? []).map((s) => [s.id, s.name]));
  const [update] = useUpdateTeacherMutation();
  const { push } = useToast();
  const [dialog, setDialog] = useState<"password" | "login" | "leave" | "replace" | "username" | "assign" | null>(null);
  const t = res.data?.data;
  const crumbs = [{ label, to: base }];

  if (res.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title="Teacher" crumbs={crumbs} />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teacher."}</p>
          <Link to={base} className={linkClass}>
            All teachers
          </Link>
        </Card>
      </div>
    );
  }

  const bringBack = () =>
    void update({ id: t.id, isActive: true }).unwrap().then(
      () => push("success", `${t.name} is teaching again`),
      (err) => push("error", getApiError(err)?.message ?? "Could not bring them back.")
    );

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title={t.name}
        subtitle={t.isActive ? undefined : <Badge tone="warning">Left</Badge>}
        crumbs={crumbs}
        actions={
          <>
            {t.isActive ? (
              <>
                <Link to={`/school/timetable/teacher/${t.id}`} className={linkClass}>
                  <CalendarDays className="size-4" aria-hidden />
                  Week
                </Link>
                <Link to={`${base}/${t.id}/edit`} className={linkClass}>
                  <Pencil className="size-4" aria-hidden />
                  Change
                </Link>
                {t.load.sections > 0 ? (
                  <Button variant="outline" onClick={() => setDialog("replace")}>
                    <Repeat2 className="size-4" aria-hidden />
                    Give classes
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setDialog("leave")}>
                    <LogOut className="size-4" aria-hidden />
                    Has left
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={bringBack}>
                <RotateCcw className="size-4" aria-hidden />
                Bring back
              </Button>
            )}
          </>
        }
      />

      <TeacherClassesBlock teacher={t} onAssign={() => setDialog("assign")} />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <Block icon={UserRound} tone="primary" title="Personal" index={0}>
          <Row label="Gender">{t.gender ?? <None />}</Row>
          <Row label="Date of birth">{t.dateOfBirth ? formatDay(t.dateOfBirth) : <None />}</Row>
          <Row label="Mobile">{t.mobile ? formatMobile(t.mobile) : <None />}</Row>
          <Row label="Email">{t.email ?? <None />}</Row>
          <Row label="Address">{addressText(t.address) || <None />}</Row>
        </Block>

        <Block icon={Briefcase} tone="navy" title="Job" index={1}>
          <Row label="Employee code">{t.employeeCode ?? <None />}</Row>
          <Row label="Designation">{t.designation ?? <None />}</Row>
          <Row label="Qualification">{t.qualification ?? <None />}</Row>
          <Row label="Experience">{t.experienceYears === null ? <None /> : `${t.experienceYears} year${t.experienceYears === 1 ? "" : "s"}`}</Row>
          <Row label="Joining date">{t.joiningDate ? formatDay(t.joiningDate) : <None />}</Row>
          <Row label="Employment">{employmentLabel(t.employmentType) ?? <None />}</Row>
        </Block>

        <Block icon={BookOpen} tone="success" title="Teaching" index={2}>
          <Row label="Can teach">{t.subjectIds.length === 0 ? <None /> : t.subjectIds.map((sid) => subjectNames.get(sid) ?? "A subject").join(", ")}</Row>
          <Row label="Given this year">{t.load.sections === 0 ? "Nothing yet" : `${t.load.sections} class${t.load.sections === 1 ? "" : "es"} · ${t.load.periodsAllotted} periods a week`}</Row>
          <Row label="Most periods a day">{t.maxPeriodsPerDay ?? <span className="font-normal text-foreground-muted">No limit</span>}</Row>
          <Row label="Most periods a week">{t.maxPeriodsPerWeek ?? <span className="font-normal text-foreground-muted">No limit</span>}</Row>
          <Row label="Does not come">
            {t.offDays.length === 0 ? (
              <span className="font-normal text-foreground-muted">Comes every day</span>
            ) : (
              <span className="flex flex-wrap justify-end gap-1">
                {t.offDays.map((d) => (
                  <Badge key={d}>{DAY_SHORT[d]}</Badge>
                ))}
              </span>
            )}
          </Row>
        </Block>

        <Block icon={KeyRound} tone="warning" title="Login" index={3}>
          {t.login ? (
            <>
              <Row label="Username">
                <span className="font-mono">{t.login.username}</span>
              </Row>
              <Row label="Status">{t.login.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Closed</Badge>}</Row>
              <div className="flex flex-wrap gap-2 pt-3">
                <Button variant="outline" onClick={() => setDialog("username")}>
                  <AtSign className="size-4" aria-hidden />
                  Change username
                </Button>
                <Button variant="outline" onClick={() => setDialog("password")}>
                  <KeyRound className="size-4" aria-hidden />
                  New password
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-foreground-muted">No login yet</p>
              <Button variant="outline" onClick={() => setDialog("login")}>
                <UserRoundCog className="size-4" aria-hidden />
                Make a login
              </Button>
            </div>
          )}
        </Block>
      </div>

      {dialog === "password" && <ResetPasswordDialog teacher={t} onClose={() => setDialog(null)} />}
      {dialog === "login" && <MakeLoginDialog teacher={t} onClose={() => setDialog(null)} />}
      {dialog === "leave" && <LeaveTeacherModal teacher={t} onClose={() => setDialog(null)} />}
      {dialog === "replace" && <ReplaceTeacherDialog teacher={t} onClose={() => setDialog(null)} />}
      {dialog === "username" && <ChangeUsernameDialog teacher={t} onClose={() => setDialog(null)} />}
      {dialog === "assign" && <AssignClassDialog teacher={t} onClose={() => setDialog(null)} />}
    </div>
  );
}
