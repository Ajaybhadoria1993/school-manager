import { useState } from "react";
import { Link } from "react-router";
import { HandCoins, Search } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGetDuesQuery } from "../../redux/api/feesApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { rupees } from "../../utils/fees";
import { cn } from "../../utils/helpers";
import type { AcademicStructure } from "../../types";
import { collectLink } from "../fees/collectLink";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { StudentAvatar } from "./StudentAvatar";
import { StudentsNotice } from "./StudentsNotice";

const TH = "px-4 py-3 text-left text-[13.5px] font-semibold text-foreground";
/** "all" stands for "every class" in the dropdown (a dropdown cannot show an empty value as picked). */
const ALL = "all";

/**
 * The Fee overdue tab of the Students page (`/school/students?tab=fees`, 2026-11-22): the students who owe fees now, from the same read as Fees > Dues
 * (`GET /fees/dues`: the instalments whose day has come and are not paid, worst first). It has its own search and class, both done by the server, and an
 * orange **Collect** on each row that opens the student's fee account. Only for the people who may collect fees, and only for the running year.
 */
export function FeeOverdueList({ structure }: { structure: AcademicStructure }) {
  const [text, setText] = useState("");
  const searched = useDebouncedValue(text.trim(), 250);
  const [classId, setClassId] = useState("");
  const res = useGetDuesQuery({ ...(classId ? { classId } : {}), ...(searched ? { search: searched } : {}) });
  const data = res.currentData?.data ?? res.data?.data;
  const filtered = !!classId || !!searched;

  return (
    <section aria-label="Students who owe fees" className="space-y-4">
      <div role="search" aria-label="Find students who owe fees" className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="min-w-[14rem] flex-1">
          <Input
            aria-label="Search students who owe fees"
            icon={Search}
            value={text}
            maxLength={60}
            placeholder="Search by name or admission number"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="w-52">
          <Select
            id="overdue-class"
            aria-label="Show the students of a class"
            value={classId || ALL}
            options={[{ value: ALL, label: "All classes" }, ...structure.classes.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(id) => setClassId(id === ALL ? "" : id)}
          />
        </div>
      </div>

      {!data ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fees that are due."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" aria-busy="true" />
        )
      ) : data.items.length === 0 ? (
        <StudentsNotice icon={HandCoins} tone="success" title={filtered ? "No student matches" : "No fees are overdue"} />
      ) : (
        <div className={cn("overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-opacity", res.isFetching && "opacity-70")}>
          <table className="w-full border-collapse text-sm" aria-label="Students with fees overdue">
            <thead className="border-b border-border bg-background">
              <tr>
                <th scope="col" className={TH}>
                  Student
                </th>
                <th scope="col" className={cn(TH, "hidden md:table-cell")}>
                  Class
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  Due now
                </th>
                <th scope="col" className={cn(TH, "hidden text-right sm:table-cell")}>
                  Late
                </th>
                <th scope="col" className={cn(TH, "hidden lg:table-cell")}>
                  Oldest due
                </th>
                <th scope="col" className="w-24">
                  <span className="sr-only">Collect</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.studentId} className="border-t border-surface-muted first:border-t-0">
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-3">
                      <StudentAvatar name={d.name} seed={d.admissionNumber} size="sm" />
                      <div className="min-w-0">
                        <Link to={`/school/students/${d.studentId}`} className="block truncate font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                          {d.name}
                        </Link>
                        <span className="block truncate font-mono text-xs font-semibold text-foreground-muted">{d.admissionNumber}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 align-middle text-foreground-secondary md:table-cell">{d.classLabel ?? "-"}</td>
                  <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums">{rupees(d.dueNow)}</td>
                  <td className="hidden px-4 py-3 text-right align-middle tabular-nums text-danger sm:table-cell">{d.overdue > 0 ? rupees(d.overdue) : "-"}</td>
                  <td className="hidden px-4 py-3 align-middle text-foreground-secondary lg:table-cell">{formatDay(d.oldestDue)}</td>
                  <td className="px-4 py-3 text-right align-middle">
                    <Link to={`/fees/collect?student=${d.studentId}`} className={collectLink} aria-label={`Collect from ${d.name}`}>
                      Collect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
