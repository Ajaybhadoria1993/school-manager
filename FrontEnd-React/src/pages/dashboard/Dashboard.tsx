import { useAuth } from "../../hooks/useAuth";
import { ParentDashboard } from "../../components/dashboard/ParentDashboard";
import { SchoolDashboard } from "../../components/dashboard/SchoolDashboard";
import { StaffHome } from "../../components/dashboard/StaffHome";
import { SuperAdminDashboard } from "../../components/dashboard/SuperAdminDashboard";
import { TeacherDashboard } from "../../components/dashboard/TeacherDashboard";

/** One URL, a different home for each kind of user. */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "super_admin") return <SuperAdminDashboard />;
  if (user.role === "parent") return <ParentDashboard />;
  if (user.role === "teacher") return <TeacherDashboard />;
  // Staff who work for the school without teaching (Staff > Add staff): their own home until their role is given the school's pages.
  if (user.role === "receptionist" || user.role === "management" || user.role === "staff") return <StaffHome />;
  return <SchoolDashboard />;
}
