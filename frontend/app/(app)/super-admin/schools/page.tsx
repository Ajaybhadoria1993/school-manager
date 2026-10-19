"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Plus, RefreshCw, Search } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { STATUS_META, STATUS_ORDER, timeAgo } from "@/lib/status";
import { cn, formatDate } from "@/lib/utils";
import { usePending } from "@/components/layout/PendingProvider";
import { InviteSchoolModal } from "@/components/tenants/InviteSchoolModal";
import { StatusBadge } from "@/components/tenants/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast-context";
import type { ApiResponse, ApprovalStatus, InviteDelivery, TenantListItem } from "@/types";

/** A suspended school is an approved one that was switched off; it gets its own tab instead of staying under Approved. */
type Stage = ApprovalStatus | "suspended";
type Tab = "all" | Stage;

const stageOf = (s: TenantListItem): Stage => (s.isActive ? s.approvalStatus : "suspended");

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  ...STATUS_ORDER.map((s) => ({ key: s as Tab, label: STATUS_META[s].label })),
  { key: "suspended", label: "Suspended" },
];

function isTab(value: string | null): value is Tab {
  return value === "all" || value === "suspended" || STATUS_ORDER.includes(value as ApprovalStatus);
}

function InviteNote({ school, now }: { school: TenantListItem; now: number }) {
  if (school.approvalStatus === "invited" && school.inviteExpiresAt) {
    const expired = new Date(school.inviteExpiresAt).getTime() <= now;
    return expired ? (
      <Badge tone="danger">Link expired</Badge>
    ) : (
      <span className="whitespace-nowrap text-xs text-foreground-muted">Link valid until {formatDate(school.inviteExpiresAt)}</span>
    );
  }
  if (school.submittedAt) return <span className="whitespace-nowrap text-xs text-foreground-muted">Submitted {timeAgo(school.submittedAt, now)}</span>;
  return <span className="whitespace-nowrap text-xs text-foreground-muted">{school.source === "signup" ? "Registered itself" : "Invited by you"}</span>;
}

function SchoolsList() {
  const { push } = useToast();
  const { refresh: refreshPending } = usePending();
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("status");
  const tab: Tab = isTab(fromUrl) ? fromUrl : "all";

  const [schools, setSchools] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<{ school: string; url: string } | null>(null);

  const reload = () => {
    setReloadKey((k) => k + 1);
    refreshPending();
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiResponse<TenantListItem[]>>("/tenants")
      .then((res) => {
        if (cancelled) return;
        setSchools(res.data);
        setNow(Date.now());
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiRequestError ? err.message : "Could not load schools.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: schools.length };
    for (const s of schools) c[stageOf(s)] = (c[stageOf(s)] ?? 0) + 1;
    return c;
  }, [schools]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = schools.filter(
      (s) =>
        (tab === "all" || stageOf(s) === tab) &&
        (!q || s.name.toLowerCase().includes(q) || s.contactEmail.toLowerCase().includes(q) || (s.adminName ?? "").toLowerCase().includes(q))
    );
    // Schools waiting for a decision come first (longest waiting at the top), then newest.
    return rows.sort((a, b) => {
      if (a.approvalStatus === "pending" && b.approvalStatus === "pending") {
        return new Date(a.submittedAt ?? a.createdAt).getTime() - new Date(b.submittedAt ?? b.createdAt).getTime();
      }
      if (a.approvalStatus === "pending") return -1;
      if (b.approvalStatus === "pending") return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [schools, tab, search]);

  function selectTab(next: Tab) {
    router.replace(next === "all" ? "/super-admin/schools" : `/super-admin/schools?status=${next}`, { scroll: false });
  }

  async function resend(school: TenantListItem) {
    setResending(school.id);
    setDevLink(null);
    try {
      const res = await api.post<ApiResponse<InviteDelivery>>(`/tenants/${school.id}/resend-invite`);
      if (res.data.emailSent) push("success", `Invitation sent again to ${school.contactEmail}`);
      else push("error", "The email could not be sent. Try again in a moment.");
      if (res.data.devInviteLink) setDevLink({ school: school.name, url: res.data.devInviteLink });
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Could not resend the invitation.");
    } finally {
      setResending(null);
      reload();
    }
  }

  function rowAction(s: TenantListItem) {
    if (s.approvalStatus === "invited") {
      return (
        <Button size="sm" variant="outline" loading={resending === s.id} onClick={() => resend(s)}>
          <RefreshCw className="size-3.5" aria-hidden />
          Resend invite
        </Button>
      );
    }
    return (
      <Link href={`/super-admin/schools/${s.id}`}>
        <Button size="sm" variant={s.approvalStatus === "pending" ? "primary" : "outline"}>
          {s.approvalStatus === "pending" ? "Review" : "View"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Schools"
        description="Follow every school from invitation to approval."
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Invite school
          </Button>
        }
      />

      {devLink && (
        <div role="status" className="space-y-1 rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm">
          <p className="text-foreground-muted">
            Email is not configured, so nothing was sent. Invitation link for <strong>{devLink.school}</strong>:
          </p>
          <p className="break-all font-mono text-xs text-foreground">{devLink.url}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by status">
          {TABS.map((t) => {
            const highlight = t.key === "pending" && (counts.pending ?? 0) > 0;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => selectTab(t.key)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : highlight
                      ? "bg-warning-soft text-warning hover:opacity-80"
                      : "bg-surface-muted text-foreground-muted hover:text-foreground"
                )}
              >
                {t.label} <span className="opacity-70">{counts[t.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search school, admin or email"
            aria-label="Search schools"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <Card className="space-y-3 p-5" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </Card>
      ) : loadError ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{loadError}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              reload();
            }}
          >
            Try again
          </Button>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title={schools.length === 0 ? "No schools yet" : "No schools match"}
            description={
              schools.length === 0
                ? "Invite your first school, or share the registration link from the dashboard."
                : "Try another status or a different search."
            }
          />
        </Card>
      ) : (
        <>
          {/* Wide screens: a table. */}
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Tr>
                  <Th>School</Th>
                  <Th>Administrator</Th>
                  <Th>Status</Th>
                  <Th>Progress</Th>
                  <Th>Added</Th>
                  <Th className="text-right">Action</Th>
                </Tr>
              </Thead>
              <tbody className="bg-surface">
                {visible.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary xl:flex">
                          <Building2 className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0 max-w-[14rem]">
                          <p className="truncate font-semibold">{s.name}</p>
                          <p className="truncate text-xs text-foreground-muted">{s.source === "signup" ? "Self registered" : "Invited"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="max-w-[15rem]">
                        <p className="truncate">{s.adminName ?? <span className="text-foreground-muted">Not set up yet</span>}</p>
                        <p className="truncate text-xs text-foreground-muted" title={s.adminEmail ?? s.contactEmail}>
                          {s.adminEmail ?? s.contactEmail}
                        </p>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={s.approvalStatus} suspended={!s.isActive} />
                        {s.resubmittedCount > 0 && <Badge tone="info">Resubmitted</Badge>}
                      </div>
                    </Td>
                    <Td>
                      <InviteNote school={s} now={now} />
                    </Td>
                    <Td className="whitespace-nowrap text-foreground-muted">{formatDate(s.createdAt)}</Td>
                    <Td className="text-right">{rowAction(s)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* Phones: a card per school. */}
          <ul className="space-y-3 md:hidden">
            {visible.map((s) => (
              <li key={s.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.name}</p>
                      <p className="truncate text-xs text-foreground-muted">{s.adminEmail ?? s.contactEmail}</p>
                    </div>
                    <StatusBadge status={s.approvalStatus} suspended={!s.isActive} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <InviteNote school={s} now={now} />
                    {rowAction(s)}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <InviteSchoolModal open={modalOpen} onClose={() => setModalOpen(false)} onInvited={reload} />
    </div>
  );
}

export default function SchoolsPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <SchoolsList />
    </Suspense>
  );
}
