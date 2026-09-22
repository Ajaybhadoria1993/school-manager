"use client";

import { useEffect, useState } from "react";
import { Plus, Power, PowerOff } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { CreateLoginModal } from "@/components/users/CreateLoginModal";
import { ROLE_LABELS } from "@/components/layout/nav-config";
import type { ApiResponse, UserAccount, UserRole } from "@/types";

const CAN_MANAGE = ["super_admin", "school_admin"];

function linkedProfileLabel(user: UserAccount): string | null {
  if (user.staffProfileId && typeof user.staffProfileId !== "string") return user.staffProfileId.name;
  if (user.guardianProfileId && typeof user.guardianProfileId !== "string") return user.guardianProfileId.name;
  if (user.studentProfileId && typeof user.studentProfileId !== "string") {
    return `${user.studentProfileId.firstName} ${user.studentProfileId.lastName}`;
  }
  return null;
}

export default function UsersPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [role, setRole] = useState<UserRole | "">("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = !!user && CAN_MANAGE.includes(user.role);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<UserAccount[]>>("/users", { role: role || undefined });
    setUsers(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function toggleActive(target: UserAccount) {
    setBusyId(target._id);
    try {
      await api.patch(`/users/${target._id}/${target.isActive ? "deactivate" : "reactivate"}`, {});
      push("success", `${target.name} ${target.isActive ? "deactivated" : "reactivated"}`);
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to update user");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Users &amp; Logins</h2>
          <p className="text-sm text-foreground-muted">
            Create login accounts for Principal, Accountant, Teachers and Parents.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="size-4" />
            Create Login
          </Button>
        )}
      </div>

      <Select className="sm:w-56" value={role} onChange={(e) => setRole(e.target.value as UserRole | "")}>
        <option value="">All roles</option>
        <option value="school_admin">School Admin</option>
        <option value="principal">Principal</option>
        <option value="accountant">Accountant</option>
        <option value="teacher">Teacher</option>
        <option value="parent">Parent</option>
      </Select>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading…</div>
        ) : users.length === 0 ? (
          <EmptyState title="No users found" description="Create a login to get started." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Linked Profile</Th>
                <Th>Status</Th>
                {canManage && <Th></Th>}
              </Tr>
            </Thead>
            <tbody>
              {users.map((u) => (
                <Tr key={u._id}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-foreground-muted">{u.email}</Td>
                  <Td>
                    <Badge tone="primary">{ROLE_LABELS[u.role]}</Badge>
                  </Td>
                  <Td className="text-foreground-muted">{linkedProfileLabel(u) ?? "—"}</Td>
                  <Td>
                    <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                  </Td>
                  {canManage && (
                    <Td>
                      <Button size="sm" variant="ghost" loading={busyId === u._id} onClick={() => toggleActive(u)}>
                        {u.isActive ? <PowerOff className="size-3.5 text-danger" /> : <Power className="size-3.5 text-success" />}
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <CreateLoginModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} />
    </div>
  );
}
