import { MyLeave } from "../../components/leaves/MyLeave";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";

/** My leave (`/my-leave`, 2026-11-24): a teacher or a staff member applies for leave and sees the school's answer. The API says who may (a teacher, a staff member). */
export default function MyLeavePage() {
  return (
    <div className="space-y-6">
      <StudentFormHeader title="My leave" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <MyLeave />
    </div>
  );
}
