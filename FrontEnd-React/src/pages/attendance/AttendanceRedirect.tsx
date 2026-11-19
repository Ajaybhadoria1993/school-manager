import { Navigate, useSearchParams } from "react-router";

const PAGES = new Map([
  ["student", "students"],
  ["teacher", "teachers"],
  ["staff", "staff"],
]);

/**
 * `/attendance` and the old tabs (`?tab=teacher`) lead to the page they are now, with the filters they had, so a bookmark or a link in an
 * old notification still works. Attendance is three pages since 2026-11-10; the plain address opens Student.
 */
export default function AttendanceRedirect() {
  const [params] = useSearchParams();
  const page = PAGES.get(params.get("tab") ?? "") ?? "students";
  const rest = new URLSearchParams(params);
  rest.delete("tab");
  const search = rest.toString();
  return <Navigate to={{ pathname: `/attendance/${page}`, search: search ? `?${search}` : "" }} replace />;
}
