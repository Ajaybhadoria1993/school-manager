import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { useAuth } from "../../hooks/useAuth";
import { useGetPermissionsQuery, useResetPermissionsMutation, useSavePermissionsMutation } from "../../redux/api/permissionsApi";
import type { PermissionProfile } from "../../types";
import { cn } from "../../utils/helpers";
import { getApiError } from "../../utils/apiErrors";
import { sameList, toggled } from "../../utils/permissions";

/** The drafts without one kind. */
const without = (drafts: Record<string, string[]>, key: string) => Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== key));

/**
 * Permissions (`/permissions`): what each kind of person of the school (Receptionist, Teacher, Parent, a Librarian...) may do, chosen with
 * checkboxes. The school admin and the principal can always do everything. A kind is picked on the left, its boxes are on the right, and
 * Save keeps them: that person's menu and pages follow it the next time they open the app. A box that needs another ticks it
 * (adding students needs seeing them). "Back to the usual list" is what the kind could do before the school chose.
 */
export default function PermissionsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const res = useGetPermissionsQuery();
  const [save, saveState] = useSavePermissionsMutation();
  const [reset, resetState] = useResetPermissionsMutation();
  const saving = saveState.isLoading;
  const resetting = resetState.isLoading;
  const data = res.data?.data;
  const canChange = user?.role === "school_admin";

  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // The boxes changed and not saved yet, per kind: switching to another kind keeps them.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});

  const profiles = useMemo(() => data?.profiles ?? [], [data]);
  const picked = profiles.find((p) => p.key === pickedKey) ?? profiles[0];
  useEffect(() => {
    if (!pickedKey && profiles[0]) setPickedKey(profiles[0].key);
  }, [pickedKey, profiles]);

  const listOf = (p: PermissionProfile) => drafts[p.key] ?? p.permissions;
  const changed = (p: PermissionProfile) => drafts[p.key] !== undefined && !sameList(drafts[p.key], p.permissions);

  const groups = useMemo(() => {
    if (!data || !picked) return [];
    const offered = new Set(picked.offered);
    return data.groups.map((g) => ({ ...g, items: g.items.filter((i) => offered.has(i.key)) })).filter((g) => g.items.length > 0);
  }, [data, picked]);

  if (!user) return null;

  const header = <StudentFormHeader title="Permissions" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />;

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the permissions."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-busy="true">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        )}
      </div>
    );
  }

  const set = (key: string, on: boolean) => {
    if (!picked || !canChange) return;
    setDrafts((d) => ({ ...d, [picked.key]: toggled(d[picked.key] ?? picked.permissions, key, on) }));
  };

  async function saveIt() {
    if (!picked) return;
    try {
      await save({ profile: picked.key, permissions: listOf(picked) }).unwrap();
      setDrafts((d) => without(d, picked.key));
      push("success", `${picked.label}: saved. It takes effect the next time they open the app.`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  async function backToUsual() {
    if (!picked) return;
    try {
      await reset(picked.key).unwrap();
      setDrafts((d) => without(d, picked.key));
      push("success", `${picked.label}: back to the usual list.`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not change it. Please try again.");
    }
  }

  const people = profiles.filter((p) => p.kind !== "staff");
  const staff = profiles.filter((p) => p.kind === "staff");
  const row = (p: PermissionProfile) => {
    const on = p.key === picked?.key;
    return (
      <li key={p.key}>
        <button
          type="button"
          onClick={() => setPickedKey(p.key)}
          aria-pressed={on}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
            on ? "bg-primary-soft font-semibold text-primary-deep" : "text-foreground hover:bg-surface-muted"
          )}
        >
          <span className="min-w-0 truncate">{p.label}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-foreground-muted">
            {changed(p) && <span className="size-2 rounded-full bg-warning" aria-label="Not saved yet" />}
            {listOf(p).length}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {header}

      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="p-3">
          <ul aria-label="Kinds of person" className="space-y-0.5">
            {people.map(row)}
          </ul>
          <p className="mt-3 border-t border-border px-3 pb-1 pt-3 text-body-label text-foreground-muted">Staff</p>
          <ul aria-label="Kinds of staff" className="mt-1 space-y-0.5">
            {staff.map(row)}
          </ul>
        </Card>

        {picked && (
          <Card className="overflow-hidden" aria-label={`What ${picked.label} may do`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-deep">
                  <ShieldCheck className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-section-heading">{picked.label}</h2>
                  <p className="text-caption-subtle">The school admin and the principal can always do everything.</p>
                </div>
              </div>
              {canChange && (
                <div className="flex items-center gap-2">
                  {(!picked.isDefault || changed(picked)) && (
                    <Button variant="ghost" onClick={backToUsual} loading={resetting} disabled={saving}>
                      <RotateCcw className="size-4" aria-hidden />
                      Back to the usual list
                    </Button>
                  )}
                  <Button onClick={saveIt} loading={saving} disabled={!changed(picked) || resetting}>
                    <Check className="size-4" aria-hidden />
                    Save
                  </Button>
                </div>
              )}
            </div>

            <div className="divide-y divide-border">
              {groups.map((group) => (
                <fieldset key={group.key} className="px-5 py-4">
                  <legend className="mb-2 text-body-label font-semibold text-foreground">{group.label}</legend>
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const ticked = listOf(picked).includes(item.key);
                      return (
                        <li key={item.key}>
                          <label className={cn("flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm", canChange ? "cursor-pointer hover:bg-surface-muted" : "cursor-default")}>
                            <input
                              type="checkbox"
                              checked={ticked}
                              disabled={!canChange}
                              onChange={(e) => set(item.key, e.target.checked)}
                              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--color-primary)]"
                            />
                            <span className="text-foreground">{item.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
