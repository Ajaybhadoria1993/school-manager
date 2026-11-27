import { useEffect, useMemo, useRef, useState } from "react";
import {
  Backpack,
  BookOpenText,
  Bus,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarMinus,
  Check,
  ClipboardList,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  MailCheck,
  Plus,
  RotateCcw,
  School,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { AppModal } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { useAuth } from "../../hooks/useAuth";
import { useCreateRoleMutation, useDeleteRoleMutation, useGetPermissionsQuery, useResetPermissionsMutation, useSavePermissionsMutation } from "../../redux/api/permissionsApi";
import type { PermissionGroup, PermissionProfile } from "../../types";
import { cn } from "../../utils/helpers";
import { getApiError } from "../../utils/apiErrors";
import { sameList, toggled } from "../../utils/permissions";

/** The drafts without one kind. */
const without = (drafts: Record<string, string[]>, key: string) => Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== key));

/** Each group's icon, the same as its page's in the menu where it has one. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  students: Backpack,
  teachers: UsersRound,
  staff: UserCog,
  attendance: CalendarCheck2,
  leaves: MailCheck,
  staffleaves: CalendarMinus,
  classwork: BookOpenText,
  exams: ClipboardList,
  timetable: CalendarClock,
  school: School,
  transport: Bus,
  fees: Wallet,
  documents: FileText,
  calendar: CalendarDays,
  child: HeartHandshake,
};

/** Who a kind of person is (2026-11-26): the class teacher's list works in their own class only, on top of every teacher's. */
function whoFor(p: PermissionProfile): string {
  // A staff member marked Also a teacher signs in as a teacher and has their role's list too (2026-11-26).
  if (p.key === "teacher") return "Every teacher, in the classes and subjects they teach. Staff who also teach get it too, with their role's list.";
  if (p.key === "class_teacher") return "A class teacher, in their own class only, on top of what every teacher may do.";
  if (p.kind === "parent") return "Every parent, for their own children only.";
  if (p.key === "other") return "Every role you named that has no list of its own.";
  if (p.people === 0) return "Nobody has this role yet: choose it in Add staff.";
  if (p.people !== undefined) return `Everyone added as ${p.label} (${p.people} of the staff).`;
  return `Everyone added as ${p.label}.`;
}

/** A role's name as the server keeps it: spaces made one. */
const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
/** The longest role name (the server's MAX_ROLE_OTHER). */
const MAX_ROLE_NAME = 40;

/** A role the school named itself (Add staff > Other: "Sports coach"): a kind of its own, following Other roles until it has its own list. */
const isNamedRole = (p: PermissionProfile) => p.key.startsWith("other:");

/**
 * Permissions (`/permissions`): what each kind of person of the school (Teacher, Class teacher, Parent, a Receptionist, a Librarian...) may do,
 * chosen with checkboxes. The school admin and the principal can always do everything. A kind is picked on the left (with how many of what can
 * be given to it it has), its boxes are on the right, one box per part of the app (2026-11-26, user: "clearly samajh aaye kis role ko kya feature
 * assign kar raha hoon"), each with its count and an **All** tick. Save keeps them: that person's menu and pages follow it the next time they
 * open the app. A box that needs another ticks it (adding students needs seeing them). "Back to the usual list" is what the kind could do
 * before the school chose.
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
  // New role (2026-11-26): the window with the name, and its error; Delete role's question.
  const [making, setMaking] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createRole, createState] = useCreateRoleMutation();
  const [deleteRole, deleteState] = useDeleteRoleMutation();

  const profiles = useMemo(() => data?.profiles ?? [], [data]);
  const picked = profiles.find((p) => p.key === pickedKey) ?? profiles[0];
  useEffect(() => {
    if (!pickedKey && profiles[0]) setPickedKey(profiles[0].key);
  }, [pickedKey, profiles]);

  const listOf = (p: PermissionProfile) => drafts[p.key] ?? p.permissions;
  const changed = (p: PermissionProfile) => drafts[p.key] !== undefined && !sameList(drafts[p.key], p.permissions);
  /** How many of what can be given to the kind it has. */
  const countOf = (p: PermissionProfile) => listOf(p).filter((k) => p.offered.includes(k)).length;

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

  /** Ticks or clears some boxes of the picked kind, each with what it needs (on) or what needs it (off). */
  const set = (keys: readonly string[], on: boolean) => {
    if (!picked || !canChange) return;
    setDrafts((d) => ({ ...d, [picked.key]: keys.reduce((list, key) => toggled(list, key, on), d[picked.key] ?? picked.permissions) }));
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
      push("success", isNamedRole(picked) ? `${picked.label}: same as Other roles again.` : `${picked.label}: back to the usual list.`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not change it. Please try again.");
    }
  }

  const closeNew = () => {
    setMaking(false);
    setNewName("");
    setNameError(null);
  };

  /** Makes the role and opens it: every staff permission to tick. */
  async function makeRole() {
    const name = cleanName(newName);
    if (name.length < 2) return setNameError("Write the role's name");
    try {
      const made = (await createRole({ name }).unwrap()).data;
      closeNew();
      setPickedKey(made.key);
      push("success", `${made.label}: made. Tick what it may do, then Save.`);
    } catch (err) {
      const problem = getApiError(err);
      const detail = Array.isArray(problem?.details) ? (problem.details[0] as { message?: string } | undefined)?.message : undefined;
      setNameError((problem?.code === "VALIDATION_ERROR" && detail) || problem?.message || "Could not make the role. Please try again.");
    }
  }

  async function deleteIt() {
    if (!picked) return;
    try {
      await deleteRole(picked.key).unwrap();
      setDrafts((d) => without(d, picked.key));
      setPickedKey(null);
      push("success", `${picked.label}: deleted.`);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not delete the role. Please try again.");
    }
    setDeleting(false);
  }

  const people = profiles.filter((p) => p.kind !== "staff");
  const staff = profiles.filter((p) => p.kind === "staff" && !isNamedRole(p));
  const named = profiles.filter(isNamedRole);
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
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal tabular-nums text-foreground-muted">
            {changed(p) && <span className="size-2 rounded-full bg-warning" aria-label="Not saved yet" />}
            <span>
              {countOf(p)}/{p.offered.length}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {header}

      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="p-3 lg:sticky lg:top-4">
          <ul aria-label="Kinds of person" className="space-y-0.5">
            {people.map(row)}
          </ul>
          <p className="mt-3 border-t border-border px-3 pb-1 pt-3 text-body-label text-foreground-muted">Staff</p>
          <ul aria-label="Kinds of staff" className="mt-1 space-y-0.5">
            {staff.map(row)}
          </ul>
          {(named.length > 0 || canChange) && (
            <>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border px-3 pb-1 pt-3">
                <p className="text-body-label text-foreground-muted">Roles you named</p>
                {canChange && (
                  <Button size="sm" variant="ghost" onClick={() => setMaking(true)}>
                    <Plus className="size-4" aria-hidden />
                    New role
                  </Button>
                )}
              </div>
              {named.length > 0 && (
                <ul aria-label="Roles you named" className="mt-1 space-y-0.5">
                  {named.map(row)}
                </ul>
              )}
            </>
          )}
          <p className="mt-3 border-t border-border px-3 pt-3 text-caption-subtle">School admin and Principal: everything, always.</p>
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
                  <p className="text-caption-subtle">{whoFor(picked)}</p>
                </div>
              </div>
              {canChange && (
                <div className="flex items-center gap-2">
                  {/* A role the school made and nobody has (2026-11-26). */}
                  {picked.custom && picked.people === 0 && (
                    <Button variant="ghost" onClick={() => setDeleting(true)} disabled={saving || resetting}>
                      <Trash2 className="size-4" aria-hidden />
                      Delete role
                    </Button>
                  )}
                  {(!picked.isDefault || changed(picked)) && (
                    <Button variant="ghost" onClick={backToUsual} loading={resetting} disabled={saving}>
                      <RotateCcw className="size-4" aria-hidden />
                      {isNamedRole(picked) ? "Same as Other roles" : "Back to the usual list"}
                    </Button>
                  )}
                  <Button onClick={saveIt} loading={saving} disabled={!changed(picked) || resetting}>
                    <Check className="size-4" aria-hidden />
                    Save
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-2">
              {groups.map((group) => (
                <GroupBox key={group.key} group={group} ticked={listOf(picked)} canChange={canChange} onSet={set} />
              ))}
            </div>
          </Card>
        )}
      </div>

      {making && (
        <AppModal
          title="New role"
          icon={Plus}
          busy={createState.isLoading}
          onClose={closeNew}
          footer={
            <>
              <HeroButton variant="secondary" onPress={closeNew} isDisabled={createState.isLoading}>
                Cancel
              </HeroButton>
              <HeroButton variant="primary" isPending={createState.isLoading} onPress={() => void makeRole()}>
                Make the role
              </HeroButton>
            </>
          }
        >
          <Field id="new-role-name" label="Role name" error={nameError ?? undefined}>
            <Input
              id="new-role-name"
              value={newName}
              maxLength={MAX_ROLE_NAME}
              autoComplete="off"
              autoFocus
              placeholder="For example Sports coach"
              aria-invalid={nameError ? true : undefined}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void makeRole();
                }
              }}
            />
          </Field>
        </AppModal>
      )}

      {deleting && picked && (
        <AppModal
          title={`Delete the role ${picked.label}?`}
          icon={Trash2}
          tone="danger"
          busy={deleteState.isLoading}
          onClose={() => setDeleting(false)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setDeleting(false)} isDisabled={deleteState.isLoading}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={deleteState.isLoading} onPress={() => void deleteIt()}>
                Delete
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">It goes from Add staff's Role list, with what it may do.</p>
        </AppModal>
      )}
    </div>
  );
}

/** One part of the app for the picked kind: its icon and name, how many of its boxes are ticked, All, and its boxes. */
function GroupBox({ group, ticked, canChange, onSet }: { group: PermissionGroup; ticked: readonly string[]; canChange: boolean; onSet: (keys: readonly string[], on: boolean) => void }) {
  const Icon = GROUP_ICONS[group.key] ?? ShieldCheck;
  const keys = group.items.map((i) => i.key);
  const count = keys.filter((k) => ticked.includes(k)).length;
  const all = count === keys.length;
  const allRef = useRef<HTMLInputElement>(null);
  // Some but not all: the All box shows a dash.
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && !all;
  }, [count, all]);

  return (
    <fieldset aria-label={group.label} className={cn("rounded-xl border px-4 pb-3 pt-3", count > 0 ? "border-primary/30 bg-primary-soft/30" : "border-border")}>
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-border/70 pb-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", count > 0 ? "bg-primary-soft text-primary-deep" : "bg-surface-muted text-foreground-muted")}>
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{group.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-xs font-semibold tabular-nums text-foreground-muted">
            {count}/{keys.length}
          </span>
          {keys.length > 1 && (
            <label className={cn("flex items-center gap-1.5 text-xs font-semibold text-foreground-muted", canChange ? "cursor-pointer" : "cursor-default")}>
              <input
                ref={allRef}
                type="checkbox"
                aria-label={`All of ${group.label}`}
                checked={all}
                disabled={!canChange}
                onChange={(e) => onSet(keys, e.target.checked)}
                className="size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--color-primary)]"
              />
              All
            </label>
          )}
        </span>
      </div>
      <ul className="space-y-0.5">
        {group.items.map((item) => (
          <li key={item.key}>
            <label className={cn("flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm", canChange ? "cursor-pointer hover:bg-surface-muted" : "cursor-default")}>
              <input
                type="checkbox"
                checked={ticked.includes(item.key)}
                disabled={!canChange}
                onChange={(e) => onSet([item.key], e.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--color-primary)]"
              />
              <span className="text-foreground">{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
