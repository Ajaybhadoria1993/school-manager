import { useAuth } from "../../hooks/useAuth";
import { ParentDashboard } from "../../components/dashboard/ParentDashboard";
import { SchoolDashboard } from "../../components/dashboard/SchoolDashboard";
import { SuperAdminDashboard } from "../../components/dashboard/SuperAdminDashboard";
import { TeacherDashboard } from "../../components/dashboard/TeacherDashboard";

/** One URL, a different home for each kind of user. */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "super_admin") return <SuperAdminDashboard />;
  if (user.role === "parent") return <ParentDashboard />;
  return user.role === "teacher" ? <TeacherDashboard /> : <SchoolDashboard />;
}
