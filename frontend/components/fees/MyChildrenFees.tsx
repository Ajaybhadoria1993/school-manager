"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { FeeSummaryCard } from "./FeeSummaryCard";
import { PayOnlineButton } from "./PayOnlineButton";
import { cn, initials } from "@/lib/utils";
import type { ApiResponse, ClassMaster, Section, Student, StudentFeeSummary } from "@/types";

export function MyChildrenFees() {
  const [children, setChildren] = useState<Student[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.get<ApiResponse<Student[]>>("/students/my-children").then((res) => {
      setChildren(res.data);
      setActiveId(res.data[0]?._id ?? "");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    api
      .get<ApiResponse<StudentFeeSummary>>(`/fees/students/${activeId}/summary`)
      .then((res) => setSummary(res.data));
  }, [activeId, refreshKey]);

  if (loading) return <p className="text-sm text-foreground-muted">Loading…</p>;
  if (children.length === 0) {
    return (
      <Card>
        <EmptyState title="No children linked to your account" description="Contact the school office if this looks wrong." />
      </Card>
    );
  }

  const active = children.find((c) => c._id === activeId);
  const nextDue = summary?.installments.find((i) => i.outstanding > 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Fees</h2>
        <p className="text-sm text-foreground-muted">Switch between your children to view and pay fees.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {children.map((child) => (
          <button
            key={child._id}
            onClick={() => setActiveId(child._id)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
              child._id === activeId ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-muted"
            )}
          >
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {initials(`${child.firstName} ${child.lastName}`)}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {child.firstName} {child.lastName}
              </p>
              <p className="text-xs text-foreground-muted">
                {(child.classId as ClassMaster)?.name} - {(child.sectionId as Section)?.name}
              </p>
            </div>
          </button>
        ))}
      </div>

      {nextDue && active && (
        <Card>
          <CardHeader>
            <CardTitle>Pay Now — {nextDue.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-foreground-muted">
              Outstanding amount for {active.firstName}: <span className="font-semibold text-danger">₹{nextDue.outstanding}</span>
            </p>
            <PayOnlineButton
              studentId={active._id}
              installmentName={nextDue.name}
              amount={nextDue.outstanding}
              studentName={active.firstName}
              onPaid={() => setRefreshKey((k) => k + 1)}
            />
          </CardContent>
        </Card>
      )}

      {activeId && <FeeSummaryCard key={`${activeId}-${refreshKey}`} studentId={activeId} />}
    </div>
  );
}
