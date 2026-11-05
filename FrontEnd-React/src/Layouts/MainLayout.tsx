import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { useAuth } from "../hooks/useAuth";
import { useLiveNotifications } from "../hooks/useLiveNotifications";
import { postLoginPath } from "../utils/postLoginPath";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { activeNavItem } from "../components/layout/nav-config";

/** The signed-in app shell. Everything inside it requires a session and an approved school. */
export default function MainLayout() {
  const { user, tenant, loading, loginPath } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // New notifications, live on the socket, for the bell in the top bar (docs/notifications.md).
  useLiveNotifications();

  // A school admin whose school is still being set up or waiting for approval belongs on /onboarding.
  const needsOnboarding =
    !!user && postLoginPath(user, tenant) === "/onboarding";

  useEffect(() => {
    if (loading) return;
    if (!user) navigate(loginPath, { replace: true });
    else if (needsOnboarding) navigate("/onboarding", { replace: true });
  }, [loading, user, needsOnboarding, loginPath, navigate]);

  if (loading || !user || needsOnboarding) return <PageSpinner />;

  const active = activeNavItem(pathname);

  return (
    <div className="flex min-h-screen bg-background print:block">
      <div className="print:hidden">
        <Sidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Topbar
            onMenuClick={() => setMobileOpen(true)}
            title={active?.label ?? "Dashboard"}
          />
        </div>
        {/* Full width, like Infinity Medisetu: no empty bands at the left and right of a wide screen. */}
        <main className="w-full flex-1 p-4 lg:p-8 print:p-0">
          {/* A new key on every page, so each page eases in instead of snapping. */}
          <div key={pathname} className="rise-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
