import type { ComponentType } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { RootLayout } from "./RootLayout";

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
          // Manage school: the pages that set the school up. Only the people who run it (the API checks too).
          {
            ...lazyRoute(() => import("./SchoolManagerRoute")),
            children: [
              // School Class: Classes (the menu's first entry) and Students (its second) are one page on two addresses; one class's own page
              // (its students by section) is under Classes. The static "students" wins over ":classId".
              { path: "school-class", ...lazyRoute(() => import("../pages/school/SchoolClass")) },
              { path: "school-class/students", ...lazyRoute(() => import("../pages/school/SchoolClass")) },
              { path: "school-class/:classId", ...lazyRoute(() => import("../pages/school/SchoolClassDetail")) },
              // Teacher (the menu entry on top): every teacher, and each one's page and change form under the same address.
              { path: "teachers", ...lazyRoute(() => import("../pages/teachers/TeacherDirectory")) },
              // Attendance (under Teacher in the menu): the students' of any class and the teachers', in tabs.
              { path: "attendance", ...lazyRoute(() => import("../pages/attendance/AttendancePage")) },
              { path: "school-class/:classId/timetable", ...lazyRoute(() => import("../pages/school/SchoolClassTimetable")) },
              // Staff: the people who work for the school without teaching (a role each, invited by email).
              { path: "staff", ...lazyRoute(() => import("../pages/staff/StaffDirectory")) },
              { path: "teachers/:id", ...lazyRoute(() => import("../pages/school/TeacherDetail")) },
              // Timetable: one page with two tabs (School timings, Class timetables); the school's subjects and teachers are their own pages.
              // The old one-page-per-step addresses lead to the right tab (fixed paths before the ids).
              { path: "school/timetable", ...lazyRoute(() => import("../pages/school/Timetable")) },
              { path: "school/timetable/timings", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/subjects", ...lazyRoute(() => import("../pages/school/TimetableSubjects")) },
              // Teachers used to be a page of the Timetable: the old address leads to the Teachers page.
              { path: "school/timetable/teachers", element: <Navigate to="/school/teachers" replace /> },
              { path: "school/timetable/class-subjects", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/class/:classId/:sectionId", ...lazyRoute(() => import("../pages/school/TimetableRedirect")) },
              { path: "school/timetable/teacher/:teacherId", ...lazyRoute(() => import("../pages/school/TimetableTeacherWeek")) },
              // Teachers: the list, the Add teacher steps, one teacher's page and the change form (fixed paths before ":id").
              { path: "school/teachers", ...lazyRoute(() => import("../pages/school/Teachers")) },
              { path: "school/teachers/:id", ...lazyRoute(() => import("../pages/school/TeacherDetail")) },
              // Test & Exam: the year's exams and tests, and one exam's timetable (which classes write what, when, for how long).
              { path: "school/exams", ...lazyRoute(() => import("../pages/school/Exams")) },
              { path: "school/exams/:id", ...lazyRoute(() => import("../pages/school/ExamDetail")) },
              // Students: the list, the admission form, the bulk upload, the export (the school's fields and Excel layout), one student's page (fixed paths before ":id").
              { path: "school/students", ...lazyRoute(() => import("../pages/school/Students")) },
              { path: "school/students/export", ...lazyRoute(() => import("../pages/school/StudentExport")) },
              { path: "school/students/inactive", ...lazyRoute(() => import("../pages/school/InactiveStudents")) },
              // Pages that only make sense in the running year (adding, changing, uploading, the year's own work): while a year that is over
              // is open they say so and offer the way back (RunningYearRoute), instead of a form the server would refuse at the end. They are:
              // the admission form and the bulk upload, the school's fields, Classes & Sections and a department's own screen ("none" instead of
              // an id is the classes that are in no department), the school's years and the promotion into the next one, and Add / change /
              // upload / fields of the teachers and the staff.
              {
                ...lazyRoute(() => import("./RunningYearRoute")),
                children: [
                  { path: "school/students/new", ...lazyRoute(() => import("../pages/school/StudentAdmit")) },
                  { path: "school/students/import", ...lazyRoute(() => import("../pages/school/StudentImport")) },
                  { path: "teachers/new", ...lazyRoute(() => import("../pages/school/TeacherAdd")) },
                  { path: "teachers/import", ...lazyRoute(() => import("../pages/school/TeacherImport")) },
                  { path: "teachers/fields", ...lazyRoute(() => import("../pages/school/TeacherFields")) },
                  { path: "teachers/:id/edit", ...lazyRoute(() => import("../pages/school/TeacherEdit")) },
                  { path: "staff/new", ...lazyRoute(() => import("../pages/staff/StaffAdd")) },
                  { path: "staff/:id/edit", ...lazyRoute(() => import("../pages/staff/StaffEdit")) },
                  { path: "school/classes", ...lazyRoute(() => import("../pages/school/Classes")) },
                  { path: "school/classes/departments/:departmentId", ...lazyRoute(() => import("../pages/school/DepartmentManage")) },
                  { path: "school/academic-years", ...lazyRoute(() => import("../pages/school/AcademicYears")) },
                  { path: "school/promotion", ...lazyRoute(() => import("../pages/school/Promotion")) },
                  { path: "school/teachers/new", ...lazyRoute(() => import("../pages/school/TeacherAdd")) },
                  { path: "school/teachers/import", ...lazyRoute(() => import("../pages/school/TeacherImport")) },
                  { path: "school/teachers/fields", ...lazyRoute(() => import("../pages/school/TeacherFields")) },
                  { path: "school/teachers/:id/edit", ...lazyRoute(() => import("../pages/school/TeacherEdit")) },
                  { path: "school/students/fields", ...lazyRoute(() => import("../pages/school/ManageFields")) },
                ],
              },
              { path: "school/students/:id",...lazyRoute(() => import("../pages/school/StudentDetail")) },
            ],
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
