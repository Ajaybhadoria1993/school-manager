import { useAuth } from "../../hooks/useAuth";
import { FULL_ACCESS_ROLES, can } from "../../utils/permissions";
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
  // The school admin and the principal: the school's dashboard. Anyone else who works for the school without teaching (Staff > Add staff, the
  // accountant...): the school's dashboard when the school gave them it (Permissions), else their own home with the pages they may open.
  if (!FULL_ACCESS_ROLES.includes(user.role) && !can(user, "dashboard.view")) return <StaffHome />;
  return <SchoolDashboard />;
}
