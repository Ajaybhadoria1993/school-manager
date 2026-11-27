import { useState } from "react";
import { useSearchParams } from "react-router";
import { BellRing, BookCheck, ChartColumn, CircleAlert, Clock, Download, ListOrdered, NotebookPen, UsersRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useProgressExport } from "../../hooks/useProgressExport";
import { useYearView } from "../../hooks/useYearView";
import { useGetTeachingProgressQuery } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { todayStartRange } from "../../utils/attendance";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import { classKey } from "../../utils/teachingProgress";
import type { ProgressFilter } from "../../types";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { DailyUpdates } from "../../components/progress/DailyUpdates";
import { ReminderDialog } from "../../components/progress/ReminderDialog";
import { ChapterProgressTable, TeacherTable } from "../../components/progress/ProgressTables";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DateRangeControl } from "../../components/ui/DateRangeControl";
import { FilterSelect } from "../../components/ui/FilterBar";
import { PageTabs, type PageTab } from "../../components/ui/PageTabs";
import { Skeleton } from "../../components/ui/Skeleton";
import { TabPanel } from "../../components/ui/TabPanel";
import { useResultModal } from "../../components/ui/ResultModal";

type Tab = "daily" | "chapters" | "teachers";
const TABS: PageTab<Tab>[] = [
  { id: "daily", label: "Daily updates", icon: NotebookPen },
  { id: "chapters", label: "Chapter progress", icon: ListOrdered },
  { id: "teachers", label: "Teachers", icon: UsersRound },
];

/**
 * Teaching progress (`/teaching-progress`, docs/teaching-progress.md): which teacher taught what in which class and subject, the homework
 * and how far the chapters are, for the days chosen. The school sees every class; a teacher their classes as class teacher (every subject)
 * and the subjects they teach: the server decides. Opens on today. The days, the filters, the tab and the page are kept in the address.
 * **Export** downloads the same as an Excel file; the school also sets the **Reminder** to teachers who have not written the diary.
 */
export default function TeachingProgressPage() {
  const [params, setParams] = useSearchParams();
  const today = todayInIndia();
  const { viewing } = useYearView();
  const start = todayStartRange(today, viewing);
  const picked = { classKey: params.get("class") ?? "", subjectId: params.get("subject") ?? "", teacherId: params.get("teacher") ?? "" };
  const [classId, sectionId] = picked.classKey.split(":");
  const filter: ProgressFilter = {
    from: params.get("from") ?? start.from,
    to: params.get("to") ?? start.to,
    ...(classId && sectionId ? { classId, sectionId } : {}),
    ...(picked.subjectId ? { subjectId: picked.subjectId } : {}),
    ...(picked.teacherId ? { teacherId: picked.teacherId } : {}),
  };
  const asked = params.get("tab");
  const tab: Tab = TABS.find((t) => t.id === asked)?.id ?? "daily";
  const page = Math.max(1, Math.trunc(Number(params.get("page"))) || 1);
  const res = useGetTeachingProgressQuery(filter);
  // A refused read (too many days, say) shows what the server said, never the figures of the days asked before.
  const data = res.isError ? undefined : res.data?.data;
  const { exportProgress, exporting } = useProgressExport();
  const role = useAuth().user?.role;
  // The reminder is the school's own choice; a year that is over is only read.
  const setsReminder = (role === "school_admin" || role === "principal") && !viewing;
  const [reminding, setReminding] = useState(false);
  const result = useResultModal();
  const behindLink = new URLSearchParams(params);
  behindLink.set("tab", "chapters");
  behindLink.set("behind", "1");
  behindLink.delete("page");

  /** Changes the address. Anything but the page itself starts again at the first page. */
  function change(patch: Record<string, string>) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (!("page" in patch)) out.delete("page");
        for (const [key, value] of Object.entries(patch)) {
          if (value) out.set(key, value);
          else out.delete(key);
        }
        return out;
      },
      { replace: true }
    );
  }

  return (
    <div className="space-y-5">
      <StudentFormHeader
        title="Teaching progress"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        actions={
          <>
            {setsReminder && (
              <Button variant="outline" onClick={() => setReminding(true)}>
                <BellRing className="size-4" aria-hidden />
                Reminder
              </Button>
            )}
            <Button variant="outline" disabled={exporting} onClick={() => void exportProgress(filter)}>
              <Download className="size-4" aria-hidden />
              Export
            </Button>
          </>
        }
      />
      <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2.5">
        <DateRangeControl range={{ from: filter.from, to: filter.to }} noFuture onChange={(r) => change({ from: r.from, to: r.to })} />
        <div className="w-full sm:w-44">
          <FilterSelect id="progress-class" name="Class" all="All classes" value={picked.classKey} options={(data?.options.classes ?? []).map((c) => ({ value: classKey(c), label: c.label }))} onChange={(v) => change({ class: v })} />
        </div>
        <div className="w-full sm:w-44">
          <FilterSelect id="progress-subject" name="Subject" all="All subjects" value={picked.subjectId} options={(data?.options.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => change({ subject: v })} />
        </div>
        <div className="w-full sm:w-48">
          <FilterSelect id="progress-teacher" name="Teacher" all="All teachers" value={picked.teacherId} options={(data?.options.teachers ?? []).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => change({ teacher: v })} />
        </div>
      </div>

      {res.isFetching && !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the teaching progress."}</Card>
      ) : (
        <div className={cn("space-y-5 transition-opacity", res.isFetching && "opacity-70")}>
          <section aria-label="About these days" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatTile label="Updates" value={data.summary.updates} icon={NotebookPen} tone="primary" />
            <StatTile label="Homework given" value={data.summary.homework} icon={BookCheck} tone="success" />
            <StatTile label="Chapters finished" value={`${data.summary.chaptersDone} of ${data.summary.chaptersTotal}`} icon={ChartColumn} tone="navy" />
            <StatTile label="Without an update" value={data.summary.withoutUpdate} icon={CircleAlert} tone="warning" />
            <StatTile label="Behind schedule" value={data.summary.behind} icon={Clock} tone="warning" href={`/teaching-progress?${behindLink.toString()}`} />
          </section>
          <PageTabs label="What to look at" tabs={TABS} value={tab} onChange={(next) => change({ tab: next })} />
          <TabPanel tab={tab} role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
            {tab === "daily" && <DailyUpdates filter={filter} page={page} onPage={(next) => change({ page: String(next) })} />}
            {tab === "chapters" && <ChapterProgressTable rows={data.rows} onlyBehind={params.get("behind") === "1"} onOnlyBehind={(only) => change({ behind: only ? "1" : "" })} />}
            {tab === "teachers" && <TeacherTable rows={data.rows} onView={(teacherId) => change({ teacher: teacherId, tab: "daily" })} />}
          </TabPanel>
        </div>
      )}
      {reminding && (
        <ReminderDialog
          onClose={() => setReminding(false)}
          onSaved={(words) => {
            setReminding(false);
            result.done("Reminder saved", words);
          }}
        />
      )}
      {result.modal}
    </div>
  );
}
