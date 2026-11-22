import { Navigate } from "react-router";

/**
 * The old address of the inactive students (`/school/students/inactive`, 2026-11-22): they are the Inactive tab of the Students page now, so a saved
 * link and the browser's history still land on them.
 */
export default function InactiveStudentsRedirect() {
  return <Navigate to="/school/students?tab=inactive" replace />;
}
