"use client";

import { useEffect, useState } from "react";
import { Plus, Mail, Phone, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { StaffFormModal } from "@/components/staff/StaffFormModal";
import { CreateLoginModal } from "@/components/users/CreateLoginModal";
import type { ApiResponse, Staff, UserAccount } from "@/types";

const CAN_MANAGE_LOGINS = ["super_admin", "school_admin"];

export default function StaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [linkedStaffIds, setLinkedStaffIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<Staff | null>(null);

  async function load() {
    setLoading(true);
    const [staffRes, usersRes] = await Promise.all([
      api.get<ApiResponse<Staff[]>>("/staff", { category: category || undefined }),
      api.get<ApiResponse<UserAccount[]>>("/users", { role: "teacher" }),
    ]);
    setStaff(staffRes.data);
    setLinkedStaffIds(
      new Set(
        usersRes.data
          .map((u) => (typeof u.staffProfileId === "string" ? u.staffProfileId : u.staffProfileId?._id))
          .filter((id): id is string => Boolean(id))
      )
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const canManageLogins = !!user && CAN_MANAGE_LOGINS.includes(user.role);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Staff Directory</h2>
          <p className="text-sm text-foreground-muted">Teaching, admin, transport and support staff.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="size-4" />
          Add Staff
        </Button>
      </div>

      <Select className="sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">All categories</option>
        <option value="teaching">Teaching</option>
        <option value="admin">Admin</option>
        <option value="transport">Transport</option>
        <option value="support">Support</option>
      </Select>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading staff…</div>
        ) : staff.length === 0 ? (
          <EmptyState title="No staff members found" description="Add your first staff member to get started." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Employee ID</Th>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th>Designation</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Login</Th>
              </Tr>
            </Thead>
            <tbody>
              {staff.map((s) => (
                <Tr key={s._id}>
                  <Td className="font-mono text-xs">{s.employeeId}</Td>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>
                    <Badge tone="primary" className="capitalize">
                      {s.category}
                    </Badge>
                  </Td>
                  <Td>{s.designation}</Td>
                  <Td>
                    <div className="flex flex-col gap-0.5 text-xs text-foreground-muted">
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5" /> {s.phone}
                      </span>
                      {s.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5" /> {s.email}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>
                    {s.category !== "teaching" ? (
                      <span className="text-xs text-foreground-muted">—</span>
                    ) : linkedStaffIds.has(s._id) ? (
                      <Badge tone="success">Has login</Badge>
                    ) : canManageLogins ? (
                      <Button size="sm" variant="outline" onClick={() => setLoginTarget(s)}>
                        <KeyRound className="size-3.5" />
                        Create Login
                      </Button>
                    ) : (
                      <Badge tone="neutral">No login</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <StaffFormModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => load()} />
      <CreateLoginModal
        open={!!loginTarget}
        onClose={() => setLoginTarget(null)}
        onCreated={load}
        presetRole="teacher"
        presetStaffId={loginTarget?._id}
        presetName={loginTarget?.name}
        presetPhone={loginTarget?.phone}
      />
    </div>
  );
}
