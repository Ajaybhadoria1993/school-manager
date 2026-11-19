import type { ComponentType } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { RootLayout } from "./RootLayout";
import PermissionRoute from "./PermissionRoute";

/**
 * A route whose page is loaded when it is first visited (its own chunk), so the sign-in page does not
 * download the dashboard, and the landing page does not download the review screens.
 */
const lazyRoute = (load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, "lazy"> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: <PageSpinner />,
    children: [
      // Public pages
      { path: "/", ...lazyRoute(() => import("../pages/landing/LandingPage")) },
      { path: "login", ...lazyRoute(() => import("../pages/auth/Login")) },
      { path: "signup", ...lazyRoute(() => import("../pages/auth/Signup")) },
      { path: "forgot-password", ...lazyRoute(() => import("../pages/auth/ForgotPassword")) },
      { path: "reset-password", ...lazyRoute(() => import("../pages/auth/ResetPassword")) },
      { path: "accept-invite", ...lazyRoute(() => import("../pages/auth/AcceptInvite")) },

      // A school admin whose school is not approved yet: the setup form and the waiting screen
      {
        path: "onboarding",
        ...lazyRoute(() => import("../Layouts/OnboardingLayout")),
        children: [{ index: true, ...lazyRoute(() => import("../pages/onboarding/Onboarding")) }],
      },

      // The signed-in app (needs a session and an approved school)
      {
        ...lazyRoute(() => import("../Layouts/MainLayout")),
        children: [
          { path: "dashboard", ...lazyRoute(() => import("../pages/dashboard/Dashboard")) },
          { path: "settings", ...lazyRoute(() => import("../pages/settings/Settings")) },
          // A signed-in parent's child (their home lists the children; the API answers only for their own).
          { path: "my-children/:id", ...lazyRoute(() => import("../pages/parent/ChildPage")) },
          // The school's holidays and events: everyone of the school sees them; the people who run it change them (the API checks).
          { path: "calendar", ...lazyRoute(() => import("../pages/calendar/CalendarPage")) },
          // Leave sent by parents: a class teacher's classes', or every one for the people who run the school (the API decides).
          { path: "leaves", ...lazyRoute(() => import("../pages/leaves/LeavesPage")) },
          // A class's work: attendance (class teacher, the school), diary and tests (docs/parent-teacher-flow.md); the API checks who.
          { path: "class-work/:classId", ...lazyRoute(() => import("../pages/classwork/ClassWorkPage")) },
          { path: "modules/:slug", ...lazyRoute(() => import("../pages/modules/ModulePreview")) },
          { path: "school", ...lazyRoute(() => import("../pages/school/School")) },
          // The pages of the school's work. The school admin and the principal open them all; anyone else opens the ones the school
          // allowed their kind of person (Permissions, docs/permissions.md): each group below is one or more keys. The API checks too.
          // School-wide setup pages and the legacy teacher-management address, which now redirects into the single Teacher section.
          {
            ...lazyRoute(() => import("./SchoolManagerRoute")),
            children: [
              { path: "attendance", ...lazyRoute(() => import("../pages/attendance/AttendanceRedirect")) },
              { path: "attendance/staff", ...lazyRoute(() => import("../pages/attendance/StaffAttendance")) },
              { path: "permissions", ...lazyRoute(() => import("../pages/permissions/Permissions")) },
              // Keep old bookmarks working while the teacher directory and management now share one page.
              { path: "school/teachers", element: <Navigate to="/teachers" replace /> },
              { path: "school/teachers/export", ...lazyRoute(() => import("../pages/school/TeacherExport")) },
              { path: "school/teachers/:id", ...lazyRoute(() => import("../pages/school/TeacherDetail")) },
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "school/teachers/new", ...lazyRoute(() => import("../pages/school/TeacherAdd")) },
                  { path: "school/teachers/import", ...lazyRoute(() => import("../pages/school/TeacherImport")) },
                  { path: "school/teachers/fields", ...lazyRoute(() => import("../pages/school/TeacherFields")) },
                  { path: "school/teachers/:id/edit", ...lazyRoute(() => import("../pages/school/TeacherEdit")) },
                  { path: "school/teachers/:id/assign-class", ...lazyRoute(() => import("../pages/school/TeacherAssignClass")) },
                ],
              },
            ],
          },

          // Classes: School Class (the menu's Classes and Students are one page on two addresses; one class's own page and its timetable box).
          {
            element: <PermissionRoute keys={["classes.view"]} />,
            children: [
              { path: "school-class", ...lazyRoute(() => import("../pages/school/SchoolClass")) },
              { path: "school-class/students", ...lazyRoute(() => import("../pages/school/SchoolClass")) },
              { path: "school-class/:classId", ...lazyRoute(() => import("../pages/school/SchoolClassDetail")) },
              { path: "school-class/:classId/timetable", ...lazyRoute(() => import("../pages/school/SchoolClassTimetable")) },
            ],
          },
          // Classes & Sections, Academic years and the Promotion: in the running year only (RunningYearRoute says so while a year that is over is open).
          {
            element: <PermissionRoute keys={["classes.manage"]} />,
            children: [
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "school/classes", ...lazyRoute(() => import("../pages/school/Classes")) },
                  { path: "school/classes/departments/:departmentId", ...lazyRoute(() => import("../pages/school/DepartmentManage")) },
                ],
              },
            ],
          },
          {
            element: <PermissionRoute keys={["years.manage"]} />,
            children: [{ ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "school/academic-years", ...lazyRoute(() => import("../pages/school/AcademicYears")) }] }],
          },
          {
            element: <PermissionRoute keys={["promotion.manage"]} />,
            children: [{ ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "school/promotion", ...lazyRoute(() => import("../pages/school/Promotion")) }] }],
          },
          // Timetable (two pages, two menu entries): School timings and Class timetables; the old one-page-per-step addresses lead to the right one.
          {
            element: <PermissionRoute keys={["timetable.edit"]} />,
            children: [
              { path: "school/timings", ...lazyRoute(() => import("../pages/school/SchoolTimings")) },
              { path: "school/timetable", ...lazyRoute(() => import("../pages/school/ClassTimetables")) },
              { path: "school/timetable/timings", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/subjects", ...lazyRoute(() => import("../pages/school/TimetableSubjects")) },
              { path: "school/timetable/teachers", element: <Navigate to="/teachers" replace /> },
              { path: "school/timetable/class-subjects", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/class/:classId/:sectionId", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/teacher/:teacherId", ...lazyRoute(() => import("../pages/school/TimetableTeacherWeek")) },
            ],
          },
          // Test & Exam: the year's exams and tests, and one exam's timetable.
          {
            element: <PermissionRoute keys={["exams.manage"]} />,
            children: [
              { path: "school/exams", ...lazyRoute(() => import("../pages/school/Exams")) },
              { path: "school/exams/:id", ...lazyRoute(() => import("../pages/school/ExamDetail")) },
            ],
          },
          // Teachers: one directory for active and inactive teachers, their school-wide management actions, and teacher details/forms.
          {
            element: <PermissionRoute keys={["teachers.view"]} />,
            children: [
              { path: "teachers/inactive", ...lazyRoute(() => import("../pages/teachers/TeacherDirectory")) },
              { path: "teachers", ...lazyRoute(() => import("../pages/teachers/TeacherDirectory")) },
              { path: "teachers/:id", ...lazyRoute(() => import("../pages/school/TeacherDetail")) },
            ],
          },
          // Export: the Excel's columns and the file before it is made (a closed year can be exported too).
          {
            element: <PermissionRoute keys={["teachers.export"]} />,
            children: [{ path: "teachers/export", ...lazyRoute(() => import("../pages/school/TeacherExport")) }],
          },
          {
            element: <PermissionRoute keys={["teachers.add"]} />,
            children: [
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "teachers/new", ...lazyRoute(() => import("../pages/school/TeacherAdd")) },
                  { path: "teachers/import", ...lazyRoute(() => import("../pages/school/TeacherImport")) },
                ],
              },
            ],
          },
          {
            element: <PermissionRoute keys={["teachers.edit"]} />,
            children: [
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "teachers/:id/edit", ...lazyRoute(() => import("../pages/school/TeacherEdit")) },
                  // Assign class: a page of its own (it was a window), the same permission as Change teacher.
                  { path: "teachers/:id/assign-class", ...lazyRoute(() => import("../pages/school/TeacherAssignClass")) },
                ],
              },
            ],
          },
          {
            element: <PermissionRoute keys={["teachers.settings"]} />,
            children: [{ ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "teachers/fields", ...lazyRoute(() => import("../pages/school/TeacherFields")) }] }],
          },
          // Staff: the people who work for the school without teaching (a role each, with a username and password the school makes).
          {
            element: <PermissionRoute keys={["staff.view"]} />,
            children: [{ path: "staff", ...lazyRoute(() => import("../pages/staff/StaffDirectory")) }],
          },
          {
            element: <PermissionRoute keys={["staff.add"]} />,
            children: [{ ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "staff/new", ...lazyRoute(() => import("../pages/staff/StaffAdd")) }] }],
          },
          {
            element: <PermissionRoute keys={["staff.edit"]} />,
            children: [{ ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "staff/:id/edit", ...lazyRoute(() => import("../pages/staff/StaffEdit")) }] }],
          },
          // Students: the list, a student's page, the admission form, the bulk upload, the inactive list, what the school keeps (fixed paths before ":id").
          {
            element: <PermissionRoute keys={["students.settings"]} />,
            children: [
              { path: "school/students/export", ...lazyRoute(() => import("../pages/school/StudentExport")) },
              { ...lazyRoute(() => import("./RunningYearRoute")), children: [{ path: "school/students/fields", ...lazyRoute(() => import("../pages/school/ManageFields")) }] },
            ],
          },
          {
            element: <PermissionRoute keys={["students.view"]} />,
            children: [
              { path: "school/students", ...lazyRoute(() => import("../pages/school/Students")) },
              { path: "school/students/:id", ...lazyRoute(() => import("../pages/school/StudentDetail")) },
            ],
          },
          {
            element: <PermissionRoute keys={["students.add"]} />,
            children: [
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "school/students/new", ...lazyRoute(() => import("../pages/school/StudentAdmit")) },
                  { path: "school/students/import", ...lazyRoute(() => import("../pages/school/StudentImport")) },
                ],
              },
            ],
          },
          {
            element: <PermissionRoute keys={["students.status"]} />,
            children: [{ path: "school/students/inactive", ...lazyRoute(() => import("../pages/school/InactiveStudents")) }],
          },
          // Transport: vehicles, drivers and attendants, routes (one row of the menu; /transport leads to the first).
          {
            element: <PermissionRoute keys={["transport.view"]} />,
            children: [
              { path: "transport", element: <Navigate to="/transport/vehicles" replace /> },
              { path: "transport/vehicles", ...lazyRoute(() => import("../pages/transport/Vehicles")) },
              { path: "transport/drivers", ...lazyRoute(() => import("../pages/transport/Drivers")) },
              { path: "transport/routes", ...lazyRoute(() => import("../pages/transport/Routes")) },
            ],
          },
          // Fees (set-up only): the fee chart of each class, the list of fees, the concessions, the fee rules (one row of the menu; /fees leads to the first).
          {
            element: <PermissionRoute keys={["fees.view"]} />,
            children: [
              { path: "fees", element: <Navigate to="/fees/structure" replace /> },
              { path: "fees/structure", ...lazyRoute(() => import("../pages/fees/FeeStructure")) },
              { path: "fees/heads", ...lazyRoute(() => import("../pages/fees/FeeHeads")) },
              { path: "fees/concessions", ...lazyRoute(() => import("../pages/fees/Concessions")) },
              { path: "fees/rules", ...lazyRoute(() => import("../pages/fees/FeeRules")) },
            ],
          },
          {
            element: <PermissionRoute keys={["attendance.view"]} />,
            children: [{ path: "attendance/students", ...lazyRoute(() => import("../pages/attendance/StudentAttendance")) }],
          },
          {
            element: <PermissionRoute keys={["attendance.teachers"]} />,
            children: [{ path: "attendance/teachers", ...lazyRoute(() => import("../pages/attendance/TeacherAttendance")) }],
          },
          {
            path: "super-admin",
            ...lazyRoute(() => import("./SuperAdminRoute")),
            children: [
              { path: "schools", ...lazyRoute(() => import("../pages/superAdmin/Schools")) },
              { path: "schools/:id", ...lazyRoute(() => import("../pages/superAdmin/SchoolReview")) },
            ],
          },
        ],
      },

      { path: "*", ...lazyRoute(() => import("../pages/NotFound")) },
    ],
  },
];

export const router = createBrowserRouter(routes);
