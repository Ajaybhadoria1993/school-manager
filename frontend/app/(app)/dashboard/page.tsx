"use client";

import { useAuth } from "@/lib/auth-context";
import { SchoolDashboard } from "@/components/dashboard/SchoolDashboard";
import { SuperAdminDashboard } from "@/components/dashboard/SuperAdminDashboard";

/** One URL, a different home for each kind of user. */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "super_admin" ? <SuperAdminDashboard /> : <SchoolDashboard />;
}
