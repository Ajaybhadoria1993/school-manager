import { useState } from "react";
import { Link } from "react-router";
import { CircleAlert, HandCoins, Search, UsersRound, Wand2 } from "lucide-react";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { collectLink } from "../../components/fees/collectLink";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { Input } from "../../components/ui/Input";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGenerateFeeAccountsMutation, useGetDuesQuery } from "../../redux/api/feesApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { countWords, rupees } from "../../utils/fees";

/**
 * Fees > Dues (`/fees/dues`): who owes what now in the running session: each student's instalments that have come due and are not paid, the late ones
 * apart, worst first; each row leads to the student's account to take the payment. A student's account is made when it is first opened, so "Make
 * every student's fees" (for those who manage the fees) makes them all at once and brings every family into this list.
 */
export default function DuesPage() {
  const can = useCan();
  const [search, setSearch] = useState("");
  const searched = useDebouncedValue(search.trim(), 250);
  const res = useGetDuesQuery({ search: searched || undefined });
  const [generate, generating] = useGenerateFeeAccountsMutation();
  const { push } = useToast();
  const data = res.data?.data;

  async function makeAll() {
    try {
      const made = await generate({}).unwrap();
      push("success", `Fees made for ${countWords(made.data.students, "student")}`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not make the fees. Please try again.");
    }
  }

  const make = can("fees.manage") ? (
    <Button variant="outline" onClick={() => void makeAll()} loading={generating.isLoading}>
      <Wand2 className="size-4" aria-hidden />
      Make every student&apos;s fees
    </Button>
  ) : undefined;

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Dues" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} subtitle={data ? `As on ${formatDay(data.asOn)} · ${data.year}` : undefined} actions={make} />

      <section aria-label="About the dues" className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Students who owe" value={data?.totals.students ?? null} icon={UsersRound} tone={data && data.totals.students > 0 ? "warning" : "success"} />
        <StatTile label="Due now" value={data ? rupees(data.totals.dueNow) : null} icon={HandCoins} tone="primary" />
        <StatTile label="Late" value={data ? rupees(data.totals.overdue) : null} icon={CircleAlert} tone={data && data.totals.overdue > 0 ? "danger" : "success"} />
      </section>

      <Input icon={Search} type="search" aria-label="Search by name or admission number" placeholder="Search by name or admission number" value={search} onChange={(e) => setSearch(e.target.value)} />

      {!data ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the dues."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : data.items.length === 0 ? (
        <StudentsNotice icon={HandCoins} tone="success" title={searched ? "No student matches" : "Nothing is due"} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Students with fees due</caption>
            <thead className="border-b border-border bg-background text-left text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Student
                </th>
                <th scope="col" className="px-3 py-3">
                  Class
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Due now
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Late
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Late fine
                </th>
                <th scope="col" className="px-3 py-3">
                  Oldest due
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Collect</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.studentId} className="border-t border-surface-muted">
                  <th scope="row" className="px-3 py-3 text-left font-semibold">
                    {d.name}
                    <span className="block text-xs font-normal text-foreground-muted">{d.admissionNumber}</span>
                  </th>
                  <td className="px-3 py-3 text-foreground-secondary">{d.classLabel ?? "-"}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{rupees(d.dueNow)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-danger">{d.overdue > 0 ? rupees(d.overdue) : "-"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{d.lateFine > 0 ? rupees(d.lateFine) : "-"}</td>
                  <td className="px-3 py-3 text-foreground-secondary">{formatDay(d.oldestDue)}</td>
                  <td className="px-3 py-3 text-right">
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
    </div>
  );
}
