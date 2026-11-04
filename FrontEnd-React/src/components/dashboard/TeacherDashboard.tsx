import { UserRound } from "lucide-react";
import { employmentLabel } from "../../constants/teachers";
import { DAY_SHORT } from "../../constants/timetable";
import { useAuth } from "../../hooks/useAuth";
import { useGetMyTeacherQuery, useGetSubjectsQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { formatMobile } from "../../utils/students";
import { Block, None, Row } from "../teachers/DetailBlocks";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { MyClasses } from "./MyClasses";
import { WelcomeHeader } from "./school/WelcomeHeader";

/**
 * The home of a signed-in teacher: a greeting and what the school keeps about them (their post, what they teach, what they were given
 * this year, the days they do not come). Two reads: their own record, and the subjects' names. It does not show the school's setup,
 * numbers or shortcuts: those are for the people who run the school. Their timetable and classes come to this page as the school
 * assigns them.
 */
export function TeacherDashboard() {
  const { user, tenant } = useAuth();
  const res = useGetMyTeacherQuery();
  const subjectNames = new Map((useGetSubjectsQuery("all").data?.data.items ?? []).map((s) => [s.id, s.name]));
  const t = res.data?.data;
  if (!user) return null;

  return (
    <div className="space-y-6">
      <WelcomeHeader firstName={user.name.split(" ")[0]} schoolName={tenant?.name ?? "your school"} shortcuts={false} />

      <MyClasses />

      {res.isLoading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : !t ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">{getApiError(res.error)?.message ?? "Could not load your details."}</Card>
      ) : (
        <Block icon={UserRound} tone="primary" title="About you">
          <Row label="Designation">{t.designation ?? <None />}</Row>
          <Row label="Employee code">{t.employeeCode ?? <None />}</Row>
          <Row label="Mobile">{t.mobile ? formatMobile(t.mobile) : <None />}</Row>
          <Row label="Employment">{employmentLabel(t.employmentType) ?? <None />}</Row>
          <Row label="Can teach">{t.subjectIds.length === 0 ? <None /> : t.subjectIds.map((id) => subjectNames.get(id) ?? "A subject").join(", ")}</Row>
          <Row label="Given this year">{t.load.sections === 0 ? "Nothing yet" : `${t.load.sections} class${t.load.sections === 1 ? "" : "es"} · ${t.load.periodsAllotted} periods a week`}</Row>
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
          {t.login && (
            <Row label="Your username">
              <span className="font-mono">{t.login.username}</span>
            </Row>
          )}
        </Block>
      )}
    </div>
  );
}
