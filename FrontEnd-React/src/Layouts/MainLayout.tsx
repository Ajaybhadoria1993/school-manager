import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { useAuth } from "../hooks/useAuth";
import { useLiveNotifications } from "../hooks/useLiveNotifications";
import { usePermissionRefresh } from "../hooks/usePermissionRefresh";
import { postLoginPath } from "../utils/postLoginPath";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { YearViewBanner } from "../components/layout/YearViewBanner";
import { NAV_ITEMS, activeNavItem, navVisible, pageTitleOf, pathForMenu } from "../components/layout/nav-config";
import { appearanceStyle, useAppTheme } from "../theme/AppThemeProvider";

/** The signed-in app shell. Everything inside it requires a session and an approved school. */
export default function MainLayout() {
  const { user, tenant, loading, loginPath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const appearance = useAppTheme();
  // New notifications, live on the socket, for the bell in the top bar (docs/notifications.md).
  useLiveNotifications();
  // What the school allowed this person is read again when the window is opened (the Permissions page).
  usePermissionRefresh();

  // The app content has its own scroll pane; reset that pane on page changes just like the old window-level scroll.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  // A school admin whose school is still being set up or waiting for approval belongs on /onboarding.
  const needsOnboarding =
    !!user && postLoginPath(user, tenant) === "/onboarding";

  useEffect(() => {
    if (loading) return;
    if (!user) navigate(loginPath, { replace: true });
    else if (needsOnboarding) navigate("/onboarding", { replace: true });
  }, [loading, user, needsOnboarding, loginPath, navigate]);

  if (loading || !user || needsOnboarding) return <PageSpinner />;

  // A page opened from another menu entry (Add student from Students) keeps that entry lit and its title.
  const active = activeNavItem(pathForMenu(location), NAV_ITEMS.filter((item) => navVisible(item, user)));

  return (
    <div
      data-theme-mode={appearance.mode}
      style={appearanceStyle(appearance)}
      className="app-shell flex h-dvh min-h-0 overflow-hidden bg-background text-foreground print:block print:h-auto print:overflow-visible"
    >
      <div className="h-full print:hidden">
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background print:block">
        <div className="print:hidden">
          <Topbar
            onMenuClick={() => setMobileOpen(true)}
            title={pathname === "/school" ? "School Details" : pageTitleOf(active)}
          />
        </div>
        {/* Only while a year that is over is open (read only): which year it is, and the way back. */}
        <YearViewBanner />
        {/* Full width, like Infinity Medisetu: no empty bands at the left and right of a wide screen. */}
        <main ref={mainRef} className="min-h-0 w-full flex-1 overflow-y-auto p-4 lg:px-8 lg:py-5 print:overflow-visible print:p-0">
          {/* A new key on every page, so each page eases in instead of snapping. */}
          <div key={pathname} className="rise-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
