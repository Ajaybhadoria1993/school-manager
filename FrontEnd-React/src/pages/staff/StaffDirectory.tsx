import { useState } from "react";
import { Link } from "react-router";
import { AtSign, KeyRound, Pencil, Plus, Power, RotateCcw, Search, Trash2, UserCog, UserRoundCog } from "lucide-react";
import { STAFF_ROLES, staffRoleLabel } from "../../constants/staffMembers";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import {
  useChangeStaffUsernameMutation,
  useGetStaffMembersQuery,
  useMakeStaffLoginMutation,
  useRemoveStaffMemberMutation,
  useResetStaffPasswordMutation,
  useUpdateStaffMemberMutation,
} from "../../redux/api/staffApi";
import type { StaffMember, StaffMemberQuery, StaffMemberStatus } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { formatMobile } from "../../utils/students";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { ChangeUsernameDialog, MakeLoginDialog, NewPasswordDialog } from "../../components/logins/LoginDialogs";
import { StudentAvatar } from "../../components/students/StudentAvatar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { useResultModal } from "../../components/ui/ResultModal";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const ALL_ROLES = "all";
/** "invited" is a person added before the school made logins itself: they have no login until the school makes one. */
const TABS: { value: StaffMemberStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "invited", label: "No login" },
  { value: "inactive", label: "Inactive" },
];
const PILL: Record<StaffMemberStatus, { tone: "success" | "warning" | "neutral"; label: string }> = {
  active: { tone: "success", label: "Active" },
  invited: { tone: "warning", label: "No login" },
  inactive: { tone: "neutral", label: "Inactive" },
};
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-all duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const TH = "whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";

/**
 * Staff (`/staff`, the menu's Staff): the people who work for the school without teaching, each with a role (Principal, Accountant,
 * Receptionist, Management...). The school adds a person with their details, a role and the username and password it makes for them
 * (Add staff): they sign in with those (there is no invitation email for staff). Here: everyone, by status (Active, No login, Inactive)
 * with the count of each, a role and a search (one request each, answered by the server), the username each signs in with, and for
 * each person what can be done: change them, change their username, give a new password, make them inactive (their login closes) or
 * active again; a person with no login yet (added before the school made logins itself) gets Make a login or is removed. The No login
 * tab is there only while somebody has none. Every action ends in a window that says what happened.
 */
export default function StaffDirectoryPage() {
  // A year that is over is only looked at: no adding, changing, logins or making inactive (the server refuses them too).
  const readOnly = useReadOnlyYear();
  const [status, setStatus] = useState<StaffMemberStatus | "all">("all");
  const [role, setRole] = useState(ALL_ROLES);
  const [search, setSearch] = useState("");
  const typed = useDebouncedValue(search.trim(), 300);
  const query: StaffMemberQuery = { status, ...(role !== ALL_ROLES ? { role: role as StaffMemberQuery["role"] } : {}), ...(typed ? { search: typed } : {}) };
  const res = useGetStaffMembersQuery(query);
  const [removeMember] = useRemoveStaffMemberMutation();
  const [update] = useUpdateStaffMemberMutation();
  const [makeLogin] = useMakeStaffLoginMutation();
  const [resetPassword] = useResetStaffPasswordMutation();
  const [rename] = useChangeStaffUsernameMutation();
  const result = useResultModal();
  const { push } = useToast();
  const [asking, setAsking] = useState<{ kind: "remove" | "off"; member: StaffMember } | null>(null);
  const [dialog, setDialog] = useState<{ kind: "make" | "password" | "username"; member: StaffMember } | null>(null);

  const items = res.data?.data.items ?? [];
  const counts = res.data?.data.counts;
  const total = counts ? counts.active + counts.invited + counts.inactive : null;
  const filtered = status !== "all" || role !== ALL_ROLES || typed !== "";
  // The No login tab is for the few added before logins were made with the person: it is there while there are any (or it is the one open).
  const tabs = TABS.filter((t) => t.value !== "invited" || (counts?.invited ?? 0) > 0 || status === "invited");

  async function turn(m: StaffMember, on: boolean) {
    try {
      await update({ id: m.id, isActive: on }).unwrap();
      result.done(on ? `${m.name} is active again` : `${m.name} is inactive`, on ? "They can sign in again with their username and password." : "Their login is closed: they cannot sign in until they are made active again.");
    } catch (err) {
      result.failed(on ? "Not made active" : "Not made inactive", getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  async function remove(m: StaffMember) {
    try {
      await removeMember(m.id).unwrap();
      result.done(`${m.name} is removed`, `${m.name} had no login and is taken off the list. You can add them again later.`);
    } catch (err) {
      result.failed("Not removed", getApiError(err)?.message ?? "Could not remove them. Please try again.");
    }
  }

  const add = (
    <Link to="/staff/new" className={primaryLink}>
      <Plus className="size-4" aria-hidden />
      Add staff
    </Link>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Staff" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={readOnly ? undefined : add} />

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Which staff to show" className="flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              onClick={() => setStatus(t.value)}
              className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors", status === t.value ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:text-foreground")}
            >
              {/* The space keeps the name read out as "No login 2", not "No login2". */}
              {t.label}{" "}
              <span className="rounded-full bg-surface-muted px-1.5 text-xs text-foreground-muted">{counts ? (t.value === "all" ? total : counts[t.value]) : 0}</span>
            </button>
          ))}
        </div>
        <div className="w-44">
          <span id="staff-role-filter-label" className="sr-only">
            Role
          </span>
          <Select id="staff-role-filter" value={role} options={[{ value: ALL_ROLES, label: "All roles" }, ...STAFF_ROLES.map((r) => ({ value: r.key, label: r.label }))]} onChange={setRole} />
        </div>
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <Input aria-label="Search staff" placeholder="Search by name, username or mobile" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {res.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : res.error && !res.data ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the staff."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        filtered ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-muted">No staff matches.</p>
        ) : (
          <StudentsNotice icon={UserCog} tone="primary" title="No staff yet" actions={readOnly ? undefined : add}>
            <p>Add the people who work for your school without teaching, such as a receptionist or the management. You make a username and a password for each.</p>
          </StudentsNotice>
        )
      ) : (
        <Card className="relative overflow-x-auto">
          <table aria-label="Staff" className="w-full min-w-[60rem] border-collapse text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th scope="col" className={TH}>
                  Name
                </th>
                <th scope="col" className={TH}>
                  Role
                </th>
                <th scope="col" className={TH}>
                  Mobile
                </th>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-surface-muted align-middle first:border-t-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <StudentAvatar name={m.name} seed={m.id} size="sm" className={cn(m.status === "inactive" && "opacity-60 grayscale")} />
                      <div className="min-w-0">
                        <Link to={`/staff/${m.id}/edit`} className="block truncate font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                          {m.name}
                        </Link>
                        {m.login && (
                          <span className="flex items-center gap-1 text-xs text-foreground-muted">
                            <KeyRound className="size-3" aria-hidden />
                            <span className="font-mono">{m.login.username}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="primary">{staffRoleLabel(m.role, m.roleOther)}</Badge>
                      {m.alsoTeacher && <Badge tone="success">Teaches</Badge>}
                    </div>
                    {m.designation && <span className="mt-0.5 block text-xs text-foreground-muted">{m.designation}</span>}
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">{m.mobile ? formatMobile(m.mobile) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={PILL[m.status].tone} className="gap-1.5 whitespace-nowrap">
                      <span aria-hidden className="size-1.5 rounded-full bg-current" />
                      {PILL[m.status].label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className={readOnly ? "hidden" : "flex flex-wrap justify-end gap-1.5"}>
                      <Link
                        to={`/staff/${m.id}/edit`}
                        aria-label={`Change ${m.name}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg px-2.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Link>
                      {m.login ? (
                        <>
                          <Button variant="outline" size="sm" aria-label={`Change the username of ${m.name}`} onClick={() => setDialog({ kind: "username", member: m })}>
                            <AtSign className="size-4" aria-hidden />
                            Username
                          </Button>
                          <Button variant="outline" size="sm" aria-label={`New password for ${m.name}`} onClick={() => setDialog({ kind: "password", member: m })}>
                            <KeyRound className="size-4" aria-hidden />
                            New password
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" aria-label={`Make a login for ${m.name}`} onClick={() => setDialog({ kind: "make", member: m })}>
                            <UserRoundCog className="size-4" aria-hidden />
                            Make a login
                          </Button>
                          <Button variant="ghost" size="sm" aria-label={`Remove ${m.name}`} onClick={() => setAsking({ kind: "remove", member: m })}>
                            <Trash2 className="size-4" aria-hidden />
                            Remove
                          </Button>
                        </>
                      )}
                      {m.login && m.status === "active" && (
                        <Button variant="outline" size="sm" aria-label={`Make ${m.name} inactive`} onClick={() => setAsking({ kind: "off", member: m })}>
                          <Power className="size-4" aria-hidden />
                          Make inactive
                        </Button>
                      )}
                      {m.login && m.status === "inactive" && (
                        <Button variant="outline" size="sm" aria-label={`Make ${m.name} active`} onClick={() => void turn(m, true)}>
                          <RotateCcw className="size-4" aria-hidden />
                          Make active
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {asking && (
        <ConfirmModal
          title={asking.kind === "remove" ? `Remove ${asking.member.name}?` : `Make ${asking.member.name} inactive?`}
          confirmLabel={asking.kind === "remove" ? "Remove" : "Make inactive"}
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            const { kind, member } = asking;
            setAsking(null);
            await (kind === "remove" ? remove(member) : turn(member, false));
          }}
        >
          <p>
            {asking.kind === "remove"
              ? `${asking.member.name} has no login. They are taken off the list; you can add them again later.`
              : "Their login is closed at once: they cannot sign in until you make them active again. Nothing they did is lost."}
          </p>
        </ConfirmModal>
      )}
      {dialog?.kind === "make" && (
        <MakeLoginDialog
          name={dialog.member.name}
          onCreate={async (username, password) => (await makeLogin({ id: dialog.member.id, username, password }).unwrap()).data.login?.username ?? username}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "password" && dialog.member.login && (
        <NewPasswordDialog
          name={dialog.member.name}
          username={dialog.member.login.username}
          onSave={async (password) => void (await resetPassword({ id: dialog.member.id, password }).unwrap())}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "username" && dialog.member.login && (
        <ChangeUsernameDialog
          name={dialog.member.name}
          current={dialog.member.login.username}
          onSave={async (username) => {
            await rename({ id: dialog.member.id, username }).unwrap();
            push("success", `${dialog.member.name}'s username is ${username}`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {result.modal}
    </div>
  );
}
