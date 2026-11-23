import { Navigate, useSearchParams } from "react-router";

/**
 * The old address of the teachers who left (`/teachers/inactive`, 2026-11-22): they are the Inactive tab of the Teachers page now (`/teachers?status=inactive`),
 * so a saved link and the browser's history still land on them, with the search and the filters the link carried.
 */
export default function InactiveTeachersRedirect() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("status", "inactive");
  return <Navigate to={{ pathname: "/teachers", search: `?${next.toString()}` }} replace />;
}
