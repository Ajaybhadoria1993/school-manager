import { useLocation } from "react-router";

/**
 * Where a teacher's pages live: under Teacher (`/teachers`, the menu entry on top) or under Manage school > Manage Teacher
 * (`/school/teachers`). The same page is at both; its links and its breadcrumb stay where it was opened.
 */
export function useTeacherBase(): { base: string; label: string } {
  const { pathname } = useLocation();
  return pathname.startsWith("/teachers") ? { base: "/teachers", label: "Teacher" } : { base: "/school/teachers", label: "Manage Teacher" };
}
