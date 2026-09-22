"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, TrendingUp, AlertTriangle, Settings2, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge, transactionStatusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MyChildrenFees } from "@/components/fees/MyChildrenFees";
import type { ApiResponse, FeeTransaction, Student } from "@/types";

interface FeeDashboardData {
  collectedTotal: number;
  byMode: { _id: string; total: number; count: number }[];
  byStatus: { _id: string; total: number; count: number }[];
  recentTransactions: FeeTransaction[];
}

interface OutstandingRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  className: string;
  outstanding: number;
  overdueInstallments: string[];
  carriedForwardFromPriorYear?: boolean;
}

const SETUP_ROLES = ["super_admin", "school_admin", "accountant"];

export default function FeesPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<FeeDashboardData | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role === "parent") return;
    setLoading(true);
    Promise.all([
      api.get<ApiResponse<FeeDashboardData>>("/fees/dashboard"),
      api.get<ApiResponse<OutstandingRow[]>>("/fees/reports/outstanding"),
    ]).then(([dashRes, outRes]) => {
      setDashboard(dashRes.data);
      setOutstanding(outRes.data);
      setLoading(false);
    });
  }, [user]);

  if (user?.role === "parent") {
    return <MyChildrenFees />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Fee Management</h2>
          <p className="text-sm text-foreground-muted">Collection overview, outstanding dues and fee setup.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user && SETUP_ROLES.includes(user.role) && (
            <Link href="/fees/refunds">
              <Button variant="outline">
                <Undo2 className="size-4" />
                Refunds
              </Button>
            </Link>
          )}
          {user && SETUP_ROLES.includes(user.role) && (
            <Link href="/fees/structures">
              <Button variant="outline">
                <Settings2 className="size-4" />
                Fee Structure Setup
              </Button>
            </Link>
          )}
        </div>
      </div>

      {loading || !dashboard ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Collected" value={formatCurrency(dashboard.collectedTotal)} icon={Wallet} tone="success" />
            <StatCard
              label="Outstanding (Active Students)"
              value={formatCurrency(outstanding.reduce((s, o) => s + o.outstanding, 0))}
              icon={AlertTriangle}
              tone="danger"
            />
            <StatCard
              label="Transactions Recorded"
              value={dashboard.byStatus.reduce((s, x) => s + x.count, 0)}
              icon={TrendingUp}
              tone="info"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Outstanding Dues</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {outstanding.length === 0 ? (
                  <EmptyState title="No outstanding dues" description="Every active student is fully paid up." />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Student</Th>
                        <Th>Class</Th>
                        <Th>Outstanding</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {outstanding.slice(0, 10).map((row) => (
                        <Tr key={row.studentId}>
                          <Td>
                            <Link href={`/students/${row.studentId}`} className="font-medium text-primary hover:underline">
                              {row.name}
                            </Link>
                            <p className="text-xs text-foreground-muted">{row.admissionNumber}</p>
                          </Td>
                          <Td>{row.className}</Td>
                          <Td className="font-medium text-danger">
                            {formatCurrency(row.outstanding)}
                            {row.overdueInstallments.length > 0 && (
                              <Badge tone="danger" className="ml-2">
                                Overdue
                              </Badge>
                            )}
                            {row.carriedForwardFromPriorYear && (
                              <Badge tone="warning" className="ml-1.5">
                                From prior year
                              </Badge>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {dashboard.recentTransactions.length === 0 ? (
                  <EmptyState title="No transactions yet" />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Student</Th>
                        <Th>Amount</Th>
                        <Th>Mode</Th>
                        <Th>Status</Th>
                        <Th>Date</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {dashboard.recentTransactions.map((t) => {
                        const student = t.studentId as Student;
                        return (
                          <Tr key={t._id}>
                            <Td>
                              {student?.firstName} {student?.lastName}
                            </Td>
                            <Td>{formatCurrency(t.amount)}</Td>
                            <Td className="capitalize">{t.mode}</Td>
                            <Td>
                              <Badge tone={transactionStatusTone[t.status]} className="capitalize">
                                {t.status}
                              </Badge>
                            </Td>
                            <Td>{formatDate(t.createdAt)}</Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
