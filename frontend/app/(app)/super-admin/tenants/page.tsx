"use client";

import { useEffect, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { OnboardTenantModal } from "@/components/tenants/OnboardTenantModal";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Tenant } from "@/types";

export default function TenantsPage() {
  const { push } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<Tenant[]>>("/tenants");
    setTenants(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(tenant: Tenant) {
    try {
      await api.patch(`/tenants/${tenant._id}`, { isActive: !tenant.isActive });
      push("success", `${tenant.name} ${tenant.isActive ? "deactivated" : "activated"}`);
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to update tenant");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">School Tenants</h2>
          <p className="text-sm text-foreground-muted">Onboard schools and manage subscription tiers.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="size-4" />
          Onboard School
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading tenants…</div>
        ) : tenants.length === 0 ? (
          <EmptyState
            title="No schools onboarded yet"
            description="Onboard your first school to create its trust, branch and admin login."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>School / Trust</Th>
                <Th>Tier</Th>
                <Th>Status</Th>
                <Th>Onboarded</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <tbody>
              {tenants.map((t) => (
                <Tr key={t._id}>
                  <Td className="font-medium">
                    <span className="flex items-center gap-2">
                      <Building2 className="size-4 text-foreground-muted" />
                      {t.name}
                    </span>
                    <p className="ml-6 text-xs text-foreground-muted">{t.contactEmail}</p>
                  </Td>
                  <Td>
                    <Badge tone="primary" className="capitalize">
                      {t.subscriptionTier}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={t.isActive ? "success" : "danger"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>{formatDate(t.createdAt)}</Td>
                  <Td>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(t)}>
                      {t.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <OnboardTenantModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => load()} />
    </div>
  );
}
