import type { ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
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
          { path: "modules/:slug", ...lazyRoute(() => import("../pages/modules/ModulePreview")) },
          { path: "school", ...lazyRoute(() => import("../pages/school/School")) },
          // Manage school: the pages that set the school up. Only the people who run it (the API checks too).
          {
            ...lazyRoute(() => import("./SchoolManagerRoute")),
            children: [
              { path: "school/classes", ...lazyRoute(() => import("../pages/school/Classes")) },
              // A department's own screen; "none" instead of an id is the classes that are in no department.
              { path: "school/classes/departments/:departmentId", ...lazyRoute(() => import("../pages/school/DepartmentManage")) },
              // Students: the list, the admission form, the bulk upload, the export (the school's fields and Excel layout), one student's page (fixed paths before ":id").
              { path: "school/students", ...lazyRoute(() => import("../pages/school/Students")) },
              { path: "school/students/new", ...lazyRoute(() => import("../pages/school/StudentAdmit")) },
              { path: "school/students/import", ...lazyRoute(() => import("../pages/school/StudentImport")) },
              { path: "school/students/export", ...lazyRoute(() => import("../pages/school/StudentExport")) },
              // The school's fields on a page of their own: reachable with no student yet (the Export button needs students).
              { path: "school/students/fields", ...lazyRoute(() => import("../pages/school/ManageFields")) },
              { path: "school/students/:id", ...lazyRoute(() => import("../pages/school/StudentDetail")) },
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
