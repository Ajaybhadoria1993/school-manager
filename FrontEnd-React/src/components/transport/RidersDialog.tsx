import { useState } from "react";
import { Search, Trash2, UsersRound } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAddRiderMutation, useGetRouteRidersQuery, useRemoveRiderMutation, useSearchRiderStudentsQuery } from "../../redux/api/transportApi";
import type { StudentChoice, TransportRoute } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { AppModal, ModalError } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

/**
 * The students who ride a route (docs/transport.md): who they are, their class and the stop each boards at. To add one the person finds the
 * student by name or admission number, picks the stop, and adds. A student has one bus: one who rides another route is said so, and adding
 * them here moves them. This is what lets a parent see their child's bus.
 */
export function RidersDialog({ route, onClose }: { route: TransportRoute; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState<StudentChoice | null>(null);
  const [stop, setStop] = useState(route.stops.length === 1 ? route.stops[0].name : "");
  const [problem, setProblem] = useState<string | null>(null);
  const query = useDebouncedValue(typed.trim(), 250);
  const riders = useGetRouteRidersQuery(route.id);
  const found = useSearchRiderStudentsQuery(query, { skip: query.length < 2 || chosen !== null });
  const [add, adding] = useAddRiderMutation();
  const [remove, removing] = useRemoveRiderMutation();
  const { push } = useToast();
  const data = riders.data?.data;
  const busy = adding.isLoading || removing.isLoading;
  const stopOptions = route.stops.map((s) => ({ value: s.name, label: s.name }));

  async function addIt() {
    if (!chosen) return;
    setProblem(null);
    try {
      await add({ routeId: route.id, studentId: chosen.id, stopName: stop }).unwrap();
      push("success", `${chosen.name} added to ${route.name}`);
      setChosen(null);
      setTyped("");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not add the student. Please try again.");
    }
  }

  async function take(studentId: string, name: string) {
    setProblem(null);
    try {
      await remove({ routeId: route.id, studentId }).unwrap();
      push("success", `${name} taken off ${route.name}`);
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not take the student off. Please try again.");
    }
  }

  return (
    <AppModal
      title={`Students on ${route.name}`}
      icon={UsersRound}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose} disabled={busy}>
          Done
        </Button>
      }
    >
      {route.stops.length === 0 ? (
        <p className="text-sm text-foreground-secondary">This route has no stops yet. Add its stops first (the pencil on the route), then put students on it.</p>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-surface-muted/40 p-3">
          <Field id="rider-search" label="Student" hint="Type a name or an admission number.">
            <Input
              id="rider-search"
              icon={Search}
              value={chosen ? chosen.name : typed}
              readOnly={chosen !== null}
              placeholder="Search a student"
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>

          {chosen ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-foreground-secondary">
                {chosen.classLabel ?? "No class this year"} · {chosen.admissionNumber}
                {chosen.route && <span className="ml-2 font-semibold text-warning">Rides {chosen.route} now: adding moves them here.</span>}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setChosen(null)} disabled={busy}>
                Change student
              </Button>
            </div>
          ) : query.length >= 2 ? (
            found.isFetching && !found.data ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : (found.data?.data.items.length ?? 0) === 0 ? (
              <p className="text-sm text-foreground-muted">No student matches “{query}”.</p>
            ) : (
              <ul aria-label="Students found" className="max-h-48 divide-y divide-border overflow-auto rounded-lg border border-border bg-surface">
                {found.data!.data.items.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => setChosen(s)}>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs text-foreground-muted">
                        {[s.classLabel, s.admissionNumber, s.route && `rides ${s.route}`].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          <Field id="rider-stop" label="Boards at">
            <Select id="rider-stop" options={stopOptions} value={stop} onChange={setStop} placeholder="Choose the stop" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => void addIt()} disabled={!chosen || !stop || busy} loading={adding.isLoading}>
              Add to route
            </Button>
          </div>
        </div>
      )}

      <section aria-label="Students on this route" className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
          {data ? `${data.items.length} student${data.items.length === 1 ? "" : "s"}` : "Students"}
          {data?.seats != null && (
            <Badge tone={data.items.length > data.seats ? "danger" : "neutral"}>
              {data.items.length} of {data.seats} seats
            </Badge>
          )}
        </p>
        {riders.isLoading || !data ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-foreground-muted">No student rides this route yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.items.map((r) => (
              <li key={r.studentId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {[r.classLabel, r.admissionNumber].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className={cn("shrink-0 text-xs", r.stopKnown ? "text-foreground-secondary" : "font-semibold text-warning")}>{r.stopKnown ? r.stopName : `${r.stopName} (not on the route now)`}</p>
                <Button variant="ghost" size="sm" aria-label={`Take ${r.name} off the route`} onClick={() => void take(r.studentId, r.name)} disabled={busy}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ModalError message={problem} />
    </AppModal>
  );
}
