import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { PageSpinner } from "../components/shared/PageSpinner";
import { useAuth } from "../hooks/useAuth";
import { useLiveNotifications } from "../hooks/useLiveNotifications";
import { usePermissionRefresh } from "../hooks/usePermissionRefresh";
import { postLoginPath } from "../utils/postLoginPath";
import { Sidebar } from "../components/layout/Sidebar";
import { FooterSlotContext } from "../components/layout/FooterSlot";
import { FormBarSlotContext } from "../components/layout/FormBarSlot";
import { Topbar } from "../components/layout/Topbar";
import { YearViewBanner } from "../components/layout/YearViewBanner";
import { NAV_ITEMS, activeNavItem, navVisible, pageTitleOf, pathForMenu } from "../components/layout/nav-config";
import { appearanceStyle, useAppTheme } from "../theme/AppThemeProvider";
import { ThemeScope } from "../theme/themeScope";
import { useRootTheme } from "../theme/useRootTheme";

/** The signed-in app shell. Everything inside it requires a session and an approved school. */
export default function MainLayout() {
  const { user, tenant, loading, loginPath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // Where a form's bar of buttons stands (see FormBarSlot): the last thing in the scroll pane, always at its bottom.
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  // The strip under the scroll pane (see FooterSlot): a page's own buttons stand there, outside what scrolls.
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  const appearance = useAppTheme();
  // A look other than Classic also colours the dialogs and dropdowns, which are drawn outside this shell.
  useRootTheme(appearance.theme);
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

  const shell = (
    <div
      data-theme={appearance.theme}
      data-theme-mode={appearance.theme === "classic" ? appearance.mode : "light"}
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
        <FormBarSlotContext.Provider value={barSlot}>
          <FooterSlotContext.Provider value={footerSlot}>
          <main ref={mainRef} className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-4 lg:px-8 lg:py-5 print:block print:overflow-visible print:p-0">
            {/* A new key on every page, so each page eases in instead of snapping. */}
            <div key={pathname} className="rise-in shrink-0">
              <Outlet />
            </div>
            {/* The bar of a form's buttons (student forms): pushed to the bottom of the pane when the page is short and kept there while
                it scrolls (`sticky`), at the same distance from the edge as the pane's own padding, so it never jumps at the end of the
                page. The fade under it hides the form's lines where they pass behind. Empty, it takes no room. */}
            <div
              ref={setBarSlot}
              className="sticky bottom-4 z-20 mt-auto pt-4 empty:hidden lg:bottom-5 print:hidden before:pointer-events-none before:absolute before:-inset-x-4 before:-top-3 before:-bottom-4 before:-z-10 before:bg-gradient-to-t before:from-background before:from-70% before:to-transparent lg:before:-inset-x-8 lg:before:-bottom-5"
            />
          </main>
          </FooterSlotContext.Provider>
        </FormBarSlotContext.Provider>
        {/* The strip under the scroll pane: the pane ends above it, so a page's buttons put here never have the page passing behind them and
            do not move when it scrolls. No background of its own (the page's shows), and no room when it is empty. Its right edge is where
            the page's cards end (the pane's padding and its scrollbar). */}
        <div ref={setFooterSlot} className="shrink-0 px-4 pb-3 pt-2 empty:hidden lg:pl-8 lg:pr-12 print:hidden" />
      </div>
    </div>
  );

  // The boxes and the menu inside read the look from this scope (CSS reads it from the data-theme above).
  return <ThemeScope theme={appearance.theme}>{shell}</ThemeScope>;
}
