"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Check,
  Clock3,
  Copy,
  Hourglass,
  Link2,
  PartyPopper,
  Plus,
  Send,
  Settings2,
} from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { STATUS_META, STATUS_ORDER, timeAgo } from "@/lib/status";
import { cn } from "@/lib/utils";
import { usePending } from "@/components/layout/PendingProvider";
import { InviteSchoolModal } from "@/components/tenants/InviteSchoolModal";
import { StatusBadge } from "@/components/tenants/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/toast-context";
import type {
  ApiResponse,
  ApprovalStatus,
  SchoolOverview,
  TenantListItem,
} from "@/types";

const SEGMENT_COLOR: Record<ApprovalStatus, string> = {
  invited: "bg-foreground-muted/40",
  onboarding: "bg-info",
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-danger",
};

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function SchoolRow({
  school,
  now,
  action,
}: {
  school: TenantListItem;
  now: number;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Building2 className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {school.name}
        </p>
        <p className="truncate text-xs text-foreground-muted">
          {school.adminName ?? school.contactEmail}
          {" · "}
          {school.submittedAt
            ? `submitted ${timeAgo(school.submittedAt, now)}`
            : `added ${timeAgo(school.createdAt, now)}`}
        </p>
      </div>
      {school.resubmittedCount > 0 && <Badge tone="info">Resubmitted</Badge>}
      {action ?? <StatusBadge status={school.approvalStatus} suspended={!school.isActive} />}
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-[var(--radius-card)] lg:col-span-2" />
        <Skeleton className="h-72 rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}

export function SuperAdminDashboard() {
  const { user } = useAuth();
  const { push } = useToast();
  const { refresh: refreshPending } = usePending();
  const [data, setData] = useState<SchoolOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiResponse<SchoolOverview>>("/tenants/overview")
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setNow(Date.now());
        setError(null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof ApiRequestError
              ? err.message
              : "Could not load the dashboard.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => {
    setReloadKey((k) => k + 1);
    refreshPending();
  };

  async function copySignupLink() {
    const url = `${window.location.origin}/signup`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push("error", `Could not copy. The link is ${url}`);
    }
  }

  // "Super Admin" is a title, not a first name, so the platform owner is greeted by the whole name.
  const greetName = user
    ? user.role === "super_admin"
      ? user.name
      : user.name.split(" ")[0]
    : "there";
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(now));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={today}
        title={`${greeting(new Date(now).getHours())}, ${greetName}`}
        description="Schools joining the platform, and what needs your decision."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Invite school
          </Button>
        }
      />

      {error ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </Card>
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Schools"
              value={data.counts.total}
              icon={Building2}
              tone="primary"
              hint="Across every stage"
            />
            <StatCard
              label="Awaiting approval"
              value={data.counts.pending}
              icon={Hourglass}
              tone="warning"
              hint={
                data.counts.pending > 0
                  ? "Needs your decision"
                  : "Nothing waiting"
              }
            />
            <StatCard
              label="Setting up"
              value={data.counts.onboarding + data.counts.invited}
              icon={Clock3}
              tone="info"
              hint={`${data.counts.invited} invited, ${data.counts.onboarding} filling the form`}
            />
            <StatCard
              label="Approved"
              value={data.counts.approved - data.counts.suspended}
              icon={CheckCircle2}
              tone="success"
              hint={
                data.counts.suspended > 0
                  ? `${data.counts.suspended} suspended`
                  : data.counts.rejected > 0
                    ? `${data.counts.rejected} sent back for changes`
                    : "Live on the platform"
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Waiting for your approval</CardTitle>
                  {data.counts.pending > 0 && (
                    <Link
                      href="/super-admin/schools?status=pending"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      See all {data.counts.pending}
                    </Link>
                  )}
                </CardHeader>
                {data.awaiting.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 pb-10 pt-4 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
                      <PartyPopper className="size-6" aria-hidden />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      You are all caught up
                    </p>
                    <p className="max-w-sm text-sm text-foreground-muted">
                      When a school finishes its details and submits, it shows
                      up here and you get an email.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {data.awaiting.map((school) => (
                      <SchoolRow
                        key={school.id}
                        school={school}
                        now={now}
                        action={
                          <Link href={`/super-admin/schools/${school.id}`}>
                            <Button size="sm">
                              Review
                              <ArrowRight className="size-3.5" aria-hidden />
                            </Button>
                          </Link>
                        }
                      />
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recently added</CardTitle>
                  <Link
                    href="/super-admin/schools"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    All schools
                  </Link>
                </CardHeader>
                {data.recent.length === 0 ? (
                  <p className="border-t border-border px-5 py-8 text-center text-sm text-foreground-muted">
                    No schools yet. Invite one, or share the registration link.
                  </p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {data.recent.map((school) => (
                      <SchoolRow key={school.id} school={school} now={now} />
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Where schools are</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.counts.total === 0 ? (
                    <p className="text-sm text-foreground-muted">
                      Nothing to show yet.
                    </p>
                  ) : (
                    <div
                      className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted"
                      role="img"
                      aria-label="Schools by stage"
                    >
                      {STATUS_ORDER.map((status) =>
                        data.counts[status] > 0 ? (
                          <div
                            key={status}
                            className={cn("h-full", SEGMENT_COLOR[status])}
                            style={{
                              width: `${(data.counts[status] / data.counts.total) * 100}%`,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                  )}
                  <ul className="space-y-1">
                    {STATUS_ORDER.map((status) => (
                      <li key={status}>
                        <Link
                          href={`/super-admin/schools?status=${status}`}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"
                        >
                          <span className="flex items-center gap-2 text-foreground-muted">
                            <span
                              className={cn(
                                "size-2.5 rounded-full",
                                SEGMENT_COLOR[status],
                              )}
                              aria-hidden
                            />
                            {STATUS_META[status].label}
                          </span>
                          <span className="font-medium text-foreground">
                            {data.counts[status]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bring schools in</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                    <Send
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Invite by email
                      </p>
                      <p className="text-xs text-foreground-muted">
                        You choose the school; its admin gets a link.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => setInviteOpen(true)}
                      >
                        Invite school
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                    <Link2
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Public registration
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Schools register themselves from the sign-in page, then
                        wait for you.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={copySignupLink}
                      >
                        {copied ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                        {copied ? "Copied" : "Copy registration link"}
                      </Button>
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
                    <Settings2 className="size-3.5" aria-hidden />
                    Every school is reviewed by you before it can use the app.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      <InviteSchoolModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={reload}
      />
    </div>
  );
}
