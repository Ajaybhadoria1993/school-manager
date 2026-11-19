import { useState } from "react";
import { useSearchParams } from "react-router";
import { Search, UserRound } from "lucide-react";
import { StudentAccount } from "../../components/fees/StudentAccount";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGetFeeAccountQuery, useSearchFeeStudentsQuery } from "../../redux/api/feesApi";
import { getApiError } from "../../utils/apiErrors";

/**
 * Fees > Collect fees (`/fees/collect`): find a student by name or admission number, see their fee account for the running session and take a payment.
 * The student is in the address (`?student=<id>`), so the Dues page can lead straight to an account and a refresh keeps it.
 */
export default function CollectFeesPage() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get("student") ?? "";
  const [typed, setTyped] = useState("");
  const query = useDebouncedValue(typed.trim(), 250);
  const found = useSearchFeeStudentsQuery(query, { skip: studentId !== "" || query.length < 2 });
  const account = useGetFeeAccountQuery(studentId, { skip: studentId === "" });
  const data = account.data?.data;

  const choose = (id: string) => setParams({ student: id });
  const another = () => {
    setTyped("");
    setParams({});
  };

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Collect fees"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        subtitle={data ? `${data.student.name} · ${data.student.classLabel ?? "no class"} · ${data.student.admissionNumber}` : undefined}
        actions={
          studentId ? (
            <Button variant="outline" onClick={another}>
              <UserRound className="size-4" aria-hidden />
              Another student
            </Button>
          ) : undefined
        }
      />

      {studentId === "" ? (
        <Card className="space-y-3 p-5">
          <Field id="collect-search" label="Find a student" hint="Type a name or an admission number." quiet>
            <Input id="collect-search" icon={Search} value={typed} placeholder="Name or admission number" autoComplete="off" autoFocus onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {query.length >= 2 &&
            (found.isFetching && !found.data ? (
              <Skeleton className="h-12 rounded-lg" />
            ) : (found.data?.data.items.length ?? 0) === 0 ? (
              <p className="text-sm text-foreground-muted">No student matches “{query}”.</p>
            ) : (
              <ul aria-label="Students found" className="divide-y divide-border rounded-lg border border-border">
                {found.data!.data.items.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-muted" onClick={() => choose(s.id)}>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs text-foreground-muted">{[s.classLabel, s.admissionNumber].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </Card>
      ) : account.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(account.error)?.message ?? "Could not load the fee account."}</p>
          <Button variant="outline" onClick={another}>
            Find another student
          </Button>
        </Card>
      ) : (
        <StudentAccount account={data} />
      )}
    </div>
  );
}
