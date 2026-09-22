"use client";

import { useEffect, useState } from "react";
import { Users, UserCog, CalendarCheck, Wallet, Building2, GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge, transactionStatusTone } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ApiResponse, FeeTransaction, Student } from "@/types";

interface SchoolDashboardData {
  studentCount: number;
  staffCount: number;
  attendanceToday: { present: number; absent: number; totalMarked: number; percentage: number | null };
  feeCollectionThisMonth: number;
  recentTransactions: FeeTransaction[];
}

interface PlatformDashboardData {
  totalTenants: number;
  activeTenants: number;
  totalStudents: number;
  tierBreakdown: { _id: string; count: number }[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [platformData, setPlatformData] = useState<PlatformDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    if (user.role === "super_admin") {
      api
        .get<ApiResponse<PlatformDashboardData>>("/dashboard/platform")
        .then((res) => setPlatformData(res.data))
        .finally(() => setLoading(false));
    } else {
      api
        .get<ApiResponse<SchoolDashboardData>>("/dashboard/school")
        .then((res) => setSchoolData(res.data))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (loading) {
    return <div className="animate-pulse text-sm text-foreground-muted">Loading dashboard…</div>;
  }

  if (user?.role === "super_admin" && platformData) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Platform Overview</h2>
          <p className="text-sm text-foreground-muted">Usage across every onboarded school tenant.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Tenants" value={platformData.totalTenants} icon={Building2} tone="primary" />
          <StatCard label="Active Tenants" value={platformData.activeTenants} icon={Building2} tone="success" />
          <StatCard label="Students Platform-wide" value={platformData.totalStudents} icon={GraduationCap} tone="info" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Subscription Tier Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {platformData.tierBreakdown.length === 0 ? (
              <EmptyState title="No tenants yet" description="Onboard your first school from the Tenants page." />
            ) : (
              <div className="flex flex-wrap gap-3">
                {platformData.tierBreakdown.map((t) => (
                  <Badge key={t._id} tone="primary" className="capitalize">
                    {t._id}: {t.count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!schoolData) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Welcome back, {user?.name.split(" ")[0]}</h2>
        <p className="text-sm text-foreground-muted">Here&apos;s what&apos;s happening at your school today.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Students" value={schoolData.studentCount} icon={Users} tone="primary" />
        <StatCard label="Active Staff" value={schoolData.staffCount} icon={UserCog} tone="info" />
        <StatCard
          label="Attendance Today"
          value={schoolData.attendanceToday.percentage !== null ? `${schoolData.attendanceToday.percentage}%` : "—"}
          icon={CalendarCheck}
          tone="success"
          hint={
            schoolData.attendanceToday.totalMarked
              ? `${schoolData.attendanceToday.present} present / ${schoolData.attendanceToday.absent} absent`
              : "Not marked yet"
          }
        />
        <StatCard
          label="Fee Collected (This Month)"
          value={formatCurrency(schoolData.feeCollectionThisMonth)}
          icon={Wallet}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Fee Transactions</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {schoolData.recentTransactions.length === 0 ? (
            <EmptyState title="No transactions yet" description="Collected fees will show up here." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Student</Th>
                  <Th>Installment</Th>
                  <Th>Amount</Th>
                  <Th>Mode</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </Tr>
              </Thead>
              <tbody>
                {schoolData.recentTransactions.map((t) => {
                  const student = t.studentId as Student;
                  return (
                    <Tr key={t._id}>
                      <Td>{student?.firstName} {student?.lastName}</Td>
                      <Td>{t.installmentName}</Td>
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
  );
}
